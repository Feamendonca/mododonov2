import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPodeAcessarLoja, assertPodeExcluirLancamento } from "../auth-helpers";
import { getDb, rawQuery } from "../db";
import { TRPCError } from "@trpc/server";
import { getOrcamentoVigente, calcularOrcamento, listLinhasCustom } from "../db-orcamento";
import { getDailyEntries, getStockCounts } from "../db";
import { calcMonthAccumulated } from "../../shared/calculations";

// Categorias do DRE — espelham as linhas do orçamento
export const CATEGORIAS_DRE = [
  "receita",        // automático — não lançável
  "cmv",            // automático — não lançável
  "folha",
  "encargos",
  "pro_labore",
  "aluguel",
  "condominio",
  "energia",
  "gas",
  "agua",
  "outros_ocupacao",
  "royalties",
  "fundo_marketing",
  "marketing",
  "contabilidade",
  "sistemas",
  "sanitarismo",
  "outros_servicos",
  "impostos",
  "taxa_cartao",
  "taxa_delivery",
  "juros",
  "tarifas_bancarias",
  "manutencao",
  "outras_despesas",
] as const;

export type CategoriaDre = typeof CATEGORIAS_DRE[number];

const categoriaSchema = z.enum(CATEGORIAS_DRE);

export const despesasRouter = router({
  /** Lançar uma despesa no mês */
  lancar: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      categoria: categoriaSchema,
      valor: z.number().positive(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      descricao: z.string().max(500).optional(),
      fornecedor: z.string().max(200).optional(),
      observacao: z.string().max(500).optional(),
      fonte: z.enum(["manual", "manutencao", "importacao"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const createdAt = Date.now();
      const [result] = await (db as any).$client.promise().execute(
        `INSERT INTO despesas_mes (storeId, period, categoria, valor, data, descricao, fornecedor, observacao, fonte, conferido, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [input.storeId, input.period, input.categoria, input.valor, input.data,
         input.descricao ?? null, input.fornecedor ?? null, input.observacao ?? null, input.fonte, ctx.user.id, createdAt]
      );
      return { id: (result as any).insertId, ok: true };
    }),

  /** Listar fornecedores usados em uma categoria (para autocomplete) */
  fornecedores: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      categoria: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      // Retorna fornecedores distintos da categoria, ordenados por frequência desc
      const [rows] = await (db as any).$client.promise().execute(
        `SELECT fornecedor, COUNT(*) as freq, MAX(createdAt) as ultimo
         FROM despesas_mes WHERE storeId = ? AND categoria = ? AND fornecedor IS NOT NULL AND fornecedor != ''
         GROUP BY fornecedor ORDER BY freq DESC, ultimo DESC LIMIT 20`,
        [input.storeId, input.categoria]
      );
      return (rows as any[]).map(r => r.fornecedor as string);
    }),

  /** Listar despesas de uma loja/mês */
  list: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const [rows] = await (db as any).$client.promise().execute(
        `SELECT id, storeId, period, categoria, valor, data, descricao, fornecedor, observacao, fonte, conferido, createdBy, createdAt
         FROM despesas_mes WHERE storeId = ? AND period = ? ORDER BY data ASC, id ASC`,
        [input.storeId, input.period]
      );
      return (rows as any[]).map(r => ({
        id: Number(r.id),
        storeId: Number(r.storeId),
        period: r.period as string,
        categoria: r.categoria as CategoriaDre,
        valor: Number(r.valor),
        data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data),
        descricao: r.descricao as string | null,
        fornecedor: r.fornecedor as string | null,
        observacao: r.observacao as string | null,
        fonte: r.fonte as string,
        conferido: Boolean(r.conferido),
        createdBy: r.createdBy ? Number(r.createdBy) : null,
        createdAt: Number(r.createdAt),
      }));
    }),

  /** Excluir uma despesa */
  excluir: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      storeId: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Buscar despesa para obter data
      const rows = await rawQuery(
        `SELECT id, DATE_FORMAT(data, '%Y-%m-%d') AS data FROM despesas_mes WHERE id = ? AND storeId = ? LIMIT 1`,
        [input.id, input.storeId]
      );
      if ((rows as any[]).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada" });
      }
      const despesa = (rows as any[])[0];
      await assertPodeExcluirLancamento(ctx, input.storeId, despesa.data);
      await rawQuery(`DELETE FROM despesas_mes WHERE id = ?`, [input.id]);
      return { ok: true };
    }),

  /** Resumo por categoria — soma de despesas por linha do DRE no mês */
  resumoPorCategoria: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const [rows] = await (db as any).$client.promise().execute(
        `SELECT categoria, SUM(valor) as total
         FROM despesas_mes WHERE storeId = ? AND period = ?
         GROUP BY categoria`,
        [input.storeId, input.period]
      );
      const map: Record<string, number> = {};
      for (const r of rows as any[]) {
        map[r.categoria as string] = Number(r.total);
      }
      return map;
    }),

  /** DRE Viva: orçado × realizado × falta por linha */
  resumoDreViva: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, period } = input;
      const [y, m] = period.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const from = `${period}-01`;
      const to = `${period}-${String(lastDay).padStart(2, "0")}`;

      // 1. Orçamento vigente
      const orc = await getOrcamentoVigente(storeId, period);
      if (!orc) {
        return { semOrcamento: true, linhas: [], resumo: null };
      }
      const linhasCustom = await listLinhasCustom(storeId, period);
      const calc = calcularOrcamento(orc, orc.colaboradores ?? [], linhasCustom);

      // 2. Receita realizada (daily_entries)
      const entries = await getDailyEntries(storeId, from, to);
      const receitaRealizada = entries.reduce((s: number, e: any) => s + (Number(e.revenue) || 0), 0);

      // 3. CMV realizado (calcMonthAccumulated)
      const counts = await getStockCounts(storeId, from, to);
      const config = {
        budgetRevenue: orc.receitaBruta,
        budgetCmvPct: orc.cmvTipo === "percentual" ? orc.cmvPct * 100 : (orc.receitaBruta > 0 ? (orc.cmvPct / orc.receitaBruta) * 100 : 28),
        budgetPackagingPct: 0,
        budgetTaxesPct: 0,
        budgetFixedCosts: 0,
        dayWeights: [80, 100, 100, 100, 110, 130, 120],
      };
      const acc = calcMonthAccumulated(entries as any, counts as any, config as any, period);
      const cmvRealizado = acc.cmvValue;

      // 4. Despesas realizadas por categoria
      const db = await (await import("../db")).getDb();
      const [despRows] = await (db as any).$client.promise().execute(
        `SELECT categoria, SUM(valor) as total FROM despesas_mes WHERE storeId = ? AND period = ? GROUP BY categoria`,
        [storeId, period]
      );
      const despMap: Record<string, number> = {};
      for (const r of despRows as any[]) {
        despMap[r.categoria as string] = Number(r.total);
      }

      // 5. Montar linhas do DRE
      const lr = calc.linhasResolvidas;
      const linhas = [
        { id: "receita", label: "Receita Bruta", orcado: calc.receitaBruta, realizado: receitaRealizada, tipo: "receita" as const },
        { id: "cmv", label: "CMV", orcado: calc.cmv, realizado: cmvRealizado, tipo: "despesa" as const },
        { id: "folha", label: "Folha + Encargos", orcado: calc.colaboradores, realizado: (despMap["folha"] ?? 0) + (despMap["encargos"] ?? 0) + (despMap["pro_labore"] ?? 0), tipo: "despesa" as const },
        { id: "aluguel", label: "Aluguel", orcado: lr.aluguel, realizado: despMap["aluguel"] ?? 0, tipo: "despesa" as const },
        { id: "condominio", label: "Condomínio", orcado: lr.condominio, realizado: despMap["condominio"] ?? 0, tipo: "despesa" as const },
        { id: "energia", label: "Energia", orcado: lr.energia, realizado: despMap["energia"] ?? 0, tipo: "despesa" as const },
        { id: "gas", label: "Gás", orcado: lr.gas, realizado: despMap["gas"] ?? 0, tipo: "despesa" as const },
        { id: "agua", label: "Água", orcado: lr.agua, realizado: despMap["agua"] ?? 0, tipo: "despesa" as const },
        { id: "royalties", label: "Royalties", orcado: calc.royalties, realizado: despMap["royalties"] ?? 0, tipo: "despesa" as const },
        { id: "fundo_marketing", label: "Fundo de Marketing", orcado: calc.fundoMarketing, realizado: despMap["fundo_marketing"] ?? 0, tipo: "despesa" as const },
        { id: "marketing", label: "Marketing Local", orcado: lr.marketing, realizado: despMap["marketing"] ?? 0, tipo: "despesa" as const },
        { id: "contabilidade", label: "Contabilidade", orcado: lr.contabilidade, realizado: despMap["contabilidade"] ?? 0, tipo: "despesa" as const },
        { id: "sistemas", label: "Sistemas", orcado: lr.sistemas, realizado: despMap["sistemas"] ?? 0, tipo: "despesa" as const },
        { id: "sanitarismo", label: "Sanitarismo", orcado: lr.sanitarismo, realizado: despMap["sanitarismo"] ?? 0, tipo: "despesa" as const },
        { id: "impostos", label: "Impostos", orcado: calc.impostos, realizado: despMap["impostos"] ?? 0, tipo: "despesa" as const },
        { id: "taxa_cartao", label: "Taxa Cartão", orcado: calc.deducoes, realizado: despMap["taxa_cartao"] ?? 0, tipo: "despesa" as const },
        { id: "manutencao", label: "Manutenção", orcado: 0, realizado: despMap["manutencao"] ?? 0, tipo: "despesa" as const },
        { id: "outras_despesas", label: "Outras Despesas", orcado: lr.outrasDespesas + lr.proLabore, realizado: despMap["outras_despesas"] ?? 0, tipo: "despesa" as const },
      ].filter(l => l.orcado > 0 || l.realizado > 0);

      // EBITDA realizado = receita - todas as despesas realizadas
      const totalDespesasRealizadas = linhas
        .filter(l => l.tipo === "despesa")
        .reduce((s, l) => s + l.realizado, 0);
      const ebitdaRealizado = receitaRealizada - totalDespesasRealizadas;

      return {
        semOrcamento: false,
        linhas,
        resumo: {
          receitaOrcada: calc.receitaBruta,
          receitaRealizada,
          ebitdaOrcado: calc.ebitda,
          ebitdaRealizado,
          ebitdaOrcadoPct: calc.ebitdaPct,
          ebitdaRealizadoPct: receitaRealizada > 0 ? ebitdaRealizado / receitaRealizada : 0,
        },
    };
  }),

  /** Todos os fornecedores da loja com categoria sugerida */
  fornecedoresLoja: protectedProcedure
    .input(z.object({ storeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const rows = await rawQuery(
        `SELECT fornecedor, categoria, COUNT(*) as freq, MAX(createdAt) as ultimo
         FROM despesas_mes WHERE storeId = ? AND fornecedor IS NOT NULL AND fornecedor != ''
         GROUP BY fornecedor, categoria ORDER BY freq DESC`,
        [input.storeId]
      );
      // Para cada fornecedor, escolher a categoria de maior freq (desempate por ultimo)
      const map = new Map<string, { categoriaSugerida: string; totalFreq: number; maxFreq: number; maxUltimo: number }>();
      for (const r of rows as any[]) {
        const f = r.fornecedor as string;
        const freq = Number(r.freq);
        const ultimo = Number(r.ultimo ?? 0);
        const existing = map.get(f);
        if (!existing) {
          map.set(f, { categoriaSugerida: r.categoria, totalFreq: freq, maxFreq: freq, maxUltimo: ultimo });
        } else {
          existing.totalFreq += freq;
          if (freq > existing.maxFreq || (freq === existing.maxFreq && ultimo > existing.maxUltimo)) {
            existing.categoriaSugerida = r.categoria;
            existing.maxFreq = freq;
            existing.maxUltimo = ultimo;
          }
        }
      }
      return Array.from(map.entries())
        .sort((a, b) => b[1].totalFreq - a[1].totalFreq)
        .map(([fornecedor, { categoriaSugerida }]) => ({ fornecedor, categoriaSugerida }));
    }),

  /** Lançar despesas em lote */
  lancarLote: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      itens: z.array(z.object({
        categoria: categoriaSchema,
        valor: z.number().positive(),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fornecedor: z.string().max(200).optional(),
        observacao: z.string().max(500).optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const createdAt = Date.now();

      // Verificar mês fechado para todos os itens
      const mesesUnicos = Array.from(new Set(input.itens.map(i => i.data.slice(0, 7))));
      for (const anoMes of mesesUnicos) {
        const fechRows = await rawQuery(
          `SELECT id FROM dre_fechamentos WHERE store_id = ? AND ano_mes = ? AND status = 'fechado' LIMIT 1`,
          [input.storeId, anoMes]
        );
        if ((fechRows as any[]).length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: `Mês ${anoMes} está fechado — não é possível lançar despesas.` });
        }
      }

      // Inserir em lote
      let inseridas = 0;
      for (const item of input.itens) {
        const period = item.data.slice(0, 7);
        await rawQuery(
          `INSERT INTO despesas_mes (storeId, period, categoria, valor, data, descricao, fornecedor, observacao, fonte, conferido, createdBy, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, ?, ?)`,
          [input.storeId, period, item.categoria, item.valor, item.data,
           null, item.fornecedor ?? null, item.observacao ?? null, ctx.user.id, createdAt]
        );
        inseridas++;
      }
      return { inseridas };
    }),
});
