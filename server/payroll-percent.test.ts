/**
 * payroll-percent.test.ts
 * Testes unitários para o fix de % Folha/receita.
 *
 * Cobre:
 *  1. calcEmployeeCosts — cálculo correto de custo mensal
 *  2. payrollPercent — calculado corretamente quando receita é fornecida
 *  3. payrollPercent — null quando receita é zero/ausente
 *  4. Lógica do threshold do banner (meta configurável vs fixo 20)
 *  5. Lógica da sugestão "folha acima da meta" (trigger 3 em generatePeopleSuggestions)
 */

import { describe, it, expect } from "vitest";
import { calcEmployeeCosts } from "../server/db-pessoas";

// ─── Helpers para simular a lógica sem banco ─────────────────────────────────

/** Simula o cálculo de payrollPercent que getPayrollSummary faz */
function calcPayrollPercent(
  employees: Array<{ salaryBase: number; transportAllowance: number; mealAllowance: number; otherBenefits: number; hoursPerMonth: number }>,
  chargesPercent: number,
  monthlyRevenue: number | null
): number | null {
  const totalCost = employees.reduce((sum, emp) => {
    const { monthlyCost } = calcEmployeeCosts(emp, chargesPercent);
    return sum + monthlyCost;
  }, 0);
  if (!monthlyRevenue || monthlyRevenue <= 0) return null;
  return (totalCost / monthlyRevenue) * 100;
}

/** Simula a lógica do banner de folha no HojePage */
function bannerFolhaAtivo(payrollPercent: number | null, payrollTargetPercent: number): boolean {
  return payrollPercent != null && payrollPercent > payrollTargetPercent;
}

/** Simula a lógica da sugestão "folha acima da meta" */
function sugestaoFolhaGerada(payrollPercent: number | null, payrollTargetPercent: number, tolerancia = 3): boolean {
  return payrollPercent !== null && payrollPercent > payrollTargetPercent + tolerancia;
}

// ─── Testes de calcEmployeeCosts ──────────────────────────────────────────────

describe("calcEmployeeCosts", () => {
  it("calcula custo mensal corretamente com encargos 70%", () => {
    const { monthlyCost } = calcEmployeeCosts({
      salaryBase: 2000,
      transportAllowance: 200,
      mealAllowance: 300,
      otherBenefits: 0,
      hoursPerMonth: 220,
    }, 70);
    // 2000 * 1.7 + 200 + 300 = 3400 + 500 = 3900
    expect(monthlyCost).toBeCloseTo(3900, 1);
  });

  it("calcula hourlyRate corretamente", () => {
    const { hourlyRate } = calcEmployeeCosts({
      salaryBase: 2000,
      transportAllowance: 0,
      mealAllowance: 0,
      otherBenefits: 0,
      hoursPerMonth: 200,
    }, 0);
    // 2000 / 200 = 10
    expect(hourlyRate).toBeCloseTo(10, 2);
  });

  it("hourlyRate é 0 quando hoursPerMonth é 0", () => {
    const { hourlyRate } = calcEmployeeCosts({
      salaryBase: 2000,
      transportAllowance: 0,
      mealAllowance: 0,
      otherBenefits: 0,
      hoursPerMonth: 0,
    }, 70);
    expect(hourlyRate).toBe(0);
  });
});

// ─── Testes de payrollPercent ─────────────────────────────────────────────────

describe("payrollPercent", () => {
  const employees = [
    { salaryBase: 2000, transportAllowance: 200, mealAllowance: 300, otherBenefits: 0, hoursPerMonth: 220 },
    { salaryBase: 1800, transportAllowance: 150, mealAllowance: 250, otherBenefits: 0, hoursPerMonth: 220 },
  ];
  const chargesPercent = 70;

  it("retorna payrollPercent correto quando receita é fornecida", () => {
    // Emp1: 2000*1.7 + 500 = 3900; Emp2: 1800*1.7 + 400 = 3460; Total = 7360
    // Receita: 40000 → 7360/40000*100 = 18.4%
    const pct = calcPayrollPercent(employees, chargesPercent, 40000);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(18.4, 1);
  });

  it("retorna null quando receita é null", () => {
    const pct = calcPayrollPercent(employees, chargesPercent, null);
    expect(pct).toBeNull();
  });

  it("retorna null quando receita é 0", () => {
    const pct = calcPayrollPercent(employees, chargesPercent, 0);
    expect(pct).toBeNull();
  });

  it("retorna null quando receita é negativa", () => {
    const pct = calcPayrollPercent(employees, chargesPercent, -1000);
    expect(pct).toBeNull();
  });

  it("payrollPercent alto quando folha é grande vs receita pequena", () => {
    const pct = calcPayrollPercent(employees, chargesPercent, 20000);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(30); // 7360/20000*100 = 36.8%
  });
});

// ─── Testes do banner de folha ────────────────────────────────────────────────

describe("banner de folha — threshold configurável", () => {
  it("banner dispara quando folha > meta configurada (18%)", () => {
    expect(bannerFolhaAtivo(19, 18)).toBe(true);
  });

  it("banner NÃO dispara quando folha = meta (18%)", () => {
    expect(bannerFolhaAtivo(18, 18)).toBe(false);
  });

  it("banner NÃO dispara quando folha < meta (18%)", () => {
    expect(bannerFolhaAtivo(16, 18)).toBe(false);
  });

  it("banner NÃO dispara quando payrollPercent é null", () => {
    expect(bannerFolhaAtivo(null, 18)).toBe(false);
  });

  it("banner dispara com meta 20% (fallback antigo) quando folha é 21%", () => {
    expect(bannerFolhaAtivo(21, 20)).toBe(true);
  });

  it("banner NÃO dispara com meta 20% quando folha é 19%", () => {
    expect(bannerFolhaAtivo(19, 20)).toBe(false);
  });
});

// ─── Testes da sugestão "folha acima da meta" ─────────────────────────────────

describe("sugestão folha acima da meta", () => {
  it("sugestão gerada quando folha > meta + 3pp", () => {
    expect(sugestaoFolhaGerada(22, 18)).toBe(true); // 22 > 18+3=21 → true
  });

  it("sugestão NÃO gerada quando folha = meta + 3pp (limite)", () => {
    expect(sugestaoFolhaGerada(21, 18)).toBe(false); // 21 > 21 → false
  });

  it("sugestão NÃO gerada quando folha está dentro da meta", () => {
    expect(sugestaoFolhaGerada(17, 18)).toBe(false);
  });

  it("sugestão NÃO gerada quando payrollPercent é null", () => {
    expect(sugestaoFolhaGerada(null, 18)).toBe(false);
  });

  it("sugestão gerada com meta 18% e folha 25%", () => {
    expect(sugestaoFolhaGerada(25, 18)).toBe(true); // 25 > 21 → true
  });
});
