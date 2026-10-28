import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { assertPodeAcessarLoja } from "../auth-helpers";
import {
  getOrcamentoAtivo,
  getOrcamentoById,
  listOrcamentos,
  listAllOrcamentos,
  listOrcamentosByStoreIds,
  saveOrcamento,
  proporOrcamento,
  calcularOrcamento,
  getMetaDiaria,
  listLinhasCustom,
  createLinhaCustom,
  updateLinhaCustom,
  deleteLinhaCustom,
  type SaveOrcamentoInput,
} from "../db-orcamento";
import { getDb, getStoreById } from "../db";
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";
import {
  extrairGruposPorMes,
  proporOrcamento as proporOrcamentoDeterministico,
  calcularDre,
  type GrupoDreMes,
  type RascunhoOrcamento,
} from "../orcamento-proposta";
import { gerarSugestaoIA } from "../orcamento-ia";
import { storageDownload, storageGetPresignedPutUrl } from "../storage";
import { listFolderFiles, pickLatestDre, downloadSpFile } from "../sharepoint";
import {
  upsertOrcamentoRascunho,
  aprovarOrcamento as aprovarOrcamentoRascunho,
  registrarDecisao as registrarDecisaoOrcamento,
  getMetasDiarias,
} from "../db-orcamento-v2";

/** Dias de operação padrão usado só para a PRÉVIA de `proporDaDre` (metaDiaria).
 * Não é um valor financeiro gravado em lugar nenhum — é apenas o divisor usado
 * para a estimativa de meta diária mostrada na tela de confirmação; o gerente
 * ajusta/confirma os números reais antes de `salvarRascunho`. */
const DIAS_OPERACAO_PREVIEW = 30;

const tipoValorSchema = z.enum(["fixo", "percentual"]);

const colaboradorSchema = z.object({
  funcao: z.string().min(1),
  quantidade: z.number().int().min(1),
  salarioBase: z.number().min(0),
  ordem: z.number().int().min(0),
});

const orcamentoInputSchema = z.object({
  storeId: z.number().int(),
  periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(["mensal", "trimestral", "anual"]),
  receitaBruta: z.number().min(0),
  ticketMedio: z.number().min(0).nullable().optional(),
  diasOperacao: z.number().int().min(1).max(31),
  taxaCartaoPct: z.number().min(0), taxaCartaoTipo: tipoValorSchema.default("percentual"),
  taxaDeliveryPct: z.number().min(0), taxaDeliveryTipo: tipoValorSchema.default("percentual"),
  impostosPct: z.number().min(0), impostosTipo: tipoValorSchema.default("percentual"),
  cmvPct: z.number().min(0), cmvTipo: tipoValorSchema.default("percentual"),
  royaltiesPct: z.number().min(0), royaltiesTipo: tipoValorSchema.default("percentual"),
  fundoMarketingPct: z.number().min(0), fundoMarketingTipo: tipoValorSchema.default("percentual"),
  // Ocupação
  aluguel: z.number().min(0), aluguelTipo: tipoValorSchema.default("fixo"),
  condominio: z.number().min(0), condominioTipo: tipoValorSchema.default("fixo"),
  energia: z.number().min(0), energiaTipo: tipoValorSchema.default("fixo"),
  gas: z.number().min(0), gasTipo: tipoValorSchema.default("fixo"),
  agua: z.number().min(0), aguaTipo: tipoValorSchema.default("fixo"),
  outrosOcupacao: z.number().min(0), outrosOcupacaoTipo: tipoValorSchema.default("fixo"),
  // Serviços
  contabilidade: z.number().min(0), contabilidadeTipo: tipoValorSchema.default("fixo"),
  sistemas: z.number().min(0), sistemasTipo: tipoValorSchema.default("fixo"),
  sanitarismo: z.number().min(0), sanitarismoTipo: tipoValorSchema.default("fixo"),
  outrosServicos: z.number().min(0), outrosServicosTipo: tipoValorSchema.default("fixo"),
  // Financeiras
  juros: z.number().min(0), jurosTipo: tipoValorSchema.default("fixo"),
  tarifasBancarias: z.number().min(0), tarifasBancariasTipo: tipoValorSchema.default("fixo"),
  // Outras
  marketing: z.number().min(0), marketingTipo: tipoValorSchema.default("fixo"),
  outrasDespesas: z.number().min(0), outrasDespesasTipo: tipoValorSchema.default("fixo"),
  proLabore: z.number().min(0), proLaboreTipo: tipoValorSchema.default("fixo"),
  encargosPct: z.number().min(0), encargosTipo: tipoValorSchema.default("percentual"),
  notas: z.string().nullable().optional(),
  colaboradores: z.array(colaboradorSchema),
});

export const orcamentoRouter = router({
  // ── Orçamento principal ──────────────────────────────────────────────────

  getAtivo: protectedProcedure
    .input(z.object({ storeId: z.number().int() }))
    .query(async ({ input }) => getOrcamentoAtivo(input.storeId)),

  list: protectedProcedure
    .input(z.object({ storeId: z.number().int() }))
    .query(async ({ input }) => listOrcamentos(input.storeId)),

  // Lista todos os orçamentos visíveis para o usuário logado:
  // - admin: todos os orçamentos de todas as lojas
  // - supervisor: orçamentos das lojas vinculadas
  // - gerente/user: orçamentos da loja selecionada
  listGeral: protectedProcedure
    .input(z.object({ storeId: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") {
        return listAllOrcamentos();
      }
      if (ctx.user.role === "supervisor") {
        const db = await getDb();
        if (!db) return [];
        const [rows] = await (db as any).$client.promise().execute(
          `SELECT storeId FROM supervisor_stores WHERE supervisorId = ?`,
          [ctx.user.id]
        );
        const storeIds = (rows as any[]).map((r: any) => r.storeId as number);
        if (storeIds.length === 0) return [];
        return listOrcamentosByStoreIds(storeIds);
      }
      // gerente/user: apenas a loja selecionada
      const sid = input.storeId ?? 0;
      if (sid === 0) return [];
      const list = await listOrcamentos(sid);
      return list.map((o) => ({ ...o, storeName: "" }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const orc = await getOrcamentoById(input.id);
      if (!orc) throw new TRPCError({ code: "NOT_FOUND" });
      // Validar que o orçamento pertence a uma loja acessível ao usuário
      // (o id vem da URL — é input do usuário, precisa ser validado)
      try {
        await assertPodeAcessarLoja(ctx, orc.storeId);
      } catch {
        // Retornar NOT_FOUND genérico para não vazar informação de existência
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return orc;
    }),

  calcular: protectedProcedure
    .input(
      z.object({
        orc: orcamentoInputSchema.omit({ storeId: true, periodoInicio: true, periodoFim: true }),
        colaboradores: z.array(colaboradorSchema),
        linhasCustom: z.array(z.object({
          id: z.number(),
          lojaId: z.number(),
          grupoId: z.string(),
          label: z.string(),
          valor: z.number(),
          tipo: tipoValorSchema,
          origem: z.string().nullable().optional(),
          ordem: z.number(),
          mes: z.string(),
        })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const orcData = {
        storeId: 0, periodoInicio: "", periodoFim: "",
        tipo: input.orc.tipo, status: "rascunho" as const,
        receitaBruta: input.orc.receitaBruta,
        ticketMedio: input.orc.ticketMedio ?? null,
        diasOperacao: input.orc.diasOperacao,
        taxaCartaoPct: input.orc.taxaCartaoPct, taxaCartaoTipo: input.orc.taxaCartaoTipo,
        taxaDeliveryPct: input.orc.taxaDeliveryPct, taxaDeliveryTipo: input.orc.taxaDeliveryTipo,
        impostosPct: input.orc.impostosPct, impostosTipo: input.orc.impostosTipo,
        cmvPct: input.orc.cmvPct, cmvTipo: input.orc.cmvTipo,
        royaltiesPct: input.orc.royaltiesPct, royaltiesTipo: input.orc.royaltiesTipo,
        fundoMarketingPct: input.orc.fundoMarketingPct, fundoMarketingTipo: input.orc.fundoMarketingTipo,
        aluguel: input.orc.aluguel, aluguelTipo: input.orc.aluguelTipo,
        condominio: input.orc.condominio, condominioTipo: input.orc.condominioTipo,
        energia: input.orc.energia, energiaTipo: input.orc.energiaTipo,
        gas: input.orc.gas, gasTipo: input.orc.gasTipo,
        agua: input.orc.agua, aguaTipo: input.orc.aguaTipo,
        outrosOcupacao: input.orc.outrosOcupacao, outrosOcupacaoTipo: input.orc.outrosOcupacaoTipo,
        contabilidade: input.orc.contabilidade, contabilidadeTipo: input.orc.contabilidadeTipo,
        sistemas: input.orc.sistemas, sistemasTipo: input.orc.sistemasTipo,
        sanitarismo: input.orc.sanitarismo, sanitarismoTipo: input.orc.sanitarismoTipo,
        outrosServicos: input.orc.outrosServicos, outrosServicosTipo: input.orc.outrosServicosTipo,
        juros: input.orc.juros, jurosTipo: input.orc.jurosTipo,
        tarifasBancarias: input.orc.tarifasBancarias, tarifasBancariasTipo: input.orc.tarifasBancariasTipo,
        marketing: input.orc.marketing, marketingTipo: input.orc.marketingTipo,
        outrasDespesas: input.orc.outrasDespesas, outrasDespesasTipo: input.orc.outrasDespesasTipo,
        proLabore: input.orc.proLabore, proLaboreTipo: input.orc.proLaboreTipo,
        encargosPct: input.orc.encargosPct, encargosTipo: input.orc.encargosTipo,
        notas: null, aprovadoPor: null, aprovadoEm: null,
      };
      return calcularOrcamento(
        orcData,
        input.colaboradores.map((c, i) => ({ ...c, id: i, orcamentoId: 0 })),
        (input.linhasCustom ?? []).map((l) => ({ ...l, origem: l.origem ?? null }))
      );
    }),

  save: protectedProcedure
    .input(orcamentoInputSchema.extend({ id: z.number().int().optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { id, ...rest } = input;
      let orcId: number;
      try {
        orcId = await saveOrcamento(rest as SaveOrcamentoInput, id);
      } catch (err: any) {
        if (err?.message?.startsWith('CONFLICT:')) {
          throw new TRPCError({ code: "CONFLICT", message: err.message.replace('CONFLICT: ', '') });
        }
        throw err;
      }
      return { id: orcId };
    }),

  propor: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      // Busca o storeId do orçamento para validar posse antes de propor
      const orc = await getOrcamentoById(input.id);
      if (!orc) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado." });
      await assertPodeAcessarLoja(ctx, orc.storeId);
      await proporOrcamento(input.id);
      return { ok: true };
    }),

  metaDiaria: protectedProcedure
    .input(z.object({ storeId: z.number().int(), data: z.string() }))
    .query(async ({ input }) => getMetaDiaria(input.storeId, input.data)),

  // ── Upload da DRE (Task 9, Fase B) ───────────────────────────────────────
  // URL assinada de upload direto ao Supabase Storage (bypass do backend) —
  // o cliente faz PUT direto nessa URL e depois chama `proporDaDre` com a
  // `storageKey` devolvida aqui.
  getUploadUrl: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1),
      contentType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
      const CT_MAP: Record<string, string> = {
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
        xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
        xls: "application/vnd.ms-excel",
        csv: "text/csv",
      };
      const contentType = input.contentType ?? CT_MAP[ext] ?? "application/octet-stream";
      const { uploadUrl, key } = await storageGetPresignedPutUrl(
        `orcamento/${Date.now()}_${input.fileName}`,
        contentType
      );
      return { uploadUrl, storageKey: key };
    }),

  // ── Fluxo propor→confirmar→salvar (Task 4, Fase B) ──────────────────────
  // A IA/parser PROPÕE (determinístico, sem IA de fato — ver orcamento-proposta.ts)
  // e NUNCA grava. Só `salvarRascunho` grava, e só os campos que o gerente
  // confirmou/editou (null continua null; nada de default/benchmark).

  proporDaDre: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      storageKey: z.string(),
      fileName: z.string(),
      meses: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const buf = await storageDownload(input.storageKey);
      const gruposPorMes = extrairGruposPorMes(buf, input.fileName, undefined, input.meses);
      const rascunho = proporOrcamentoDeterministico(gruposPorMes);
      const dre = calcularDre(rascunho, DIAS_OPERACAO_PREVIEW);
      return { rascunho, dre };
    }),

  // ── Importação direto do SharePoint (Task S3) ───────────────────────────
  // Igual a `proporDaDre`, mas a origem dos bytes é a pasta de DRE configurada
  // na loja (SharePoint, via Graph) em vez de um upload manual. NÃO grava nada.
  importarDoSharePoint: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      meses: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);

      const store = await getStoreById(input.storeId);
      if (!store?.dreSharepointUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Loja sem pasta de DRE configurada no SharePoint.",
        });
      }

      const files = await listFolderFiles(store.dreSharepointUrl);
      const alvo = pickLatestDre(files, store.dreFileFilter ?? undefined);
      if (!alvo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhuma DRE (.xlsx) encontrada na pasta configurada.",
        });
      }

      const buf = await downloadSpFile(alvo);
      const gruposPorMes = extrairGruposPorMes(buf, alvo.name, undefined, input.meses ?? 3);
      const rascunho = proporOrcamentoDeterministico(gruposPorMes);
      const dre = calcularDre(rascunho, DIAS_OPERACAO_PREVIEW);

      return {
        rascunho,
        dre,
        fonte: { nome: alvo.name, data: alvo.lastModifiedDateTime },
      };
    }),

  // Camada de IA aditiva (Task 8, Fase B): a IA SUGERE ajustes e APONTA
  // alavancas fracas por cima do rascunho determinístico — ela NÃO lê
  // planilha (recebe `historico`/`rascunho` já extraídos pelo cliente a
  // partir de `proporDaDre`) e NÃO grava nada. Fallback silencioso embutido
  // em `gerarSugestaoIA`: qualquer erro de LLM vira `{sugestoes:{},
  // alavancasFracas:[]}`, sem lançar — o rascunho determinístico continua
  // de pé mesmo se a IA cair.
  sugestaoIA: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      historico: z.array(z.any()),
      rascunho: z.any(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return gerarSugestaoIA({
        historico: input.historico as GrupoDreMes[],
        rascunho: input.rascunho as RascunhoOrcamento,
      });
    }),

  salvarRascunho: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      periodoInicio: z.string(),
      // z.boolean() cobre `emAtencao` (coluna BOOLEAN) — Task 9: a tela grava
      // o em-atenção calculado em `proporOrcamento` junto do rascunho.
      campos: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { id } = await upsertOrcamentoRascunho({
        storeId: input.storeId,
        periodoInicio: input.periodoInicio,
        campos: input.campos,
      });
      return { id };
    }),

  // Aprovação do rascunho (Task 5, Fase B): só admin ou supervisor (regional)
  // aprova — gerente comum NÃO aprova. Usa `protectedProcedure` (não
  // `adminProcedure`) porque supervisor também é permitido; a checagem de
  // papel é explícita aqui. NÃO recalcula valores — só muda status/aprovador.
  aprovarRascunho: protectedProcedure
    .input(z.object({ orcamentoId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "supervisor") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Só admin ou regional aprova orçamento" });
      }
      return aprovarOrcamentoRascunho(input.orcamentoId, ctx.user.id);
    }),

  // Decisão seguir/encerrar de loja "em atenção" (Task 7, Fase B): só admin ou
  // supervisor (regional) decide — gerente comum NÃO decide. Mesmo padrão de
  // papel de `aprovarRascunho`. NÃO recalcula nada — só grava `decisao`.
  registrarDecisao: protectedProcedure
    .input(z.object({
      orcamentoId: z.number().int(),
      decisao: z.enum(["seguir", "encerrar"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "supervisor") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Só admin ou regional decide seguir/encerrar" });
      }
      return registrarDecisaoOrcamento(input.orcamentoId, input.decisao);
    }),

  // Metas diárias (Task 6, Fase B): geradas automaticamente em `aprovarRascunho`
  // quando o orçamento tem `receitaBruta` definida (distribuição uniforme por
  // dia do mês). Sem dados → `[]` (loja sem orçamento aprovado não quebra).
  getMetasDiarias: protectedProcedure
    .input(z.object({ storeId: z.number().int(), anoMes: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getMetasDiarias(input.storeId, input.anoMes);
    }),

  // ── Linhas Customizáveis ─────────────────────────────────────────────────

  linhasCustom: {
    list: protectedProcedure
      .input(z.object({ lojaId: z.number().int(), mes: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => listLinhasCustom(input.lojaId, input.mes)),

    create: protectedProcedure
      .input(z.object({
        lojaId: z.number().int(),
        mes: z.string().regex(/^\d{4}-\d{2}$/),
        grupoId: z.string().min(1),
        label: z.string().min(1).max(200),
        valor: z.number().min(0),
        tipo: tipoValorSchema,
      }))
      .mutation(async ({ input }) => {
        const id = await createLinhaCustom(
          input.lojaId, input.mes, input.grupoId, input.label, input.valor, input.tipo
        );
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(200),
        valor: z.number().min(0),
        tipo: tipoValorSchema,
      }))
      .mutation(async ({ input }) => {
        await updateLinhaCustom(input.id, input.label, input.valor, input.tipo);
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteLinhaCustom(input.id);
        return { ok: true };
      }),
  },

  // ── Análise de Consumo com IA ────────────────────────────────────────────

  analisarConsumo: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      historico: z.array(z.object({
        mes: z.string(),
        linhas: z.array(z.object({
          label: z.string(),
          grupoId: z.string(),
          valorR: z.number(),
          pctReceita: z.number(),
        })),
        receitaBruta: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      if (input.historico.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Histórico vazio" });
      }

      const historicoTexto = input.historico.map((h) => {
        const linhas = h.linhas
          .map((l) => `  - ${l.label} (${l.grupoId}): R$ ${l.valorR.toFixed(2)} (${(l.pctReceita * 100).toFixed(1)}% da receita)`)
          .join("\n");
        return `Mês ${h.mes} | Receita: R$ ${h.receitaBruta.toFixed(2)}\n${linhas}`;
      }).join("\n\n");

      const prompt = `Você é um consultor financeiro especializado em restaurantes e franquias no Brasil.

Analise o histórico de despesas abaixo de uma loja do programa "Modo Dono" e identifique oportunidades de redução de custos.

HISTÓRICO DE DESPESAS:
${historicoTexto}

Gere sugestões de melhoria focando em:
1. Contas com tendência de alta
2. Contas acima da média do setor (restaurantes: energia ~2-3%, água ~0.5-1%, gás ~1-2%, contabilidade ~1-2%)
3. Contas com variação anômala entre meses
4. Ações práticas e implementáveis pelo gestor da loja

Responda APENAS com JSON válido no formato:
{
  "sugestoes": [
    {
      "conta": "nome da conta",
      "grupoId": "id do grupo",
      "situacao": "descrição do problema identificado",
      "potencialEconomia": "estimativa em R$ ou % (ex: R$ 800/mês ou 1.5%)",
      "acao": "ação específica recomendada",
      "prioridade": "alta|media|baixa"
    }
  ],
  "resumo": "parágrafo resumindo o diagnóstico geral"
}`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um consultor financeiro especializado em restaurantes. Responda sempre em JSON válido." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "analise_consumo",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  sugestoes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        conta: { type: "string" },
                        grupoId: { type: "string" },
                        situacao: { type: "string" },
                        potencialEconomia: { type: "string" },
                        acao: { type: "string" },
                        prioridade: { type: "string" },
                      },
                      required: ["conta", "grupoId", "situacao", "potencialEconomia", "acao", "prioridade"],
                      additionalProperties: false,
                    },
                  },
                  resumo: { type: "string" },
                },
                required: ["sugestoes", "resumo"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const content = response.choices[0].message.content as string;
        return JSON.parse(content) as {
          sugestoes: Array<{
            conta: string;
            grupoId: string;
            situacao: string;
            potencialEconomia: string;
            acao: string;
            prioridade: string;
          }>;
          resumo: string;
        };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao analisar com IA" });
      }
    }),
  // ── Excluir orçamento ────────────────────────────────────────────────────
  excluir: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const orc = await getOrcamentoById(input.id);
      if (!orc) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
      await assertPodeAcessarLoja(ctx, orc.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      // Derivar loja/mês/ano do orçamento para limpeza do conteúdo gerado
      const periodoStr = typeof orc.periodoInicio === "string"
        ? orc.periodoInicio
        : (orc.periodoInicio as Date).toISOString().slice(0, 10);
      const [anoStr, mesStr] = periodoStr.split("-");
      const mesNum = Number(mesStr);
      const anoNum = Number(anoStr);
      const storeId = orc.storeId;

      // ── 1. Apagar planos de ação gerados por este orçamento (isSuggestion=1 + prefixo [orc:<id>])
      // Planos com isSuggestion=0 (criados manualmente pelo gestor) são preservados
      await (db as any).$client.promise().execute(
        `DELETE FROM action_plans WHERE storeId = ? AND isSuggestion = 1 AND reason LIKE ?`,
        [storeId, `[orc:${input.id}]%`]
      );
      // Também apagar planos do A4 (ia_corte_*/ia_linhanova_*/ia_questio_*) deste orçamento
      await (db as any).$client.promise().execute(
        `DELETE FROM action_plans WHERE storeId = ? AND reason LIKE ?`,
        [storeId, `[orc:${input.id}]%`]
      );

      // ── 2. Apagar Meta + Medidas + Progresso do mês/loja
      const [metaRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM metas WHERE loja_id = ? AND mes = ? AND ano = ?`,
        [storeId, mesNum, anoNum]
      );
      for (const metaRow of metaRows as any[]) {
        const metaId = metaRow.id;
        // Apagar progresso das medidas
        const [medRows] = await (db as any).$client.promise().execute(
          `SELECT id FROM medidas_direcao WHERE meta_id = ?`,
          [metaId]
        );
        for (const med of medRows as any[]) {
          await (db as any).$client.promise().execute(
            `DELETE FROM medidas_progresso WHERE medida_id = ?`,
            [med.id]
          );
        }
        // Apagar medidas
        await (db as any).$client.promise().execute(
          `DELETE FROM medidas_direcao WHERE meta_id = ?`,
          [metaId]
        );
        // Apagar a meta
        await (db as any).$client.promise().execute(
          `DELETE FROM metas WHERE id = ?`,
          [metaId]
        );
      }

      // ── 3. Apagar metas diárias do período
      await (db as any).$client.promise().execute(
        `DELETE FROM orcamento_metas_diarias WHERE store_id = ? AND data >= ? AND data <= ?`,
        [storeId, periodoStr, periodoStr.slice(0, 7) + "-31"]
      );

      // ── 4. Apagar linhas custom geradas automaticamente (origem "[IA]" ou "ia_*")
      // Preservar linhas criadas manualmente pelo gestor (origem null ou "manual")
      await (db as any).$client.promise().execute(
        `DELETE FROM orcamento_linhas_custom WHERE loja_id = ? AND mes = ? AND (origem LIKE '[IA]%' OR origem LIKE 'ia_%')`,
        [storeId, periodoStr.slice(0, 7)]
      );

      // ── 5. Apagar colaboradores (FK direta) e o orçamento
      await (db as any).$client.promise().execute("DELETE FROM orcamento_colaboradores WHERE orcamento_id = ?", [input.id]);
      await (db as any).$client.promise().execute("DELETE FROM orcamentos WHERE id = ?", [input.id]);

      return { ok: true, limpeza: { metasApagadas: (metaRows as any[]).length } };
    }),

  // ── Zerar mês completo (admin) ────────────────────────────────────────────
  // Apaga TUDO gerado para uma loja/mês: orçamento, meta, medidas, planos automáticos,
  // metas diárias e linhas custom automáticas. Planos manuais (isSuggestion=0) são preservados.
  zerarMes: adminProcedure
    .input(z.object({
      storeId: z.number().int(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2099),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const { storeId, mes, ano } = input;
      const mesStr = String(mes).padStart(2, "0");
      const periodoMes = `${ano}-${mesStr}`;

      let orcamentosApagados = 0;
      let metasApagadas = 0;
      let medidasApagadas = 0;
      let planosApagados = 0;
      let metasDiariasApagadas = 0;
      let linhasCustomApagadas = 0;

      // ── 1. Buscar orçamentos do mês/loja
      const [orcRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM orcamentos WHERE store_id = ? AND DATE_FORMAT(periodo_inicio, '%Y-%m') = ?`,
        [storeId, periodoMes]
      );
      for (const orcRow of orcRows as any[]) {
        const orcId = orcRow.id;
        // Apagar planos gerados por este orçamento
        const [r1] = await (db as any).$client.promise().execute(
          `DELETE FROM action_plans WHERE storeId = ? AND isSuggestion = 1 AND reason LIKE ?`,
          [storeId, `[orc:${orcId}]%`]
        );
        const [r2] = await (db as any).$client.promise().execute(
          `DELETE FROM action_plans WHERE storeId = ? AND reason LIKE ?`,
          [storeId, `[orc:${orcId}]%`]
        );
        planosApagados += ((r1 as any)?.rowsAffected ?? 0) + ((r2 as any)?.rowsAffected ?? 0);
        // Apagar colaboradores e o orçamento
        await (db as any).$client.promise().execute("DELETE FROM orcamento_colaboradores WHERE orcamento_id = ?", [orcId]);
        await (db as any).$client.promise().execute("DELETE FROM orcamentos WHERE id = ?", [orcId]);
        orcamentosApagados++;
      }

      // ── 2. Apagar Meta + Medidas + Progresso do mês/loja
      const [metaRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM metas WHERE loja_id = ? AND mes = ? AND ano = ?`,
        [storeId, mes, ano]
      );
      for (const metaRow of metaRows as any[]) {
        const metaId = metaRow.id;
        const [medRows] = await (db as any).$client.promise().execute(
          `SELECT id FROM medidas_direcao WHERE meta_id = ?`,
          [metaId]
        );
        for (const med of medRows as any[]) {
          await (db as any).$client.promise().execute(`DELETE FROM medidas_progresso WHERE medida_id = ?`, [med.id]);
          medidasApagadas++;
        }
        await (db as any).$client.promise().execute(`DELETE FROM medidas_direcao WHERE meta_id = ?`, [metaId]);
        await (db as any).$client.promise().execute(`DELETE FROM metas WHERE id = ?`, [metaId]);
        metasApagadas++;
      }

      // ── 3. Apagar metas diárias do período
      const [r3] = await (db as any).$client.promise().execute(
        `DELETE FROM orcamento_metas_diarias WHERE store_id = ? AND DATE_FORMAT(data, '%Y-%m') = ?`,
        [storeId, periodoMes]
      );
      metasDiariasApagadas = (r3 as any)?.rowsAffected ?? 0;

      // ── 4. Apagar linhas custom automáticas (preservar manuais)
      const [r4] = await (db as any).$client.promise().execute(
        `DELETE FROM orcamento_linhas_custom WHERE loja_id = ? AND mes = ? AND (origem LIKE '[IA]%' OR origem LIKE 'ia_%')`,
        [storeId, periodoMes]
      );
      linhasCustomApagadas = (r4 as any)?.rowsAffected ?? 0;

      return {
        ok: true,
        limpeza: { orcamentosApagados, metasApagadas, medidasApagadas, planosApagados, metasDiariasApagadas, linhasCustomApagadas }
      };
    }),

  // ── Deletar meta diretamente (admin) ─────────────────────────────────────
  deleteMeta: adminProcedure
    .input(z.object({ metaId: z.number().int(), storeId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      // Apagar planos automáticos ligados às medidas desta meta
      const [medRows] = await (db as any).$client.promise().execute(
        `SELECT id FROM medidas_direcao WHERE meta_id = ?`,
        [input.metaId]
      );
      for (const med of medRows as any[]) {
        await (db as any).$client.promise().execute(`DELETE FROM medidas_progresso WHERE medida_id = ?`, [med.id]);
        await (db as any).$client.promise().execute(
          `DELETE FROM action_plans WHERE medida_id = ? AND isSuggestion = 1`,
          [med.id]
        );
      }
      await (db as any).$client.promise().execute(`DELETE FROM medidas_direcao WHERE meta_id = ?`, [input.metaId]);
      await (db as any).$client.promise().execute(`DELETE FROM metas WHERE id = ?`, [input.metaId]);
      return { ok: true };
    }),
});
