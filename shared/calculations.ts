// ─── Shared Calculation Utilities ─────────────────────────────────────────────
// Used by both server (routers) and client (display logic)

export interface DayEntry {
  entryDate: string;
  revenue: number;
  invoices: number;
  extraLabor: number;
}

export interface StockCountData {
  countDate: string;
  totalValue: number;
}

export interface StoreConfig {
  budgetRevenue: number;
  budgetCmvPct: number;
  budgetPackagingPct: number;
  budgetTaxesPct: number;
  budgetFixedCosts: number;
  dayWeights: number[];
}

export interface CMVWindow {
  iniDate: string;
  fimDate: string;
  stockIni: number;
  stockFim: number;
  invoices: number;
  revenue: number;
  cmvValue: number;
  cmvPct: number;
}

export const DEFAULT_DAY_WEIGHTS = [110, 80, 90, 95, 100, 110, 115]; // dom→sab

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function sumWeightsForMonth(weights: number[], year: number, month: number): number {
  const days = daysInMonth(year, month);
  let total = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    total += weights[dow];
  }
  return total;
}

// ─── Revenue budget for a day ─────────────────────────────────────────────────
export function budgetedRevenueForDay(config: StoreConfig, date: string): number {
  const [year, month] = date.split("-").map(Number);
  const weights = config.dayWeights?.length === 7 ? config.dayWeights : DEFAULT_DAY_WEIGHTS;
  const totalWeight = sumWeightsForMonth(weights, year, month);
  const dow = new Date(year, month - 1, parseInt(date.slice(8))).getDay();
  return (config.budgetRevenue * weights[dow]) / totalWeight;
}

// ─── CMV weekly windows ───────────────────────────────────────────────────────
export function calcCMVWindows(entries: DayEntry[], counts: StockCountData[]): CMVWindow[] {
  if (counts.length < 2) return [];
  const sorted = [...counts].sort((a, b) => a.countDate.localeCompare(b.countDate));
  const windows: CMVWindow[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const iniDate = sorted[i].countDate;
    const fimDate = sorted[i + 1].countDate;
    const stockIni = sorted[i].totalValue;
    const stockFim = sorted[i + 1].totalValue;
    const windowEntries = entries.filter((e) => e.entryDate > iniDate && e.entryDate <= fimDate);
    const invoices = windowEntries.reduce((s, e) => s + e.invoices, 0);
    const revenue = windowEntries.reduce((s, e) => s + e.revenue, 0);
    const cmvValue = stockIni + invoices - stockFim;
    const cmvPct = revenue > 0 ? (cmvValue / revenue) * 100 : 0;
    windows.push({ iniDate, fimDate, stockIni, stockFim, invoices, revenue, cmvValue, cmvPct });
  }
  return windows;
}

// ─── Accumulated month metrics ────────────────────────────────────────────────
export interface MonthAccumulated {
  revenue: number;
  invoices: number;
  extraLabor: number;
  cmvPct: number;
  cmvValue: number;
  packagingValue: number;
  taxesValue: number;
  fixedCosts: number;
  ebitda: number;           // EBITDA realizado em R$ (Regra de Ouro 1: usar para notas)
  ebitdaPct: number;
  budgetRevenue: number;
  budgetEbitda: number;     // EBITDA orçado em R$ — exposto para o motor único
  budgetEbitdaPct: number;
  revenueVsBudgetPct: number;
}

export function calcMonthAccumulated(
  entries: DayEntry[],
  counts: StockCountData[],
  config: StoreConfig,
  period: string
): MonthAccumulated {
  const [year, month] = period.split("-").map(Number);
  const daysElapsed = entries.length;
  const totalDays = daysInMonth(year, month);

  const revenue = entries.reduce((s, e) => s + e.revenue, 0);
  const invoices = entries.reduce((s, e) => s + e.invoices, 0);
  const extraLabor = entries.reduce((s, e) => s + e.extraLabor, 0);

  // CMV calculation
  const windows = calcCMVWindows(entries, counts);
  let cmvPct: number;
  if (windows.length > 0) {
    const lastWindow = windows[windows.length - 1];
    const closedRevenue = windows.reduce((s, w) => s + w.revenue, 0);
    const closedCmvValue = windows.reduce((s, w) => s + w.cmvValue, 0);
    const closedCmvPct = closedRevenue > 0 ? (closedCmvValue / closedRevenue) * 100 : config.budgetCmvPct;
    const openRevenue = revenue - closedRevenue;
    cmvPct = openRevenue > 0
      ? ((closedCmvPct / 100) * closedRevenue + (config.budgetCmvPct / 100) * openRevenue) / revenue * 100
      : closedCmvPct;
    void lastWindow;
  } else {
    cmvPct = config.budgetCmvPct;
  }

  const cmvValue = (cmvPct / 100) * revenue;
  const packagingValue = (config.budgetPackagingPct / 100) * revenue;
  const taxesValue = (config.budgetTaxesPct / 100) * revenue;
  const fixedCosts = (config.budgetFixedCosts / totalDays) * daysElapsed;
  const ebitda = revenue - cmvValue - packagingValue - taxesValue - extraLabor - fixedCosts;
  const ebitdaPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;

  // Budget EBITDA
  const budgetCmvValue = (config.budgetCmvPct / 100) * config.budgetRevenue;
  const budgetPackaging = (config.budgetPackagingPct / 100) * config.budgetRevenue;
  const budgetTaxes = (config.budgetTaxesPct / 100) * config.budgetRevenue;
  const budgetEbitda = config.budgetRevenue - budgetCmvValue - budgetPackaging - budgetTaxes - config.budgetFixedCosts;
  const budgetEbitdaPct = config.budgetRevenue > 0 ? (budgetEbitda / config.budgetRevenue) * 100 : 0;

  const revenueVsBudgetPct = config.budgetRevenue > 0 ? (revenue / config.budgetRevenue) * 100 : 0;

  return {
    revenue, invoices, extraLabor, cmvPct, cmvValue,
    packagingValue, taxesValue, fixedCosts,
    ebitda, ebitdaPct,
    budgetRevenue: config.budgetRevenue,
    budgetEbitda,   // R$ orçado — para o motor único (Regra de Ouro 1)
    budgetEbitdaPct,
    revenueVsBudgetPct,
  };
}

// ─── Score components ─────────────────────────────────────────────────────────
// ─── DESCONTINUADO em 11/07/2026 (FASE D do patch motor único) ───────────────
// scoreResult, scoreCMV, scoreQuality, scoreTotal foram removidos.
// Use shared/engine.ts: notaResultado, notaCmv, notaQualidade, notaTotal.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Ranking ──────────────────────────────────────────────────────────────────
export interface RankingInput {
  storeId: number;
  storeName: string;
  executionPct: number;   // % ações concluídas
  modulesCount: number;   // módulos concluídos
  cmvDiff: number;        // cmvReal - cmvMeta (pp)
  qualityGoogle: number | null;  // 0-100, NULL = sem apontamento
  disciplineStreak: number; // dias seguidos
  commitmentSigned: boolean;
}

export function calcConsistencyScore(r: RankingInput): number {
  const execScore = Math.min(100, r.executionPct);
  const learnScore = Math.min(100, (r.modulesCount / 9) * 100);
  const cmvScore = Math.max(0, Math.min(100, 100 - r.cmvDiff * 10));
  // qualityGoogle null = sem apontamento: neutro 50 (não penaliza, não bonifica)
  const expScore = r.qualityGoogle !== null ? Math.min(100, r.qualityGoogle) : 50;
  const discScore = Math.min(100, (r.disciplineStreak / 14) * 100);
  const commitScore = r.commitmentSigned ? 100 : 0;
  return (
    execScore * 0.25 +
    learnScore * 0.20 +
    cmvScore * 0.20 +
    expScore * 0.20 +
    discScore * 0.10 +
    commitScore * 0.05
  );
}
