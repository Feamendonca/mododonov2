import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  listMetas, getMeta, createMeta, updateMeta,
  listMedidas, createMedida, updateMedida, deleteMedida, upsertProgresso,
} from "../db-metas";
import { createActionPlan, getActionPlans } from "../db";
import { actionPlans } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import { realizadoPorIndicador, INDICADORES_COMPUTAVEIS, avaliarAtingimento } from "../db-metas-auto";

export const metasRouter = router({
  // ─── Metas ────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({ lojaId: z.number(), mes: z.number().optional(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const metas = await listMetas(input.lojaId, input.mes, input.ano);
      // Calcular realizado automático para o período (se mes/ano fornecidos)
      let realizado: Awaited<ReturnType<typeof realizadoPorIndicador>> = null;
      if (input.mes != null && input.ano != null) {
        const period = `${input.ano}-${String(input.mes).padStart(2, "0")}`;
        try {
          realizado = await realizadoPorIndicador(input.lojaId, period);
        } catch {
          // falha silenciosa — progresso manual continua funcionando
        }
      }
      // Para cada meta, carregar medidas com progresso e enriquecer auto
      for (const meta of metas) {
        const medidas = await listMedidas(meta.id, input.mes, input.ano);
        // Enriquecer medidas computáveis com realizado automático
        if (realizado != null && input.mes != null && input.ano != null) {
          for (const medida of medidas) {
            if (!INDICADORES_COMPUTAVEIS.has(medida.indicador)) continue;
            const valorRealizado = realizado[medida.indicador as keyof typeof realizado];
            if (valorRealizado == null) continue;
            const atingida = medida.metaValor != null
              ? avaliarAtingimento(valorRealizado, medida.metaValor, medida.metaOperador)
              : false;
            // Persistir progresso auto (idempotente — upsertProgresso usa ON DUPLICATE KEY)
            try {
              await upsertProgresso({
                medidaId: medida.id,
                mes: input.mes,
                ano: input.ano,
                valorAtual: valorRealizado,
                atingida,
                observacao: null, // não sobrescreve observações manuais existentes
              });
            } catch {
              // falha silenciosa — não bloquear a listagem
            }
            // Injetar no payload (sem precisar re-buscar do banco)
            medida.progresso = {
              id: medida.progresso?.id ?? 0,
              medidaId: medida.id,
              mes: input.mes,
              ano: input.ano,
              valorAtual: valorRealizado,
              atingida,
              observacao: medida.progresso?.observacao ?? null,
              updatedAt: Date.now(),
            };
            // Marcar fonte para o frontend distinguir auto de manual
            (medida as any).fonteProgresso = "auto";
          }
        }
        meta.medidas = medidas;
      }
      return metas;
    }),

  create: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      mes: z.number(),
      ano: z.number(),
      titulo: z.string().min(1),
      valorMeta: z.number().nullable().optional(),
      unidade: z.string().optional(),
      descricao: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createMeta(input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().optional(),
      valorMeta: z.number().nullable().optional(),
      unidade: z.string().optional(),
      descricao: z.string().nullable().optional(),
      status: z.enum(["ativa", "arquivada"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateMeta(id, data);
      return { ok: true };
    }),

  // ─── Medidas de Direção ───────────────────────────────────────────────────
  listMedidas: protectedProcedure
    .input(z.object({ metaId: z.number(), mes: z.number().optional(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      return listMedidas(input.metaId, input.mes, input.ano);
    }),

  createMedida: protectedProcedure
    .input(z.object({
      metaId: z.number(),
      lojaId: z.number(),
      titulo: z.string().min(1),
      descricao: z.string().nullable().optional(),
      indicador: z.string().optional(),
      metaValor: z.number().nullable().optional(),
      metaOperador: z.enum(["gte", "lte", "eq"]).optional(),
      unidade: z.string().optional(),
      pesoRemuneracaoPct: z.number().min(0).max(100).optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createMedida(input);
      return { id };
    }),

  updateMedida: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().optional(),
      descricao: z.string().nullable().optional(),
      indicador: z.string().optional(),
      metaValor: z.number().nullable().optional(),
      metaOperador: z.enum(["gte", "lte", "eq"]).optional(),
      unidade: z.string().optional(),
      pesoRemuneracaoPct: z.number().min(0).max(100).optional(),
      ordem: z.number().optional(),
      ativa: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateMedida(id, data);
      return { ok: true };
    }),

  deleteMedida: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMedida(input.id);
      return { ok: true };
    }),

  // ─── Integração com Plano de Ação ──────────────────────────────────────────
  gerarAcoesPlano: protectedProcedure
    .input(z.object({
      medidaId: z.number(),
      lojaId: z.number(),
      tituleMedida: z.string(),
      descricaoMedida: z.string().optional(),
      indicador: z.string().optional(),
      metaValor: z.number().nullable().optional(),
      unidade: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Usar IA para gerar sugestões de ações
      const prompt = `Você é um consultor especialista em gestão de restaurantes.

Uma loja definiu a seguinte Medida de Direção:
- Título: ${input.tituleMedida}
- Descrição: ${input.descricaoMedida ?? "N/A"}
- Indicador: ${input.indicador ?? "N/A"}
- Meta: ${input.metaValor ?? "N/A"} ${input.unidade ?? ""}

Gere exatamente 3 ações práticas e específicas que o gerente deve executar para atingir essa medida.
Cada ação deve ser concreta, mensurável e executavel em até 30 dias.

Responda APENAS com JSON no formato:
{
  "acoes": [
    { "descricao": "...", "motivo": "...", "categoria": "cmv|experience|revenue|people|discipline|other", "prazo_dias": 7 },
    ...
  ]
}`;

      let acoesSugeridas: Array<{ descricao: string; motivo: string; categoria: string; prazo_dias: number }> = [];

      try {
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um consultor de restaurantes. Responda apenas com JSON válido." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" } as any,
        });
        const raw = resp.choices?.[0]?.message?.content;
        const content = typeof raw === "string" ? raw : "{}";
        const parsed = JSON.parse(content);
        acoesSugeridas = parsed.acoes ?? [];
      } catch {
        // fallback: 3 ações genéricas
        acoesSugeridas = [
          { descricao: `Analisar indicadores de ${input.tituleMedida}`, motivo: "Entender o ponto de partida", categoria: "other", prazo_dias: 3 },
          { descricao: `Definir plano de melhoria para ${input.tituleMedida}`, motivo: "Estruturar as ações necessárias", categoria: "other", prazo_dias: 7 },
          { descricao: `Acompanhar resultado semanal de ${input.tituleMedida}`, motivo: "Garantir evolução contínua", categoria: "other", prazo_dias: 30 },
        ];
      }

      // Criar as ações no Plano de Ação
      const hoje = new Date();
      const ids: number[] = [];
      for (const acao of acoesSugeridas) {
        const dueDate = new Date(hoje);
        dueDate.setDate(dueDate.getDate() + (acao.prazo_dias ?? 14));
        const validCats = ["cmv", "experience", "revenue", "people", "discipline", "other"];
        const cat = validCats.includes(acao.categoria) ? acao.categoria : "other";
        const id = await createActionPlan({
          storeId: input.lojaId,
          category: cat as any,
          description: acao.descricao,
          reason: `Medida de Direção: ${input.tituleMedida}. ${acao.motivo}`,
          dueDate: dueDate.toISOString().slice(0, 10),
          status: "todo",
          isSuggestion: true,
          medidaId: input.medidaId,  // FK rastreável — liga ação à medida que a originou
        });
        ids.push(id);
      }

      return { ids, total: ids.length };
    }),

  // ─── Progresso ────────────────────────────────────────────────────────────
  /** Lista action_plans vinculados a uma medida específica */
  acoesDaMedida: protectedProcedure
    .input(z.object({ medidaId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(actionPlans)
        .where(eq(actionPlans.medidaId, input.medidaId))
        .orderBy(actionPlans.createdAt);
    }),

  registrarProgresso: protectedProcedure
    .input(z.object({
      medidaId: z.number(),
      mes: z.number(),
      ano: z.number(),
      valorAtual: z.number().nullable(),
      atingida: z.boolean(),
      observacao: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertProgresso(input);
      return { ok: true };
    }),
});
