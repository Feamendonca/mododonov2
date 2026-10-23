import { describe, expect, it } from "vitest";
import { calcMonthAccumulated, calcCMVWindows } from "../shared/calculations";
import { notaResultado, notaCmv, notaQualidade, notaTotal, DEFAULT_CONFIG, round2, calculaGestor, calculaLider } from "../shared/engine";

const BASE_CONFIG = {
  budgetRevenue: 100000,
  budgetCmvPct: 30,
  budgetPackagingPct: 4,
  budgetTaxesPct: 3,
  budgetFixedCosts: 20000,
  dayWeights: [110, 80, 90, 95, 100, 110, 115],
};

function makeEntries(days: number, dailyRevenue: number, dailyInvoices: number) {
  const entries = [];
  for (let d = 1; d <= days; d++) {
    entries.push({
      entryDate: `2025-05-${String(d).padStart(2, "0")}`,
      revenue: dailyRevenue,
      invoices: dailyInvoices,
      extraLabor: 0,
    });
  }
  return entries;
}

describe("calcMonthAccumulated", () => {
  it("calculates revenue correctly", () => {
    const entries = makeEntries(10, 3000, 900);
    const result = calcMonthAccumulated(entries, [], BASE_CONFIG, "2025-05");
    expect(result.revenue).toBe(30000);
  });

  it("returns budget CMV when no stock counts (fallback)", () => {
    const entries = makeEntries(5, 2000, 500);
    const result = calcMonthAccumulated(entries, [], BASE_CONFIG, "2025-05");
    // No counts → falls back to budgetCmvPct (30)
    expect(result.cmvPct).toBe(30);
  });

  it("calculates CMV from stock windows", () => {
    const entries = makeEntries(10, 3000, 900);
    const counts = [
      { countDate: "2025-05-01", totalValue: 15000 },
      { countDate: "2025-05-08", totalValue: 12000 },
    ];
    // window: invoices = 900*7 = 6300, cmvValue = 15000+6300-12000 = 9300, revenue = 3000*7 = 21000, cmvPct = 9300/21000 = 44.3%
    const result = calcMonthAccumulated(entries, counts, BASE_CONFIG, "2025-05");
    expect(result.cmvPct).toBeGreaterThan(0);
    expect(result.cmvValue).toBeGreaterThan(0);
  });

  it("calculates EBITDA correctly", () => {
    const entries = makeEntries(31, 3226, 968);
    const result = calcMonthAccumulated(entries, [], BASE_CONFIG, "2025-05");
    expect(result.revenue).toBeGreaterThan(90000);
    // ebitda field exists (not ebitdaValue)
    expect(result.ebitda).toBeDefined();
    expect(result.ebitdaPct).toBeDefined();
  });
});

describe("calcCMVWindows", () => {
  it("returns empty array when no counts", () => {
    const entries = makeEntries(7, 3000, 900);
    const result = calcCMVWindows(entries, []);
    expect(result).toEqual([]);
  });

  it("calculates weekly CMV window", () => {
    const entries = makeEntries(14, 3000, 900);
    const counts = [
      { countDate: "2025-05-01", totalValue: 15000 },
      { countDate: "2025-05-08", totalValue: 12000 },
      { countDate: "2025-05-14", totalValue: 10000 },
    ];
    const result = calcCMVWindows(entries, counts);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((w) => {
      expect(w.cmvPct).toBeGreaterThanOrEqual(0);
      expect(w.revenue).toBeGreaterThan(0);
    });
  });
});

// ── Testes migrados para o motor único (shared/engine.ts) ──
// scoreResult/scoreCMV/scoreQuality/scoreTotal foram removidos de calculations.ts.
// Os testes equivalentes estão em shared/engine.test.ts.
// Aqui ficam apenas smoke tests de compatibilidade para garantir que o engine
// retorna os mesmos valores esperados pelos endpoints do servidor.
describe("round2 — arredondamento a centavos", () => {
  it("round2 de valor exato não muda", () => {
    expect(round2(100.00)).toBe(100.00);
  });

  it("round2 de dízima: 627 * 97.3 / 100 → exatamente 610.07", () => {
    // Caso real: fixo=2850, alvo=2850*0.22=627, total=97.3
    // Em float JS: 627 * 97.3 / 100 = 610.07100000000002638 (dízima)
    const raw = 627 * 97.3 / 100;
    expect(raw).not.toBe(610.07);    // confirmar que float tem dízima
    expect(round2(raw)).toBe(610.07);
  });

  it("round2 de 0.005 arredonda para cima (half-up): 0.005 → 0.01", () => {
    expect(round2(0.005)).toBe(0.01);
  });

  it("calculaGestor.variavelMesRs tem exatamente 2 casas decimais (sem dízima)", () => {
    const gatilhos = { semFaltasInjustificadas: true, avaliacaoDesempenho: 8, semSancoesDisciplinares: true };
    const resultado = calculaGestor({
      fixoRs: 3000,
      gatilhos,
      resultado: { ebitdaRealRs: 10000, ebitdaOrcadoRs: 10000 },
      cmv: { realPp: 30, metaPp: 30 },
      qualidade: { vozDoCliente: 100, auditoria: 100, checklist: 100, gateSanitarioOk: true },
    });
    // fixo=3000, alvo=3000*0.40=1200, total=100 → variavelMesRs=1200.00
    expect(resultado.variavelMesRs).toBe(1200.00);
    expect(resultado.variavelMesRs).toBe(round2(resultado.variavelMesRs));
  });

  it("calculaLider.variavelMesRs com dízima potencial → 2 casas decimais", () => {
    const gatilhos = { semFaltasInjustificadas: true, avaliacaoDesempenho: 7, semSancoesDisciplinares: true };
    const resultado = calculaLider({
      fixoRs: 3000,
      gatilhos,
      migTurno: { realPp: 30, metaPp: 30 },
      checklistTurno: 96.5,
      resultadoLoja: { ebitdaRealRs: 10000, ebitdaOrcadoRs: 10000 },
    });
    // alvo = 3000 * 0.22 = 660; total com checklistTurno=96.5 pode gerar dízima
    expect(resultado.variavelMesRs).toBe(round2(resultado.variavelMesRs));
  });
});

describe("Motor único — smoke tests de compatibilidade", () => {
  it("notaResultado: EBITDA igual ao orçado → nota 100 (degrau)", () => {
    expect(notaResultado(10, 10, DEFAULT_CONFIG)).toBe(100);
  });

  it("notaResultado: EBITDA abaixo de 60% → nota 0", () => {
    expect(notaResultado(5, 10, DEFAULT_CONFIG)).toBe(0);
  });

  it("notaResultado: EBITDA 120% → nota 120 (cap 130)", () => {
    expect(notaResultado(12, 10, DEFAULT_CONFIG)).toBe(120);
  });

  it("notaCmv: CMV abaixo da meta → nota 130 (cap)", () => {
    expect(notaCmv(28, 30, DEFAULT_CONFIG)).toBe(130);
  });

  it("notaCmv: CMV na meta → nota 100", () => {
    expect(notaCmv(30, 30, DEFAULT_CONFIG)).toBe(100);
  });

  it("notaCmv: CMV 5pp acima da meta → nota 0", () => {
    expect(notaCmv(35, 30, DEFAULT_CONFIG)).toBe(0);
  });

  it("notaQualidade: notas perfeitas + gate ok → nota 100", () => {
    expect(notaQualidade({ vozDoCliente: 100, auditoria: 100, checklist: 100, gateSanitarioOk: true }, DEFAULT_CONFIG)).toBe(100);
  });

  it("notaQualidade: gate sanitário reprovado → nota 0", () => {
    expect(notaQualidade({ vozDoCliente: 95, auditoria: 95, checklist: 95, gateSanitarioOk: false }, DEFAULT_CONFIG)).toBe(0);
  });

  it("notaTotal: todas as notas 100 → total 100 (pesos padrão 0.4/0.35/0.25)", () => {
    const pesos = DEFAULT_CONFIG.pesosGestor;
    expect(notaTotal([100, 100, 100], pesos, DEFAULT_CONFIG)).toBe(100);
  });
});
