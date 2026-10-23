/**
 * turnover-4dx.test.ts
 * Testes para:
 * 1. Fórmula de turnover clássica (entradas + saídas)
 * 2. Integração do turnover como indicador computável no placar 4DX
 * 3. Semáforo lte para medida de turnover
 */

import { describe, it, expect } from "vitest";
import { avaliarAtingimento, INDICADORES_COMPUTAVEIS } from "./db-metas-auto";

// ─── Fórmula de turnover ──────────────────────────────────────────────────────

/**
 * Simula a lógica de cálculo do turnoverRate conforme a fórmula clássica.
 * turnoverRate = ((admissões + desligamentos) / 2) / quadroMédio * 100
 * quadroMédio = ativos + desligamentos / 2
 */
function calcTurnoverRate(
  hiresThisMonth: number,
  terminationsThisMonth: number,
  activeCount: number
): number {
  const quadroMedio = activeCount + terminationsThisMonth / 2;
  if (quadroMedio === 0) return 0;
  return ((hiresThisMonth + terminationsThisMonth) / 2 / quadroMedio) * 100;
}

/**
 * Fórmula ANTIGA (só saídas) — para comparar e confirmar que mudou.
 */
function calcTurnoverRateAntigo(
  terminationsThisMonth: number,
  activeCount: number
): number {
  const quadroMedio = activeCount + terminationsThisMonth / 2;
  if (quadroMedio === 0) return 0;
  return (terminationsThisMonth / quadroMedio) * 100;
}

describe("Fórmula de turnover clássica (entradas + saídas)", () => {
  it("turnover = 0 quando não há movimentos", () => {
    expect(calcTurnoverRate(0, 0, 10)).toBe(0);
  });

  it("turnover com só saídas: fórmula clássica > fórmula antiga (mais conservadora)", () => {
    // 2 saídas, 0 entradas, 10 ativos
    const nova = calcTurnoverRate(0, 2, 10);
    const antiga = calcTurnoverRateAntigo(2, 10);
    // Nova = (0+2)/2 / (10+1) * 100 = 1/11 * 100 ≈ 9.09%
    // Antiga = 2 / (10+1) * 100 ≈ 18.18%
    expect(nova).toBeCloseTo(9.09, 1);
    expect(antiga).toBeCloseTo(18.18, 1);
    // Nova fórmula é mais conservadora quando só há saídas
    expect(nova).toBeLessThan(antiga);
  });

  it("turnover com entradas e saídas balanceadas", () => {
    // 2 admissões, 2 desligamentos, 10 ativos
    const rate = calcTurnoverRate(2, 2, 10);
    // quadroMedio = 10 + 2/2 = 11
    // rate = (2+2)/2 / 11 * 100 = 2/11 * 100 ≈ 18.18%
    expect(rate).toBeCloseTo(18.18, 1);
  });

  it("turnover alto: 3 saídas, 1 entrada, 8 ativos", () => {
    const rate = calcTurnoverRate(1, 3, 8);
    // quadroMedio = 8 + 3/2 = 9.5
    // rate = (1+3)/2 / 9.5 * 100 = 2/9.5 * 100 ≈ 21.05%
    expect(rate).toBeCloseTo(21.05, 1);
  });

  it("turnover = 0 quando quadroMedio = 0 (evita divisão por zero)", () => {
    expect(calcTurnoverRate(0, 0, 0)).toBe(0);
  });

  it("turnover simétrico: 1 entrada + 1 saída em quadro de 10", () => {
    const rate = calcTurnoverRate(1, 1, 10);
    // quadroMedio = 10 + 0.5 = 10.5
    // rate = (1+1)/2 / 10.5 * 100 = 1/10.5 * 100 ≈ 9.52%
    expect(rate).toBeCloseTo(9.52, 1);
  });

  it("turnover com só admissões (crescimento)", () => {
    // 3 admissões, 0 saídas, 10 ativos
    const rate = calcTurnoverRate(3, 0, 10);
    // quadroMedio = 10 + 0 = 10
    // rate = (3+0)/2 / 10 * 100 = 1.5/10 * 100 = 15%
    expect(rate).toBeCloseTo(15, 1);
  });
});

// ─── Turnover como indicador computável ──────────────────────────────────────

describe("Turnover como indicador computável no placar 4DX", () => {
  it("'turnover' está no conjunto INDICADORES_COMPUTAVEIS", () => {
    expect(INDICADORES_COMPUTAVEIS.has("turnover")).toBe(true);
  });

  it("todos os indicadores esperados estão presentes", () => {
    const expected = ["faturamento", "cmv", "ebitda", "folha", "turnover"];
    for (const ind of expected) {
      expect(INDICADORES_COMPUTAVEIS.has(ind), `${ind} deve ser computável`).toBe(true);
    }
  });

  it("indicadores custom/subjetivos NÃO estão no conjunto", () => {
    expect(INDICADORES_COMPUTAVEIS.has("satisfacao_cliente")).toBe(false);
    expect(INDICADORES_COMPUTAVEIS.has("custom")).toBe(false);
    expect(INDICADORES_COMPUTAVEIS.has("nota_auditoria")).toBe(false);
  });
});

// ─── Semáforo lte para medida de turnover ────────────────────────────────────

describe("Semáforo lte para medida de turnover (turnover ≤ meta)", () => {
  it("turnover 5% com meta 10% → atingida (verde)", () => {
    expect(avaliarAtingimento(5, 10, "lte")).toBe(true);
  });

  it("turnover 10% com meta 10% → atingida no limite (verde)", () => {
    expect(avaliarAtingimento(10, 10, "lte")).toBe(true);
  });

  it("turnover 10.1% com meta 10% → não atingida (vermelho)", () => {
    expect(avaliarAtingimento(10.1, 10, "lte")).toBe(false);
  });

  it("turnover 15% com meta 10% → não atingida (vermelho)", () => {
    expect(avaliarAtingimento(15, 10, "lte")).toBe(false);
  });

  it("turnover 0% com meta 5% → atingida (verde — sem movimentos)", () => {
    expect(avaliarAtingimento(0, 5, "lte")).toBe(true);
  });

  it("turnover 21% com meta 8% → não atingida (vermelho — alto turnover)", () => {
    expect(avaliarAtingimento(21, 8, "lte")).toBe(false);
  });
});
