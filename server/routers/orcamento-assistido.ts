import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertPodeAcessarLoja } from "../auth-helpers";
import { invokeLLM } from "../_core/llm";
import { MODEL_FAST, MODEL_DEEP } from "../_core/llm-models";
import { getContextoBenchmarks } from "../benchmarks";
import {
  getTemplateLinhas,
  getValoresOrcamento,
  getPremissas,
  upsertPremissas,
  bulkUpsertValores,
  marcarSimulado,
  updateValorLinha,
  deleteValorLinha,
  upsertValorLinha,
  getHistoricoReceita,
  getHistoricoValores,
  type OrcamentoValorLinha,
} from "../db-orcamento-assistido";
import { saveOrcamento } from "../db-orcamento";
import { getDb } from "../db";
import { storageGetPresignedPutUrl, storageDownload } from "../storage";
import { parseSpreadsheetToGrid, gridToPromptText, extractDreContext } from "../sheet-parser";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcReceita(premissas: { receitaBase?: number; crescimentoPct?: number }) {
  const base = premissas.receitaBase ?? 0;
  const pct = premissas.crescimentoPct ?? 0;
  return base * (1 + pct / 100);
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const orcamentoAssistidoRouter = router({

  // Retorna o catálogo completo de linhas da DRE
  getTemplate: protectedProcedure.query(async () => {
    const linhas = await getTemplateLinhas();
    // Agrupar por grupo
    const grupos = new Map<string, { codigo: string; label: string; linhas: typeof linhas }>();
    for (const l of linhas) {
      if (!grupos.has(l.grupoCodigo)) {
        grupos.set(l.grupoCodigo, { codigo: l.grupoCodigo, label: l.grupoLabel, linhas: [] });
      }
      grupos.get(l.grupoCodigo)!.linhas.push(l);
    }
    return Array.from(grupos.values());
  }),

  // Retorna premissas e valores para um mês
  getOrcamento: protectedProcedure
    .input(z.object({ lojaId: z.number(), ano: z.number(), mes: z.number() }))
    .query(async ({ input }) => {
      const [premissas, valores] = await Promise.all([
        getPremissas(input.lojaId, input.ano, input.mes),
        getValoresOrcamento(input.lojaId, input.ano, input.mes),
      ]);
      return { premissas, valores };
    }),

  // Salva premissas
  salvarPremissas: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      ano: z.number(),
      mes: z.number(),
      receitaBase: z.number().min(0).optional(),
      crescimentoPct: z.number().min(-100).max(500).optional(),
      diasOperacao: z.number().int().min(1).max(31).optional(),
      ticketMedio: z.number().min(0).optional(),
      cmvMetaPct: z.number().min(0).max(100).optional(),
      aluguelRs: z.number().min(0).optional(),
      aluguelPct: z.number().min(0).max(100).optional(),
      royaltiesPct: z.number().min(0).max(100).optional(),
      fundoPromocaoPct: z.number().min(0).max(100).optional(),
      headcount: z.number().int().min(0).optional(),
      energiaRs: z.number().min(0).optional(),
      aguaRs: z.number().min(0).optional(),
      gasRs: z.number().min(0).optional(),
      observacoes: z.string().optional(),
      // Novos campos enriquecidos
      curvaSemanalJson: z.string().optional(),
      comprasSemanaisJson: z.string().optional(),
      ticketAlmocoRs: z.number().min(0).optional(),
      ticketJantarRs: z.number().min(0).optional(),
      ticketDeliveryRs: z.number().min(0).optional(),
      pctAlmoco: z.number().min(0).max(100).optional(),
      pctJantar: z.number().min(0).max(100).optional(),
      pctDelivery: z.number().min(0).max(100).optional(),
      atendimentosDia: z.number().int().min(0).optional(),
      contabilidadeRs: z.number().min(0).optional(),
      sistemasRs: z.number().min(0).optional(),
      proLaboreRs: z.number().min(0).optional(),
      encargosPct: z.number().min(0).max(200).optional(),
      salarioMedioRs: z.number().min(0).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      await upsertPremissas(input);
      return { ok: true };
    }),

  // Simula a DRE completa com base nas premissas + histórico + IA
  simular: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      ano: z.number(),
      mes: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { lojaId, ano, mes } = input;

      const premissas = await getPremissas(lojaId, ano, mes);
      if (!premissas) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Defina as premissas antes de simular." });
      }

      const [template, historicoReceita, historicoValores] = await Promise.all([
        getTemplateLinhas(),
        getHistoricoReceita(lojaId, 3),
        getHistoricoValores(lojaId, 3),
      ]);

      const receitaSimulada = calcReceita(premissas);

      // Montar contexto para a IA
      const historicoTexto = historicoReceita.length > 0
        ? historicoReceita.map(h => `${h.mes}/${h.ano}: R$ ${h.receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`).join(", ")
        : "Sem histórico disponível";

      const valoresHistoricoTexto = historicoValores.length > 0
        ? historicoValores.slice(0, 50).map(v =>
            `${v.grupoCodigo} | ${v.linhaLabel}: ${v.valorRs != null ? `R$ ${v.valorRs}` : `${v.valorPct}%`} (${v.mes}/${v.ano})`
          ).join("\n")
        : "Sem histórico de valores";

      const linhasParaSimular = template.filter(l => l.tipoValor !== "calculado");

      const prompt = `Você é um especialista em gestão financeira de restaurantes. Analise as premissas e o histórico abaixo e gere valores orçados para cada linha da DRE.

PREMISSAS DO MÊS ${mes}/${ano}:
- Receita bruta simulada: R$ ${receitaSimulada.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Receita base (referência): R$ ${premissas.receitaBase ?? "não informado"}
- Crescimento esperado: ${premissas.crescimentoPct ?? 0}%
- Dias de operação: ${premissas.diasOperacao ?? 26}
- Ticket médio esperado: R$ ${premissas.ticketMedio ?? "não informado"}
- CMV meta: ${premissas.cmvMetaPct ?? 32}%
- Aluguel: ${premissas.aluguelRs ? `R$ ${premissas.aluguelRs}` : premissas.aluguelPct ? `${premissas.aluguelPct}% da receita` : "não informado"}
- Royalties: ${premissas.royaltiesPct ?? 0}%
- Fundo de Promoção: ${premissas.fundoPromocaoPct ?? 0}%
- Headcount: ${premissas.headcount ?? "não informado"} funcionários
- Energia: R$ ${premissas.energiaRs ?? "não informado"}
- Água: R$ ${premissas.aguaRs ?? "não informado"}
- Gás: R$ ${premissas.gasRs ?? "não informado"}

HISTÓRICO DE RECEITA (últimos 3 meses): ${historicoTexto}

HISTÓRICO DE VALORES (últimas ocorrências):
${valoresHistoricoTexto}

LINHAS PARA ORÇAR (${linhasParaSimular.length} linhas):
${linhasParaSimular.map(l => `ID:${l.id} | ${l.grupoCodigo} | ${l.linhaLabel} | tipo:${l.tipoValor}`).join("\n")}

Retorne um JSON com o array "valores" onde cada item tem:
- templateLinhaId: number (o ID da linha)
- valorRs: number ou null (valor em R$ — use null se for % puro)
- valorPct: number ou null (percentual sobre receita bruta — use null se for R$ puro)
- tipo: "rs" ou "pct"
- justificativa: string curta (max 80 chars)

Regras:
1. Linhas de % (tipo_valor=pct): retorne valorPct e calcule valorRs = receita * pct/100
2. Linhas de R$ (tipo_valor=rs): retorne valorRs baseado no histórico ou premissas
3. Para linhas sem histórico, use benchmarks típicos de restaurantes brasileiros
4. CMV total deve ser próximo de ${premissas.cmvMetaPct ?? 32}% da receita
5. Aluguel: use R$ ${premissas.aluguelRs ?? 0} ou ${premissas.aluguelPct ?? 0}% conforme premissa
6. Royalties: ${premissas.royaltiesPct ?? 0}% da receita
7. Fundo de Promoção: ${premissas.fundoPromocaoPct ?? 0}% da receita
8. Energia: R$ ${premissas.energiaRs ?? 0}, Água: R$ ${premissas.aguaRs ?? 0}, Gás: R$ ${premissas.gasRs ?? 0}
9. Linhas de detalhe de receita (G01 sub-linhas): distribua proporcionalmente ao histórico
10. Linhas com valor zero histórico e sem premissa: retorne valorRs=0`;

      let valoresIA: Array<{ templateLinhaId: number; valorRs: number | null; valorPct: number | null; tipo: "rs" | "pct"; justificativa: string }> = [];

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em gestão financeira de restaurantes. Responda APENAS com JSON válido, sem markdown, sem explicações." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "dre_simulacao",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  valores: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        templateLinhaId: { type: "integer" },
                        valorRs: { type: ["number", "null"] },
                        valorPct: { type: ["number", "null"] },
                        tipo: { type: "string", enum: ["rs", "pct"] },
                        justificativa: { type: "string" },
                      },
                      required: ["templateLinhaId", "valorRs", "valorPct", "tipo", "justificativa"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["valores"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        if (content) {
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          valoresIA = parsed.valores ?? [];
        }
      } catch (err) {
        console.error("Erro na simulação IA:", err);
        // Fallback: usar premissas diretas sem IA
        valoresIA = linhasParaSimular.map(l => {
          if (l.tipoValor === "pct") {
            let pct = 0;
            if (l.linhaCodigo.startsWith("2.5.1")) pct = premissas.royaltiesPct ?? 0;
            else if (l.linhaCodigo.startsWith("2.5.2")) pct = premissas.fundoPromocaoPct ?? 0;
            else if (l.linhaCodigo.startsWith("4.0")) pct = premissas.cmvMetaPct ?? 32;
            return { templateLinhaId: l.id, valorRs: receitaSimulada * pct / 100, valorPct: pct, tipo: "pct" as const, justificativa: "Calculado pelas premissas" };
          }
          return { templateLinhaId: l.id, valorRs: 0, valorPct: null, tipo: "rs" as const, justificativa: "Sem histórico" };
        });
      }

      // Construir array de valores para salvar
      const templateMap = new Map(template.map(l => [l.id, l]));
      const valoresParaSalvar: OrcamentoValorLinha[] = valoresIA.map(v => {
        const tmpl = templateMap.get(v.templateLinhaId);
        if (!tmpl) return null;
        return {
          lojaId,
          ano,
          mes,
          templateLinhaId: v.templateLinhaId,
          linhaLabel: tmpl.linhaLabel,
          grupoCodigo: tmpl.grupoCodigo,
          valorRs: v.valorRs,
          valorPct: v.valorPct,
          tipo: v.tipo,
          bloqueada: tmpl.bloqueadaPadrao,
          origem: "simulacao" as const,
          ordem: tmpl.ordem,
        };
      }).filter(Boolean) as OrcamentoValorLinha[];

      await bulkUpsertValores(lojaId, ano, mes, valoresParaSalvar);
      await marcarSimulado(lojaId, ano, mes);

      // Retornar valores com justificativas
      const valoresComJustificativa = valoresParaSalvar.map(v => ({
        ...v,
        justificativa: valoresIA.find(vi => vi.templateLinhaId === v.templateLinhaId)?.justificativa ?? "",
      }));

      return {
        receitaSimulada,
        totalLinhas: valoresParaSalvar.length,
        valores: valoresComJustificativa,
      };
    }),

  // Atualiza o valor de uma linha manualmente
  atualizarLinha: protectedProcedure
    .input(z.object({
      id: z.number(),
      lojaId: z.number(),
      valorRs: z.number().nullable(),
      valorPct: z.number().nullable(),
      tipo: z.enum(["rs", "pct"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      await updateValorLinha(input.id, input.lojaId, input.valorRs, input.valorPct, input.tipo);
      return { ok: true };
    }),

  // Adiciona linha customizada em um grupo
  adicionarLinhaCustom: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      ano: z.number(),
      mes: z.number(),
      grupoCodigo: z.string(),
      linhaLabel: z.string().min(1).max(200),
      valorRs: z.number().nullable(),
      valorPct: z.number().nullable(),
      tipo: z.enum(["rs", "pct"]),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      await upsertValorLinha({
        lojaId: input.lojaId,
        ano: input.ano,
        mes: input.mes,
        linhaLabel: input.linhaLabel,
        grupoCodigo: input.grupoCodigo,
        valorRs: input.valorRs ?? undefined,
        valorPct: input.valorPct ?? undefined,
        tipo: input.tipo,
        bloqueada: false,
        origem: "custom",
        ordem: input.ordem ?? 9999,
      });
      return { ok: true };
    }),

  // Remove linha customizada
  removerLinhaCustom: adminProcedure
    .input(z.object({ id: z.number(), lojaId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      await deleteValorLinha(input.id, input.lojaId);
      return { ok: true };
    }),

  // Analisa planilha histórica e sugere premissas via IA
  parseHistorico: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      lojaId: z.number(),
    }))
    .mutation(async ({ input }) => {
      // Parse Excel/CSV file — ler todas as abas
      let allSheetsText = "";
      let totalLinhas = 0;
      let primeirasColunas: string[] = [];
      try {
        const XLSX = await import("xlsx");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

        for (const sheetName of workbook.SheetNames.slice(0, 5)) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
          if (rows.length === 0) continue;
          totalLinhas += rows.length;
          const headers = Object.keys(rows[0]);
          if (primeirasColunas.length === 0) primeirasColunas = headers;
          const sample = rows.slice(0, 50);
          allSheetsText += `\n\n=== Aba: ${sheetName} (${rows.length} linhas) ===\n`;
          allSheetsText += `Colunas: ${headers.join(", ")}\n`;
          allSheetsText += sample.map(r => Object.values(r).join(" | ")).join("\n");
          if (rows.length > 50) allSheetsText += `\n... e mais ${rows.length - 50} linhas`;
        }
      } catch (err) {
        console.error("[parseHistorico] Erro ao ler planilha:", input.fileName, err);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler a planilha (arquivo corrompido ou formato não suportado). Tente salvar como .xlsx ou .csv direto no Excel." });
      }

      if (!allSheetsText.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha vazia ou sem dados reconhecíveis" });
      }

      const dataText = `Arquivo: ${input.fileName}\n${allSheetsText}`;

      // Prompt rico para extrair premissas operacionais completas
      const systemPrompt = `Você é um especialista sênior em gestão financeira e operacional de redes de restaurantes no Brasil.
Sua tarefa é analisar planilhas históricas (DRE, relatórios de vendas, folha de pagamento, etc.) e extrair premissas operacionais detalhadas para montar um orçamento mensal completo.

SEMPRE tente extrair o máximo de informações possíveis. Calcule médias quando houver múltiplos meses.
Para a curva semanal de vendas, distribua 100% entre os 7 dias (ex: restaurante com pico no fim de semana).
Para compras semanais, distribua 100% entre as 4 semanas do mês.
Use null apenas quando a informação realmente não existe nos dados.
Responda APENAS com JSON válido, sem texto adicional.`;

      const userPrompt = `Analise esta planilha histórica de um restaurante e extraia TODAS as premissas operacionais e financeiras possíveis:\n\n${dataText}\n\nIMPORTANTE:\n- receitaBase deve ser a receita bruta MENSAL média em R$ (some e divida pelos meses se necessário)\n- Para a curva semanal, distribua 1.0 (100%) entre os 7 dias proporcionalmente ao volume de vendas\n- Para compras semanais, distribua 1.0 (100%) entre as 4 semanas\n- cmvMetaPct deve ser o % do CMV sobre a receita (ex: 32 para 32%)\n- Todos os percentuais devem ser em número absoluto (ex: 5 para 5%, não 0.05)\n\nRetorne JSON com todas as premissas identificadas.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "premissas_historico_completo",
            strict: true,
            schema: {
              type: "object",
              properties: {
                // Receita
                receitaBase: { type: ["number", "null"], description: "Receita bruta média mensal em R$" },
                crescimentoPct: { type: ["number", "null"], description: "Crescimento esperado em % (ex: 5 para 5%)" },
                diasOperacao: { type: ["number", "null"], description: "Dias de operação por mês" },
                ticketMedio: { type: ["number", "null"], description: "Ticket médio geral em R$" },
                atendimentosDia: { type: ["number", "null"], description: "Número médio de atendimentos por dia" },
                // Canais de venda
                ticketAlmocoRs: { type: ["number", "null"], description: "Ticket médio no almoço em R$" },
                ticketJantarRs: { type: ["number", "null"], description: "Ticket médio no jantar em R$" },
                ticketDeliveryRs: { type: ["number", "null"], description: "Ticket médio no delivery em R$" },
                pctAlmoco: { type: ["number", "null"], description: "% da receita no almoço (ex: 60 para 60%)" },
                pctJantar: { type: ["number", "null"], description: "% da receita no jantar (ex: 25 para 25%)" },
                pctDelivery: { type: ["number", "null"], description: "% da receita no delivery (ex: 15 para 15%)" },
                // Distribuição semanal de vendas (soma deve ser 1.0)
                curvaSemanalJson: { type: ["string", "null"], description: 'JSON string: {"seg":0.12,"ter":0.14,"qua":0.15,"qui":0.16,"sex":0.18,"sab":0.15,"dom":0.10} — proporção de vendas por dia da semana, soma = 1.0' },
                // Distribuição semanal de compras (soma deve ser 1.0)
                comprasSemanaisJson: { type: ["string", "null"], description: 'JSON string: {"semana1":0.30,"semana2":0.25,"semana3":0.25,"semana4":0.20} — proporção de compras por semana do mês, soma = 1.0' },
                // Custos
                cmvMetaPct: { type: ["number", "null"], description: "CMV meta em % da receita (ex: 32 para 32%)" },
                aluguelRs: { type: ["number", "null"], description: "Aluguel mensal em R$" },
                royaltiesPct: { type: ["number", "null"], description: "Royalties em % da receita" },
                fundoPromocaoPct: { type: ["number", "null"], description: "Fundo de promoção em % da receita" },
                energiaRs: { type: ["number", "null"], description: "Energia elétrica mensal em R$" },
                aguaRs: { type: ["number", "null"], description: "Água mensal em R$" },
                gasRs: { type: ["number", "null"], description: "Gás mensal em R$" },
                contabilidadeRs: { type: ["number", "null"], description: "Contabilidade mensal em R$" },
                sistemasRs: { type: ["number", "null"], description: "Sistemas/software mensal em R$" },
                // Pessoal
                headcount: { type: ["number", "null"], description: "Número total de funcionários" },
                salarioMedioRs: { type: ["number", "null"], description: "Salário médio por funcionário em R$" },
                proLaboreRs: { type: ["number", "null"], description: "Pró-labore mensal em R$" },
                encargosPct: { type: ["number", "null"], description: "Encargos trabalhistas em % do salário (ex: 70 para 70%)" },
                // Meta
                resumo: { type: "string", description: "Resumo do que foi identificado e calculado na planilha (max 300 chars)" },
                confianca: { type: "string", enum: ["alta", "media", "baixa"], description: "Confiança geral na extração" },
                alertas: { type: "string", description: "Alertas ou observações importantes sobre os dados (inconsistências, dados faltantes críticos, etc.) — vazio se não houver" },
              },
              required: [
                "receitaBase", "crescimentoPct", "diasOperacao", "ticketMedio", "atendimentosDia",
                "ticketAlmocoRs", "ticketJantarRs", "ticketDeliveryRs",
                "pctAlmoco", "pctJantar", "pctDelivery",
                "curvaSemanalJson", "comprasSemanaisJson",
                "cmvMetaPct", "aluguelRs", "royaltiesPct", "fundoPromocaoPct",
                "energiaRs", "aguaRs", "gasRs", "contabilidadeRs", "sistemasRs",
                "headcount", "salarioMedioRs", "proLaboreRs", "encargosPct",
                "resumo", "confianca", "alertas",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou resposta. Tente novamente." });
      }

      let premissas: Record<string, unknown>;
      try {
        premissas = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA retornou resposta inválida. Tente novamente." });
      }

      return {
        premissas,
        totalLinhas,
        colunas: primeirasColunas,
      };
    }),

  // ─── Simular por Meta ────────────────────────────────────────────────────────
  // Novo fluxo: usuário informa faturamento + resultado desejados,
  // importa DRE histórica e a IA calcula o que precisa mudar + gera plano de ação
  simularPorMeta: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      faturamentoMeta: z.number().positive(),
      resultadoMetaPct: z.number().min(-100).max(100),
      periodoRef: z.string().optional(), // ex: "2025-12"
      fileBase64: z.string().optional(),
      fileName: z.string().optional(),
      storageKey: z.string().optional(),
      selectedSheets: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { faturamentoMeta, resultadoMetaPct, fileBase64, fileName, storageKey } = input;
      const resultadoMetaRs = faturamentoMeta * (resultadoMetaPct / 100);

      // Montar contexto da DRE histórica
      let dreContexto = "Nenhuma DRE histórica fornecida.";
      let totalLinhas = 0;
      let abaSelecionada = "";
      let mesBase = "";
      let needsSheetSelection = false;
      let sheetNames: string[] = [];
      if ((fileBase64 || storageKey) && fileName) {
        try {
          let fileBuffer: Buffer;
          if (storageKey) {
            fileBuffer = await storageDownload(storageKey);
          } else {
            fileBuffer = Buffer.from(fileBase64!, "base64");
          }
          const dreResult = extractDreContext(fileBuffer, fileName, input.selectedSheets);
          dreContexto = dreResult.dreContexto;
          totalLinhas = dreResult.totalLinhas;
          abaSelecionada = dreResult.abaSelecionada;
          mesBase = dreResult.mesBase;
          needsSheetSelection = dreResult.needsSheetSelection;
          sheetNames = dreResult.sheetNames;
          if (dreResult.needsSheetSelection) {
            dreContexto = `O arquivo tem ${sheetNames.length} abas. Selecione a aba do DRE: ${sheetNames.join(", ")}`;
          }
        } catch (err) {
          console.error("[simularPorMeta] Erro ao ler planilha:", err);
          dreContexto = "Erro ao ler a planilha. Usando apenas as metas informadas.";
        }
      }

      // Derivar mês-alvo para benchmarks
      const agora = new Date();
      const mesAlvoDate = input.periodoRef
        ? new Date(input.periodoRef + "-01")
        : new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
      const mesAlvo = `${mesAlvoDate.getFullYear()}-${String(mesAlvoDate.getMonth() + 1).padStart(2, "0")}`;
      const benchmarksContexto = await getContextoBenchmarks(input.lojaId, mesAlvo);

      const prompt = `Você é um consultor financeiro sênior especializado em restaurantes e redes de alimentação, com experiência em gestão operacional.

CONTEXTO FUNDAMENTAL:
- A DRE fornecida é SEMPRE de mês(es) PASSADO(s) — é a BASE HISTÓRICA, não o mês sendo orçado.
- O mês sendo orçado é o PRÓXIMO PERÍODO (futuro). A IA deve PROJETAR esse período com base no histórico.
- Se a planilha tiver múltiplos meses, use o MÊS MAIS RECENTE (última coluna de valores) como referência principal.
- NUNCA assuma que a DRE importada é do mês-alvo — ela é o ponto de partida, não o destino.

O gestor quer atingir as seguintes METAS para o PRÓXIMO PERÍODO (mês futuro a ser orçado):
- Faturamento desejado: R$ ${faturamentoMeta.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Resultado/EBITDA desejado: ${resultadoMetaPct}% (R$ ${resultadoMetaRs.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})

${dreContexto}
${benchmarksContexto}

Com base na DRE histórica acima (passado) e nas metas informadas (futuro), faça uma análise MINUCIOSA e ESPECÍFICA:

REGRAS OBRIGATÓRIAS:
- Cite SEMPRE o nome da linha e o valor real (ex: "CMV R$ 87.500 = 35% da receita")
- Nunca use linguagem genérica: "reduzir custos" sem citar qual linha e quanto
- Priorize o que mais move o resultado (impacto em R$)
- dreAtual = valores do histórico passado; dreMeta = projeção para o próximo período

SEÇÕES QUE VOCÊ DEVE PREENCHER:

1. diagnosticoPorLinha[]: Para CADA linha relevante do DRE histórico:
   - avalie "ok" / "atenção" / "melhorar" comparando com benchmarks de restaurante (CMV ≤30%, Folha ≤28%, Aluguel ≤8%)
   - comente citando o valor real e o que precisa mudar
   Exemplo: { linha: "CMV", valorPassado: 87500, pctReceita: 35, avaliacao: "melhorar", comentario: "CMV de R$ 87.500 (35%) está 5pp acima do benchmark de 30%. Renegociar fornecedor de proteínas pode economizar R$ 12.500/mês." }

2. questionamentos[]: Para cada salto relevante entre histórico e meta (variação >15%):
   - questione se há sustentação concreta
   Exemplo: { tema: "Faturamento", de: 250000, para: 350000, variacaoPct: 40, pergunta: "Faturamento +40% (R$ 250k→350k): o que sustenta esse crescimento? Abertura de novo canal? Sazonalidade? Tem ação concreta planejada?" }

3. sugestoesCorte[]: Para cada linha com potencial de redução:
   - cite se o custo foi pontual ou recorrente
   - sugira valor específico com justificativa
   Exemplo: { linha: "Manutenção", valorAtual: 8000, valorSugerido: 3000, economiaRs: 5000, justificativa: "R$ 8.000 em manutenção parece pontual (troca de equipamento?). Se recorrente, revisar contratos preventivos pode reduzir para R$ 3.000/mês." }

4. linhasNovas[]: Linhas que o gestor talvez esqueça:
   - Provisão 13º (1/12 da folha por mês)
   - Provisão férias (1/12 da folha)
   - Fundo de reserva para manutenção (1-2% da receita)
   - Depreciação de equipamentos
   Cite o valor sugerido e por que é importante provisionar

5. insights[]: Sazonalidade, riscos e padrões do histórico:
   - Identifique se há meses de pico/baixa no histórico
   - Riscos de concentração (ex: 60% em delivery = risco de comissão alta)
   - Padrões de comportamento de custo

6. baseDre (dreMeta): DRE projetada AJUSTADA pelas sugestões acima para atingir a meta

7. Para cada GAP identificado (linha que precisa mudar), gere AÇÕES OPERACIONAIS ESPECÍFICAS:
   - Não diga apenas "reduzir CMV" — diga COMO: "Renegociar contrato com fornecedor X, substituir ingrediente Y por Z"
   - Cada ação deve ter: O QUE fazer, COMO fazer, QUEM é responsável, em QUANTO TEMPO, e qual o IMPACTO esperado em R$

8. Retorne TODAS as linhas da DRE histórica em "linhasCompletas" com os valores EXATOS da planilha (sem arredondar).
Retorne um JSON com a estrutura exata solicitada. Linhas em branco ou sem valor devem ser IGNORADAS.`;

      // ═══════════════════════════════════════════════════════════════════════
      // PIPELINE DE 3 ESTÁGIOS — Orçamento IA
      // ═══════════════════════════════════════════════════════════════════════
      // ESTÁGIO A (MODEL_FAST, strict): estrutura DRE em números validados
      // ESTÁGIO B (MODEL_DEEP, texto livre, paralelo): 3 análises profundas
      // ESTÁGIO C (MODEL_FAST, strict, retry): monta o JSON final
      // ═══════════════════════════════════════════════════════════════════════

      const t0 = Date.now();

      // ── ESTÁGIO A: Estruturar DRE ─────────────────────────────────────────────────
      // Extrai números validados do dreContexto. Aborta se zerado/incoerente.
      type DreEstruturado = {
        faturamento: number; cmv: number; cmvPct: number;
        folha: number; folhaPct: number; custosFixos: number; custosFixosPct: number;
        custosVariaveis: number; custosVariaveisPct: number;
        impostos: number; impostosPct: number; ebitda: number; ebitdaPct: number;
      };
      let dreEstruturado: DreEstruturado | null = null;
      let lastErrorA = "";
      {
        const MAX_RETRIES_A = 3;
        const dreSchema = {
          type: "json_schema" as const,
          json_schema: {
            name: "dre_estruturado",
            strict: true,
            schema: {
              type: "object",
              properties: {
                faturamento: { type: "number" }, cmv: { type: "number" }, cmvPct: { type: "number" },
                folha: { type: "number" }, folhaPct: { type: "number" }, custosFixos: { type: "number" },
                custosFixosPct: { type: "number" }, custosVariaveis: { type: "number" }, custosVariaveisPct: { type: "number" },
                impostos: { type: "number" }, impostosPct: { type: "number" }, ebitda: { type: "number" }, ebitdaPct: { type: "number" },
              },
              required: ["faturamento","cmv","cmvPct","folha","folhaPct","custosFixos","custosFixosPct","custosVariaveis","custosVariaveisPct","impostos","impostosPct","ebitda","ebitdaPct"],
              additionalProperties: false,
            },
          },
        };
        const dreMessages = [
          { role: "system" as const, content: "Voc\u00ea \u00e9 um extrator de dados financeiros. Retorne apenas JSON v\u00e1lido sem markdown." },
          { role: "user" as const, content: `Extraia os valores num\u00e9ricos do DRE hist\u00f3rico abaixo e calcule os percentuais sobre o faturamento.\nREGRAS:\n- Use o m\u00eas mais recente com dados reais (n\u00e3o zeros, n\u00e3o ANO/M\u00c9DIA/TOTAL).\n- Percentuais = valor / faturamento (ex: cmvPct = cmv / faturamento).\n- Se faturamento = 0 ou n\u00e3o encontrado, retorne 0 em todos os campos.\n- Nunca invente valores.\n\nDRE HIST\u00d3RICO:\n${dreContexto}\n\nRetorne JSON com exatamente estes campos (todos number):\nfaturamento, cmv, cmvPct, folha, folhaPct, custosFixos, custosFixosPct,\ncustosVariaveis, custosVariaveisPct, impostos, impostosPct, ebitda, ebitdaPct` },
        ];
        for (let attemptA = 1; attemptA <= MAX_RETRIES_A; attemptA++) {
          try {
            const respA = await invokeLLM({
              model: MODEL_FAST,
              messages: dreMessages,
              response_format: dreSchema,
            });
            const cA = respA.choices?.[0]?.message?.content;
            if (!cA) {
              lastErrorA = `Tentativa ${attemptA}: content vazio`;
              console.log(`[simularPorMeta] Est\u00e1gio A tentativa ${attemptA}/${MAX_RETRIES_A} \u2014 content vazio, retentando...`);
              continue;
            }
            const parsed = typeof cA === "string" ? JSON.parse(cA) : cA;
            if (!parsed.faturamento || parsed.faturamento < 100) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "N\u00e3o foi poss\u00edvel extrair valores reais da planilha. Verifique se a aba DRE cont\u00e9m dados do m\u00eas mais recente e tente novamente.",
              });
            }
            const fixPct = (val: number, pct: number) => {
              if (parsed.faturamento > 0 && Math.abs(val / parsed.faturamento - pct) > 0.05) {
                return val / parsed.faturamento;
              }
              return pct;
            };
            parsed.cmvPct = fixPct(parsed.cmv, parsed.cmvPct);
            parsed.folhaPct = fixPct(parsed.folha, parsed.folhaPct);
            dreEstruturado = parsed as DreEstruturado;
            break;
          } catch (errA: any) {
            if (errA?.code === "BAD_REQUEST") throw errA;
            lastErrorA = `Tentativa ${attemptA}: ${errA?.message ?? String(errA)}`;
            console.log(`[simularPorMeta] Est\u00e1gio A tentativa ${attemptA}/${MAX_RETRIES_A} \u2014 erro: ${lastErrorA}`);
            if (attemptA === MAX_RETRIES_A) {
              console.log(`[simularPorMeta] Est\u00e1gio A: tentando modelo alternativo...`);
              try {
                const respFb = await invokeLLM({ model: "gemini-2.5-flash", messages: dreMessages, response_format: dreSchema });
                const cFb = respFb.choices?.[0]?.message?.content;
                if (cFb) {
                  const parsedFb = typeof cFb === "string" ? JSON.parse(cFb) : cFb;
                  if (parsedFb.faturamento && parsedFb.faturamento >= 100) {
                    dreEstruturado = parsedFb as DreEstruturado;
                    console.log(`[simularPorMeta] Est\u00e1gio A: modelo alternativo funcionou`);
                  }
                }
              } catch (fbErr) {
                console.log(`[simularPorMeta] Est\u00e1gio A: modelo alternativo tamb\u00e9m falhou: ${fbErr}`);
              }
            }
          }
        }
      }
      const tA = Date.now();
      console.log(`[simularPorMeta] Est\u00e1gio A: ${tA - t0}ms | faturamento=${dreEstruturado?.faturamento ?? 'null'}`);

      if (!dreEstruturado) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `O modelo não conseguiu estruturar a DRE após 3 tentativas — tente novamente. ${lastErrorA}` });
      }

      // ── ESTÁGIO B: 3 análises paralelas (MODEL_DEEP, texto livre) ─────────────────
      const sysConsultor = `Voc\u00ea \u00e9 um consultor financeiro s\u00eanior especializado em restaurantes, com 20 anos de experi\u00eancia em gest\u00e3o operacional e reestrutura\u00e7\u00e3o de custos.\nREGRAS ABSOLUTAS:\n- Todo coment\u00e1rio DEVE citar valor em R$ E percentual sobre receita E compara\u00e7\u00e3o num\u00e9rica (vs. hist\u00f3rico ou vs. rede).\n- Proibido escrever frases sem n\u00famero. Ex. ERRADO: "O CMV est\u00e1 alto." CERTO: "CMV R$ 87.500 (35%) est\u00e1 5pp acima do benchmark de 30%, custando R$ 12.500/m\u00eas a mais."\n- Pense como consultor que cobra caro: antes de concluir, verifique sua aritm\u00e9tica.\n- Se um dado n\u00e3o existe no contexto, diga que n\u00e3o existe \u2014 nunca suponha.`;

      const fat = dreEstruturado.faturamento;
      const contextoBase = `META DO GESTOR:\n- Faturamento alvo: R$ ${faturamentoMeta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- EBITDA alvo: ${resultadoMetaPct}% (R$ ${resultadoMetaRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n\nDRE ATUAL (m\u00eas mais recente \u2014 extra\u00edda e validada):\n- Faturamento: R$ ${fat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- CMV: R$ ${dreEstruturado.cmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(dreEstruturado.cmvPct * 100).toFixed(1)}%)\n- Folha: R$ ${dreEstruturado.folha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(dreEstruturado.folhaPct * 100).toFixed(1)}%)\n- Custos Fixos: R$ ${dreEstruturado.custosFixos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(dreEstruturado.custosFixosPct * 100).toFixed(1)}%)\n- Custos Vari\u00e1veis: R$ ${dreEstruturado.custosVariaveis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(dreEstruturado.custosVariaveisPct * 100).toFixed(1)}%)\n- Impostos: R$ ${dreEstruturado.impostos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(dreEstruturado.impostosPct * 100).toFixed(1)}%)\n- EBITDA: R$ ${dreEstruturado.ebitda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(dreEstruturado.ebitdaPct * 100).toFixed(1)}%)\n\nDRE HIST\u00d3RICO COMPLETO (linhas originais da planilha):\n${dreContexto}\n\n${benchmarksContexto}`;

      // B1: Diagn\u00f3stico linha a linha
      const promptB1 = contextoBase + `\n\nTAREFA B1 \u2014 DIAGN\u00d3STICO LINHA A LINHA:\nPara CADA linha relevante do DRE hist\u00f3rico, avalie:\n1. Compare com benchmarks da rede (se\u00e7\u00e3o BENCHMARKS INTERNOS acima) \u2014 cite o N e o grupo.\n2. Compare com o hist\u00f3rico da pr\u00f3pria loja (se dispon\u00edvel).\n3. Classifique: ok | aten\u00e7\u00e3o | melhorar\n4. Escreva um coment\u00e1rio OBRIGATORIAMENTE com: valor em R$, % sobre receita, compara\u00e7\u00e3o num\u00e9rica.\n\nFormato de sa\u00edda (texto livre):\nLINHA: [nome]\nVALOR: R$ [X] ([Y]% da receita)\nAVALIA\u00c7\u00c3O: [ok/aten\u00e7\u00e3o/melhorar]\nBENCHMARK: [compara\u00e7\u00e3o com rede/hist\u00f3rico com n\u00fameros]\nCOMENT\u00c1RIO: [an\u00e1lise com n\u00fameros, impacto em R$, a\u00e7\u00e3o sugerida]\n---`;

      // B2: Meta e proje\u00e7\u00e3o com cen\u00e1rios
      const promptB2 = contextoBase + `\n\nTAREFA B2 \u2014 META E PROJE\u00c7\u00c3O:\n1. Construa a DRE meta linha a linha para atingir faturamento R$ ${faturamentoMeta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} e EBITDA ${resultadoMetaPct}%.\n   Para CADA linha, explique a premissa: \'Folha cai de 31%\u219228% porque [raz\u00e3o concreta com R$]\'\n2. Avalie a viabilidade em 3 cen\u00e1rios:\n   - CONSERVADOR: faturamento 15% abaixo da meta\n   - BASE: a meta como proposta\n   - OTIMISTA: faturamento 10% acima da meta\n   Para cada cen\u00e1rio: EBITDA em R$ e %, probabilidade qualitativa (alta/m\u00e9dia/baixa).\n3. Identifique a linha mais irrealista da meta e explique por qu\u00ea.\n\nFormato de sa\u00edda (texto livre):\nDRE META:\n[linha]: R$ [X] ([Y]%) \u2014 premissa: [explica\u00e7\u00e3o com n\u00fameros]\n...\n\nCEN\u00c1RIOS:\nCONSERVADOR: EBITDA R$ [X] ([Y]%) \u2014 probabilidade [alta/m\u00e9dia/baixa]\nBASE: EBITDA R$ [X] ([Y]%) \u2014 probabilidade [alta/m\u00e9dia/baixa]\nOTIMISTA: EBITDA R$ [X] ([Y]%) \u2014 probabilidade [alta/m\u00e9dia/baixa]\n\nLINHA MAIS IRREALISTA: [nome] \u2014 [explica\u00e7\u00e3o]

4. GUIA DO M\u00caS (plano semanal): Para cada a\u00e7\u00e3o do plano, defina:
   - SEMANA: em qual semana do m\u00eas come\u00e7a (1, 2, 3 ou 4)
   - CHECKPOINT: qual n\u00famero o gerente olha para saber se est\u00e1 funcionando (ex.: "CMV acumulado no dia 15 deve estar \u226431%")
   - SE ESTOURAR: o que fazer se o n\u00famero estourar (a\u00e7\u00e3o corretiva de uma linha)

5. RESUMO EXECUTIVO (5-8 frases, linguagem simples para gerente de loja):
   - "Sua meta \u00e9 R$ X de faturamento com EBITDA Y%."
   - "Para chegar l\u00e1, as 3 coisas que mais importam s\u00e3o..."
   - "O maior risco \u00e9..."
   - "Na primeira semana, foque em..."
   Sem jarg\u00e3o financeiro. Fale como um mentor experiente falaria com o gerente.

Formato adicional de sa\u00edda:
GUIA DO M\u00caS:
[a\u00e7\u00e3o]: Semana [N] | Checkpoint: [n\u00famero a olhar] | Se estourar: [a\u00e7\u00e3o corretiva]
...

RESUMO EXECUTIVO:
[5-8 frases em portugu\u00eas claro]`;

      // B3: Cortes, lacunas e questionamentos
      const promptB3 = contextoBase + `\n\nTAREFA B3 \u2014 CORTES, LACUNAS E QUESTIONAMENTOS:\n1. CORTES IDENTIFICADOS: Para cada linha com potencial de redu\u00e7\u00e3o:\n   - Separe pontual vs recorrente\n   - Cite valor atual em R$, valor sugerido em R$, economia/m\u00eas\n   - Justifique com dados do DRE\n2. PROVIS\u00d5ES AUSENTES: Verifique e ESTIME o valor se n\u00e3o estiver na DRE:\n   - Provis\u00e3o 13\u00ba: 1/12 da folha = R$ ${(dreEstruturado.folha / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n   - Provis\u00e3o f\u00e9rias: 1/12 da folha = R$ ${(dreEstruturado.folha / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n   - Fundo de reserva: 1-2% da receita = R$ ${(fat * 0.015).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n   - Deprecia\u00e7\u00e3o: estime 2-3% da receita se n\u00e3o houver dado\n3. QUESTIONAMENTOS: Para cada salto >15% entre hist\u00f3rico e meta, ou entre meses:\n   - Cite os valores exatos\n   - Fa\u00e7a a pergunta que o consultor faria\n\nFormato de sa\u00edda (texto livre):\nCORTES:\n[linha]: R$ [atual] \u2192 R$ [sugerido] (economia R$ [X]/m\u00eas) \u2014 [pontual/recorrente] \u2014 [justificativa]\n...\n\nPROVIS\u00d5ES AUSENTES:\n[nome]: R$ [estimado]/m\u00eas \u2014 [por que provisionar]\n...\n\nQUESTIONAMENTOS:\n[tema]: [de R$ X para R$ Y = +Z%] \u2014 [pergunta]\n...`;

      // Executar B1, B2, B3 em paralelo
      // Fallback: se MODEL_DEEP for rejeitado pelo gateway, usar MODEL_FAST
      const modelB = MODEL_DEEP;
      const callB = (prompt: string) =>
        invokeLLM({ model: modelB, thinkingBudget: 6000, messages: [{ role: "system", content: sysConsultor }, { role: "user", content: prompt }] })
          .catch(async (err: any) => {
            console.warn(`[simularPorMeta] MODEL_DEEP falhou (${err?.message?.slice(0,80)}), usando fallback MODEL_FAST`);
            return invokeLLM({ model: MODEL_FAST, messages: [{ role: "system", content: sysConsultor }, { role: "user", content: prompt }] });
          });
      const [resB1, resB2, resB3] = await Promise.allSettled([
        callB(promptB1),
        callB(promptB2),
        callB(promptB3),
      ]);

      const tB = Date.now();
      console.log(`[simularPorMeta] Est\u00e1gio B: ${tB - tA}ms | B1=${resB1.status} B2=${resB2.status} B3=${resB3.status}`);

      const textoB1 = resB1.status === "fulfilled" ? (resB1.value.choices?.[0]?.message?.content ?? "") : "";
      const textoB2 = resB2.status === "fulfilled" ? (resB2.value.choices?.[0]?.message?.content ?? "") : "";
      const textoB3 = resB3.status === "fulfilled" ? (resB3.value.choices?.[0]?.message?.content ?? "") : "";

      if (resB1.status === "rejected") console.error("[simularPorMeta] B1 falhou:", resB1.reason);
      if (resB2.status === "rejected") console.error("[simularPorMeta] B2 falhou:", resB2.reason);
      // Guard degradado: se todos os 3 sub-estágios B falharam, marcar análise como degradada
      const todosVazios = !textoB1 && !textoB2 && !textoB3;
      if (todosVazios) {
        console.warn("[simularPorMeta] DEGRADADO: todos os estágios B falharam — análise qualitativa indisponível");
      }
      if (resB3.status === "rejected") console.error("[simularPorMeta] B3 falhou:", resB3.reason);

      // ── ESTÁGIO C: Montar JSON final (MODEL_FAST, strict, retry) ────────────────────
      const promptC = `Voc\u00ea recebeu 3 an\u00e1lises de um consultor financeiro s\u00eanior sobre uma DRE de restaurante.\nSua tarefa \u00e9 transcrever essas an\u00e1lises para o JSON estruturado abaixo.\nREGRA CR\u00cdTICA: N\u00c3O resumir, N\u00c3O suavizar, N\u00c3O omitir n\u00fameros. Transcreva a subst\u00e2ncia completa, incluindo todos os valores em R$ e percentuais citados.\n\nMETA DO GESTOR:\n- Faturamento alvo: R$ ${faturamentoMeta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- EBITDA alvo: ${resultadoMetaPct}% (R$ ${resultadoMetaRs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n\nDRE ATUAL (validada):\n- Faturamento: R$ ${fat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- CMV: ${(dreEstruturado.cmvPct * 100).toFixed(1)}% | Folha: ${(dreEstruturado.folhaPct * 100).toFixed(1)}% | EBITDA: ${(dreEstruturado.ebitdaPct * 100).toFixed(1)}%\n\n=== AN\u00c1LISE B1 (DIAGN\u00d3STICO) ===\n${textoB1 || 'An\u00e1lise n\u00e3o dispon\u00edvel.'}\n\n=== AN\u00c1LISE B2 (META E CEN\u00c1RIOS) ===\n${textoB2 || 'An\u00e1lise n\u00e3o dispon\u00edvel.'}\n\n=== AN\u00c1LISE B3 (CORTES E LACUNAS) ===\n${textoB3 || 'An\u00e1lise n\u00e3o dispon\u00edvel.'}\n\nDRE HIST\u00d3RICO COMPLETO:\n${dreContexto}\n\nPreencha o JSON com base nas an\u00e1lises acima. Para linhasCompletas, use os valores EXATOS do DRE hist\u00f3rico.`;

      let resultado: Record<string, unknown> = {};
      for (let attempt = 0; attempt < 2; attempt++) {
        const respC = await invokeLLM({
          model: MODEL_FAST,
          messages: [
            { role: "system", content: "Voc\u00ea \u00e9 um extrator de dados. Retorne apenas JSON v\u00e1lido sem markdown." },
            { role: "user", content: promptC },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "simulacao_final",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  resumo: { type: "string" },
                  viabilidade: { type: "string", enum: ["alta", "media", "baixa"] },
                  observacoes: { type: "string" },
                  dreAtual: {
                    type: "object",
                    properties: {
                      faturamento: { type: "number" }, cmv: { type: "number" }, cmvPct: { type: "number" },
                      folha: { type: "number" }, folhaPct: { type: "number" }, custosFixos: { type: "number" },
                      custosFixosPct: { type: "number" }, custosVariaveis: { type: "number" }, custosVariaveisPct: { type: "number" },
                      impostos: { type: "number" }, impostosPct: { type: "number" }, ebitda: { type: "number" }, ebitdaPct: { type: "number" },
                    },
                    required: ["faturamento","cmv","cmvPct","folha","folhaPct","custosFixos","custosFixosPct","custosVariaveis","custosVariaveisPct","impostos","impostosPct","ebitda","ebitdaPct"],
                    additionalProperties: false,
                  },
                  dreMeta: {
                    type: "object",
                    properties: {
                      faturamento: { type: "number" }, cmv: { type: "number" }, cmvPct: { type: "number" },
                      folha: { type: "number" }, folhaPct: { type: "number" }, custosFixos: { type: "number" },
                      custosFixosPct: { type: "number" }, custosVariaveis: { type: "number" }, custosVariaveisPct: { type: "number" },
                      impostos: { type: "number" }, impostosPct: { type: "number" }, ebitda: { type: "number" }, ebitdaPct: { type: "number" },
                    },
                    required: ["faturamento","cmv","cmvPct","folha","folhaPct","custosFixos","custosFixosPct","custosVariaveis","custosVariaveisPct","impostos","impostosPct","ebitda","ebitdaPct"],
                    additionalProperties: false,
                  },
                  custosFixos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { nome: { type: "string" }, valorAtualRs: { type: "number" }, pctReceita: { type: "number" }, observacao: { type: "string" } },
                      required: ["nome","valorAtualRs","pctReceita","observacao"],
                      additionalProperties: false,
                    },
                  },
                  gaps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        categoria: { type: "string" }, tipo: { type: "string", enum: ["receita","cmv","folha","fixo","variavel","imposto"] },
                        valorAtualRs: { type: "number" }, valorMetaRs: { type: "number" }, gapRs: { type: "number" },
                        pctAtual: { type: "number" }, pctMeta: { type: "number" }, prioridade: { type: "string", enum: ["alta","media","baixa"] },
                      },
                      required: ["categoria","tipo","valorAtualRs","valorMetaRs","gapRs","pctAtual","pctMeta","prioridade"],
                      additionalProperties: false,
                    },
                  },
                  planoDeAcao: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        acao: { type: "string" }, comoFazer: { type: "string" }, prazo: { type: "string" },
                        responsavel: { type: "string" }, indicadorSucesso: { type: "string" }, impactoEstimadoRs: { type: "number" },
                        categoria: { type: "string" }, dificuldade: { type: "string", enum: ["baixa","media","alta"] },
                        semanaInicio: { type: ["integer", "null"] }, checkpointNumerico: { type: ["string", "null"] }, acaoSeEstourar: { type: ["string", "null"] },
                      },
                      required: ["acao","comoFazer","prazo","responsavel","indicadorSucesso","impactoEstimadoRs"],
                      additionalProperties: false,
                    },
                  },
                  linhasCompletas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { descricao: { type: "string" }, valorAtualRs: { type: "number" }, valorMetaRs: { type: "number" }, pctAtual: { type: "number" }, pctMeta: { type: "number" }, tipo: { type: "string" }, ehFixo: { type: "boolean" } },
                      required: ["descricao","valorAtualRs","valorMetaRs","pctAtual","pctMeta","tipo","ehFixo"],
                      additionalProperties: false,
                    },
                  },
                  diagnosticoPorLinha: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { id: { type: "string" }, linha: { type: "string" }, valorPassado: { type: "number" }, pctReceita: { type: "number" }, avaliacao: { type: "string", enum: ["ok","aten\u00e7\u00e3o","melhorar"] }, comentario: { type: "string" } },
                      required: ["id","linha","valorPassado","pctReceita","avaliacao","comentario"],
                      additionalProperties: false,
                    },
                  },
                  questionamentos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { id: { type: "string" }, tema: { type: "string" }, de: { type: "number" }, para: { type: "number" }, variacaoPct: { type: "number" }, pergunta: { type: "string" } },
                      required: ["id","tema","de","para","variacaoPct","pergunta"],
                      additionalProperties: false,
                    },
                  },
                  sugestoesCorte: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { id: { type: "string" }, linha: { type: "string" }, tipo: { type: "string" }, valorAtual: { type: "number" }, valorSugerido: { type: "number" }, economiaRs: { type: "number" }, justificativa: { type: "string" } },
                      required: ["id","linha","tipo","valorAtual","valorSugerido","economiaRs","justificativa"],
                      additionalProperties: false,
                    },
                  },
                  linhasNovas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { id: { type: "string" }, nome: { type: "string" }, tipo: { type: "string" }, valorSugerido: { type: "number" }, porque: { type: "string" } },
                      required: ["id","nome","tipo","valorSugerido","porque"],
                      additionalProperties: false,
                    },
                  },
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { tipo: { type: "string" }, texto: { type: "string" } },
                      required: ["tipo","texto"],
                      additionalProperties: false,
                    },
                  },
                  resumoExecutivo: { type: "string" },
                },
                required: ["resumo","viabilidade","observacoes","dreAtual","dreMeta","custosFixos","gaps","planoDeAcao","linhasCompletas","diagnosticoPorLinha","questionamentos","sugestoesCorte","linhasNovas","insights","resumoExecutivo"],
                additionalProperties: false,
              },
            },
          },
        });
        const cC = respC.choices?.[0]?.message?.content;
        if (cC) {
          resultado = typeof cC === "string" ? JSON.parse(cC) : cC;
          break;
        }
        if (attempt === 0) console.warn("[simularPorMeta] Est\u00e1gio C: tentativa 1 retornou vazio, retentando...");
      }

      const tC = Date.now();
      console.log(`[simularPorMeta] Est\u00e1gio C: ${tC - tB}ms | Total: ${tC - t0}ms`);

      if (!resultado.dreAtual) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA n\u00e3o retornou resposta. Verifique se a planilha \u00e9 um DRE v\u00e1lido e tente novamente." });
      }

      // Defaults garantem que arrays nunca chegam undefined ao cliente
      return {
        ...resultado,
        gaps: (resultado.gaps as unknown[]) ?? [],
        planoDeAcao: (resultado.planoDeAcao as unknown[]) ?? [],
        custosFixos: (resultado.custosFixos as unknown[]) ?? [],
        linhasCompletas: (resultado.linhasCompletas as unknown[]) ?? [],
        diagnosticoPorLinha: (resultado.diagnosticoPorLinha as unknown[]) ?? [],
        questionamentos: (resultado.questionamentos as unknown[]) ?? [],
        sugestoesCorte: (resultado.sugestoesCorte as unknown[]) ?? [],
        linhasNovas: (resultado.linhasNovas as unknown[]) ?? [],
        insights: (resultado.insights as unknown[]) ?? [],
        resumoExecutivo: (resultado.resumoExecutivo as string | undefined) ?? "",
        totalLinhasHistorico: totalLinhas,
        faturamentoMeta,
        resultadoMetaPct,
        resultadoMetaRs,
        analiseDegradada: todosVazios,
      };
    }),

  // Aprova o resultado da simulação IA como orçamento ativo no sistema normal
  aprovarParaOrcamento: adminProcedure
    .input(z.object({
      lojaId: z.number().int(),
      ano: z.number().int(),
      mes: z.number().int().min(1).max(12),
      // Dados extraídos do resultado da simulação
      faturamentoMeta: z.number().min(0),
      resultadoMetaPct: z.number(),
      // Custos identificados pela IA (% sobre receita, 0-1)
      cmvPct: z.number().min(0).max(1).optional().default(0.30),
      impostosPct: z.number().min(0).max(1).optional().default(0.08),
      royaltiesPct: z.number().min(0).max(1).optional().default(0.05),
      fundoMarketingPct: z.number().min(0).max(1).optional().default(0.02),
      folhaPct: z.number().min(0).max(1).optional().default(0.25),
      aluguel: z.number().min(0).optional().default(0),
      energia: z.number().min(0).optional().default(0),
      contabilidade: z.number().min(0).optional().default(0),
      sistemas: z.number().min(0).optional().default(0),
      outrasDespesas: z.number().min(0).optional().default(0),
      notas: z.string().optional().default(""),
    }))
    .mutation(async ({ input, ctx }) => {
      const { lojaId, ano, mes, faturamentoMeta } = input;

      // Monta datas do período (primeiro ao último dia do mês)
      const periodoInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const lastDay = new Date(ano, mes, 0).getDate();
      const periodoFim = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      // Estima folha a partir do % sobre receita
      const folhaTotal = faturamentoMeta * input.folhaPct;
      const proLabore = folhaTotal * 0.15; // estima 15% como pró-labore
      const folhaCLT = folhaTotal - proLabore;
      const salarioMedioEstimado = folhaCLT / 3; // assume ~3 colaboradores

      let orcId: number;
      try {
        orcId = await saveOrcamento({
        storeId: lojaId,
        periodoInicio,
        periodoFim,
        tipo: "mensal",
        receitaBruta: faturamentoMeta,
        ticketMedio: null,
        diasOperacao: lastDay,
        taxaCartaoPct: 0.025, taxaCartaoTipo: "percentual" as const,
        taxaDeliveryPct: 0.10, taxaDeliveryTipo: "percentual" as const,
        impostosPct: input.impostosPct, impostosTipo: "percentual" as const,
        cmvPct: input.cmvPct, cmvTipo: "percentual" as const,
        royaltiesPct: input.royaltiesPct, royaltiesTipo: "percentual" as const,
        fundoMarketingPct: input.fundoMarketingPct, fundoMarketingTipo: "percentual" as const,
        aluguel: input.aluguel, aluguelTipo: "fixo",
        condominio: 0, condominioTipo: "fixo",
        energia: input.energia, energiaTipo: "fixo",
        gas: 0, gasTipo: "fixo",
        agua: 0, aguaTipo: "fixo",
        outrosOcupacao: 0, outrosOcupacaoTipo: "fixo",
        contabilidade: input.contabilidade, contabilidadeTipo: "fixo",
        sistemas: input.sistemas, sistemasTipo: "fixo",
        sanitarismo: 0, sanitarismoTipo: "fixo",
        outrosServicos: 0, outrosServicosTipo: "fixo",
        juros: 0, jurosTipo: "fixo",
        tarifasBancarias: 0, tarifasBancariasTipo: "fixo",
        marketing: 0, marketingTipo: "fixo",
        outrasDespesas: input.outrasDespesas, outrasDespesasTipo: "fixo",
        proLabore, proLaboreTipo: "fixo" as const,
        encargosPct: 0.30, encargosTipo: "percentual" as const,
        notas: input.notas || `Aprovado via Orçamento IA — ${mes}/${ano}`,
        colaboradores: salarioMedioEstimado > 0 ? [{
          funcao: "Equipe operacional",
          quantidade: 3,
          salarioBase: salarioMedioEstimado,
          ordem: 0,
        }] : [],
        });
      } catch (err: any) {
        if (err?.message?.startsWith('CONFLICT:')) {
          throw new TRPCError({ code: "CONFLICT", message: err.message.replace('CONFLICT: ', '') });
        }
        throw err;
      }


      return { orcamentoId: orcId, periodoInicio, periodoFim };
    }),

  // ───────────────────────────────────────────────────────────────────────────────────
  // BLOCO B — Endpoint para obter URL presigned de PUT (upload direto do browser)
  // ───────────────────────────────────────────────────────────────────────────────────
  getUploadUrl: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      contentType: z.string().default("application/octet-stream"),
    }))
    .mutation(async ({ input }) => {
      const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "bin";
      const key = `orcamento-uploads/${Date.now()}.${ext}`;
      const result = await storageGetPresignedPutUrl(key, input.contentType);
      return result; // { uploadUrl, key, storageUrl }
    }),

  // ───────────────────────────────────────────────────────────────────────────────────
  // BLOCO C — PASSO 1: analisarPlanilha (NÃO grava nada, devolve prévia com origem)
  // ───────────────────────────────────────────────────────────────────────────────────
  analisarPlanilha: protectedProcedure
    .input(z.object({
      // Arquivo pequeno (≤ 1,5 MB): base64 direto
      fileBase64: z.string().optional(),
      // Arquivo grande (> 1,5 MB): chave no storage (após upload direto do browser)
      storageKey: z.string().optional(),
      fileName: z.string(),
      lojaId: z.number(),
      // Abas selecionadas pelo usuário (quando o arquivo tem > 5 abas)
      selectedSheets: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.fileBase64 && !input.storageKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envie fileBase64 ou storageKey" });
      }

      // Obter o buffer do arquivo
      let fileBuffer: Buffer;
      try {
        if (input.storageKey) {
          fileBuffer = await storageDownload(input.storageKey);
        } else {
          fileBuffer = Buffer.from(input.fileBase64!, "base64");
        }
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Não foi possível obter o arquivo: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      // Parsear com o leitor único robusto (Bloco A)
      let parseResult;
      try {
        parseResult = parseSpreadsheetToGrid(fileBuffer, input.fileName, input.selectedSheets);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Erro ao ler a planilha",
        });
      }

      // Se o arquivo tem > 5 abas e nenhuma foi selecionada, pedir seleção
      if (parseResult.needsSheetSelection) {
        return {
          needsSheetSelection: true,
          sheetNames: parseResult.sheetNames,
          previa: null,
        };
      }

      // Converter grade para texto com origem (aba + linha) para o prompt da IA
      const gridText = gridToPromptText(parseResult);

      // Prompt da IA: exige origem junto de cada valor extraído
      const systemPrompt = `Você é um especialista sênior em gestão financeira de redes de restaurantes no Brasil.
Sua tarefa é analisar planilhas históricas (DRE, relatórios de vendas, etc.) e extrair premissas operacionais para um orçamento mensal.

REGRA OBRIGATÓRIA: Para CADA número extraído, você DEVE informar a origem exata no formato:
  "origem": "Aba:NomeDaAba Linha:Número"

Exemplo de retorno correto:
{
  "receitaBase": { "valor": 230000, "origem": "Aba:MAI26 Linha:14" },
  "cmvMetaPct": { "valor": 34.5, "origem": "Aba:MAI26 Linha:22" }
}

Se um campo não existir na planilha, retorne null para o valor e "" para a origem.
Responda APENAS com JSON válido, sem texto adicional.`;

      const userPrompt = `Analise esta planilha e extraia as premissas operacionais e financeiras.
Para CADA valor, informe a origem (aba + linha) exata.

${gridText}

Retorne JSON com a estrutura:
{
  "receitaBase": { "valor": number|null, "origem": string },
  "crescimentoPct": { "valor": number|null, "origem": string },
  "cmvMetaPct": { "valor": number|null, "origem": string },
  "custoFixoTotal": { "valor": number|null, "origem": string },
  "folhaPagamento": { "valor": number|null, "origem": string },
  "aluguel": { "valor": number|null, "origem": string },
  "royalties": { "valor": number|null, "origem": string },
  "taxaFundo": { "valor": number|null, "origem": string },
  "energiaEletrica": { "valor": number|null, "origem": string },
  "dayWeights": { "valor": number[]|null, "origem": string },
  "observacoes": { "valor": string|null, "origem": string }
}`;

      let iaResponse;
      try {
        iaResponse = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao analisar a planilha com IA. Tente novamente.",
        });
      }

      const rawContent = iaResponse?.choices?.[0]?.message?.content ?? "{}";
      const rawContentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      let previa: Record<string, { valor: unknown; origem: string }>;
      try {
        const cleaned = rawContentStr.replace(/```json\n?|```/g, "").trim();
        previa = JSON.parse(cleaned);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "A IA retornou um formato inesperado. Tente novamente.",
        });
      }

      return {
        needsSheetSelection: false,
        sheetNames: parseResult.sheetNames,
        previa,
      };
    }),

  // ───────────────────────────────────────────────────────────────────────────────────
  // BLOCO C — PASSO 2: confirmarImportacao (grava exatamente o que está na prévia editada)
  // A IA nunca mais grava direto.
  // ───────────────────────────────────────────────────────────────────────────────────
  confirmarImportacao: protectedProcedure
    .input(z.object({
      lojaId: z.number(),
      // Premissas editadas pelo usuário (valores finais confirmados)
      premissas: z.object({
        receitaBase: z.number().nullable(),
        crescimentoPct: z.number().nullable(),
        cmvMetaPct: z.number().nullable(),
        custoFixoTotal: z.number().nullable(),
        folhaPagamento: z.number().nullable(),
        aluguel: z.number().nullable(),
        royalties: z.number().nullable(),
        taxaFundo: z.number().nullable(),
        energiaEletrica: z.number().nullable(),
        dayWeights: z.array(z.number()).nullable(),
        observacoes: z.string().nullable(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      // Grava as premissas confirmadas pelo usuário
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = agora.getMonth() + 1;

      const premissasParaSalvar: Record<string, unknown> = {};
      if (input.premissas.receitaBase != null) premissasParaSalvar.receitaBase = input.premissas.receitaBase;
      if (input.premissas.crescimentoPct != null) premissasParaSalvar.crescimentoPct = input.premissas.crescimentoPct;
      if (input.premissas.cmvMetaPct != null) premissasParaSalvar.cmvMetaPct = input.premissas.cmvMetaPct;
      if (input.premissas.folhaPagamento != null) premissasParaSalvar.folhaPagamento = input.premissas.folhaPagamento;
      if (input.premissas.aluguel != null) premissasParaSalvar.aluguel = input.premissas.aluguel;
      if (input.premissas.royalties != null) premissasParaSalvar.royalties = input.premissas.royalties;
      if (input.premissas.taxaFundo != null) premissasParaSalvar.taxaFundo = input.premissas.taxaFundo;
      if (input.premissas.energiaEletrica != null) premissasParaSalvar.energiaEletrica = input.premissas.energiaEletrica;
      if (input.premissas.dayWeights != null) premissasParaSalvar.dayWeights = input.premissas.dayWeights;
      if (input.premissas.observacoes != null) premissasParaSalvar.observacoes = input.premissas.observacoes;

      await upsertPremissas({
        lojaId: input.lojaId,
        ano,
        mes,
        ...premissasParaSalvar,
      } as Parameters<typeof upsertPremissas>[0]);

      return { ok: true, lojaId: input.lojaId, ano, mes };
    }),

  /** A3 — Salvar decisões de revisão item-a-item da análise IA */
  salvarRevisaoIA: protectedProcedure
    .input(z.object({
      orcamentoId: z.number().int(),
      lojaId: z.number().int(),
      revisao: z.object({
        sugestoesCorte: z.record(z.string(), z.enum(["aceito", "rejeitado"])).optional(),
        linhasNovas: z.record(z.string(), z.enum(["adicionado", "ignorado"])).optional(),
        questionamentos: z.record(z.string(), z.object({
          decisao: z.literal("ciente"),
          resposta: z.string().optional(),
        })).optional(),
        // Plano de ação com guia semanal (semanaInicio/checkpointNumerico/acaoSeEstourar)
        planoDeAcao: z.array(z.object({
          acao: z.string(),
          categoria: z.string().optional(),
          impactoEstimadoRs: z.number().optional(),
          prazo: z.string().optional(),
          responsavel: z.string().optional(),
          semanaInicio: z.number().nullable().optional(),
          checkpointNumerico: z.string().nullable().optional(),
          acaoSeEstourar: z.string().nullable().optional(),
        })).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.lojaId);
      const revisaoJson = JSON.stringify(input.revisao);
      const db = await getDb();
      await (db as any).$client.promise().execute(
        'UPDATE orcamentos SET ia_revisao_json = ?, updated_at = ? WHERE id = ? AND store_id = ?',
        [revisaoJson, Date.now(), input.orcamentoId, input.lojaId]
      );
      return { ok: true };
    }),
});
