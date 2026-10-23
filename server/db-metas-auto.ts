/**
 * db-metas-auto.ts
 * Helper que calcula o realizado de cada indicador computável a partir dos
 * lançamentos do mês (calcMonthAccumulated), sem precisar de input manual.
 *
 * Indicadores computáveis: faturamento, cmv, ebitda, folha
 * Indicadores não computáveis (custom/subjetivos): mantidos manuais
 */
import { getDailyEntries, getStockCounts, getStoreById } from "./db";
import { getOrcamentoVigente, calcularOrcamento } from "./db-orcamento";
import { calcMonthAccumulated } from "../shared/calculations";
import { getTurnoverStats } from "./db-pessoas";

/** Indicadores que o sistema consegue calcular automaticamente */
export const INDICADORES_COMPUTAVEIS = new Set([
  "faturamento",
  "cmv",
  "ebitda",
  "folha",
  "turnover",
]);

export interface RealizadoIndicadores {
  faturamento: number;   // receita bruta acumulada no mês (R$)
  cmv: number;           // CMV % da receita
  ebitda: number;        // EBITDA % da receita
  folha: number;         // folha % da receita (do orçamento aprovado — não há folha real no daily)
  turnover: number;      // turnover % do mês ((admissões+saídas)/2/quadroMédio*100)
}

/**
 * Calcula o realizado de cada indicador computável para a loja/período.
 * Retorna null quando não há lançamentos suficientes para calcular.
 */
export async function realizadoPorIndicador(
  storeId: number,
  period: string // YYYY-MM
): Promise<RealizadoIndicadores | null> {
  const [y, m] = period.split("-").map(Number);
  const from = `${period}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${period}-${String(lastDay).padStart(2, "0")}`;

  // Buscar lançamentos e contagens do mês
  const entries = await getDailyEntries(storeId, from, to);
  if (entries.length === 0) return null;

  const counts = await getStockCounts(storeId, from, to);

  // Montar StoreConfig a partir da loja ou do orçamento vigente
  const store = await getStoreById(storeId);
  if (!store) return null;

  const toNum = (v: string | null | undefined, def = 0) => v != null ? parseFloat(String(v)) || def : def;
  let config = {
    budgetRevenue: toNum(store.budgetRevenue),
    budgetCmvPct: toNum(store.budgetCmvPct, 30),
    budgetPackagingPct: toNum(store.budgetPackagingPct, 4),
    budgetTaxesPct: toNum(store.budgetTaxesPct, 3),
    budgetFixedCosts: toNum(store.budgetFixedCosts),
    dayWeights: (store.dayWeights as number[] | null) ?? [110, 80, 90, 95, 100, 110, 115],
  };

  // Se há orçamento aprovado, usar os parâmetros dele (mais precisos)
  const orc = await getOrcamentoVigente(storeId, period);
  let folhaPctOrcado = 0;
  if (orc) {
    const calc = calcularOrcamento(orc, orc.colaboradores ?? []);
    config = {
      budgetRevenue: orc.receitaBruta,
      budgetCmvPct: orc.cmvTipo === "percentual" ? orc.cmvPct * 100 : (orc.receitaBruta > 0 ? (orc.cmvPct / orc.receitaBruta) * 100 : 30),
      budgetPackagingPct: 0,
      budgetTaxesPct: 0,
      budgetFixedCosts: 0,
      dayWeights: [80, 100, 100, 100, 110, 130, 120],
    };
    // Folha % do orçamento (não há folha real no daily — usamos o orçado como proxy)
    folhaPctOrcado = orc.receitaBruta > 0 ? (calc.colaboradores / orc.receitaBruta) * 100 : 0;
  }

  const entriesNum = entries.map(e => ({
    entryDate: String(e.entryDate),
    revenue: toNum(String(e.revenue)),
    invoices: toNum(String(e.invoices)),
    extraLabor: toNum(String(e.extraLabor)),
  }));
  const countsNum = counts.map(c => ({
    countDate: String(c.countDate),
    totalValue: toNum(String(c.totalValue)),
  }));

  const acc = calcMonthAccumulated(entriesNum, countsNum, config, period);

  return {
    faturamento: acc.revenue,
    cmv: acc.cmvPct,
    ebitda: acc.ebitdaPct,
    // Folha: sem dado real no daily, usamos o orçado como proxy (melhor que zero)
    folha: folhaPctOrcado,
    // Turnover: calculado a partir dos staff_movements do mês
    turnover: (await getTurnoverStats(storeId, period)).turnoverRate,
  };
}

/**
 * Avalia se o realizado atinge a meta conforme o operador.
 * "lte" → realizado <= meta (ex: CMV deve estar ABAIXO da meta)
 * "gte" → realizado >= meta (ex: faturamento deve estar ACIMA da meta)
 * "eq"  → realizado === meta (tolerância de 0.01%)
 */
export function avaliarAtingimento(
  realizado: number,
  metaValor: number,
  operador: "lte" | "gte" | "eq"
): boolean {
  switch (operador) {
    case "lte": return realizado <= metaValor;
    case "gte": return realizado >= metaValor;
    case "eq":  return Math.abs(realizado - metaValor) / (metaValor || 1) < 0.0001;
  }
}
