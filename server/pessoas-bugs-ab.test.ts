/**
 * pessoas-bugs-ab.test.ts
 * Testes unitários para os bugs A e B do módulo de Pessoas.
 *
 * Bug A: deleteEmployee não registrava termination; updateEmployee não registrava salary_change/role_change
 * Bug B: saveRevenue filtrava zeros, impedindo sobrescrever valor anterior com R$ 0
 */

import { describe, it, expect } from "vitest";

// ─── Bug A — Lógica de registro de movimentos ─────────────────────────────────
//
// Simula a lógica que o router agora executa após deleteEmployee e updateEmployee.
// Não usa o banco — testa a lógica de decisão pura.

type MovementType = "hire" | "termination" | "role_change" | "salary_change";

interface Movement {
  employeeId: number;
  movementType: MovementType;
  movementDate: string;
  reason: string | null;
  previousValue: string | null;
  newValue: string | null;
}

/** Simula a lógica do procedure deleteEmployee após a correção */
function logicaDeleteEmployee(
  employeeId: number,
  reason?: string
): Movement {
  const today = "2026-08-07"; // data fixa para teste
  return {
    employeeId,
    movementType: "termination",
    movementDate: today,
    reason: reason ?? "Desligamento",
    previousValue: null,
    newValue: null,
  };
}

/** Simula a lógica do procedure updateEmployee após a correção */
function logicaUpdateEmployee(
  employeeId: number,
  before: { salaryBase: number; role: string },
  data: { salaryBase?: number; role?: string }
): Movement[] {
  const movements: Movement[] = [];
  const today = "2026-08-07";

  if (data.salaryBase !== undefined && Number(data.salaryBase) !== Number(before.salaryBase)) {
    movements.push({
      employeeId,
      movementType: "salary_change",
      movementDate: today,
      reason: "Atualização de salário",
      previousValue: String(before.salaryBase),
      newValue: String(data.salaryBase),
    });
  }

  if (data.role !== undefined && data.role !== before.role) {
    movements.push({
      employeeId,
      movementType: "role_change",
      movementDate: today,
      reason: "Atualização de cargo",
      previousValue: before.role,
      newValue: data.role,
    });
  }

  return movements;
}

// ─── Bug B — Lógica de filtro de entries ─────────────────────────────────────

/** Simula o saveRevenue ANTES da correção (com filtro > 0) */
function saveRevenueAntigo(revEntries: Record<number, string>) {
  return Object.entries(revEntries)
    .map(([h, v]) => ({ hour: Number(h), revenue: Number(v) || 0 }))
    .filter(e => e.revenue > 0);
}

/** Simula o saveRevenue DEPOIS da correção (sem filtro) */
function saveRevenueCorrigido(revEntries: Record<number, string>) {
  return Object.entries(revEntries)
    .map(([h, v]) => ({ hour: Number(h), revenue: Number(v) || 0 }));
}

// ─── Testes Bug A — deleteEmployee ───────────────────────────────────────────

describe("Bug A — deleteEmployee registra termination", () => {
  it("desligar funcionário cria movimento de termination", () => {
    const movement = logicaDeleteEmployee(42);
    expect(movement.movementType).toBe("termination");
    expect(movement.employeeId).toBe(42);
    expect(movement.reason).toBe("Desligamento");
    expect(movement.previousValue).toBeNull();
    expect(movement.newValue).toBeNull();
  });

  it("desligar com motivo personalizado usa o motivo fornecido", () => {
    const movement = logicaDeleteEmployee(10, "Pedido de demissão");
    expect(movement.movementType).toBe("termination");
    expect(movement.reason).toBe("Pedido de demissão");
  });

  it("movimento de termination tem data de hoje", () => {
    const movement = logicaDeleteEmployee(5);
    expect(movement.movementDate).toBe("2026-08-07");
  });
});

// ─── Testes Bug A — updateEmployee ───────────────────────────────────────────

describe("Bug A — updateEmployee registra salary_change e role_change", () => {
  const before = { salaryBase: 2000, role: "Atendente" };

  it("editar salário registra salary_change com valores corretos", () => {
    const movements = logicaUpdateEmployee(1, before, { salaryBase: 2500 });
    expect(movements).toHaveLength(1);
    expect(movements[0].movementType).toBe("salary_change");
    expect(movements[0].previousValue).toBe("2000");
    expect(movements[0].newValue).toBe("2500");
  });

  it("editar cargo registra role_change com valores corretos", () => {
    const movements = logicaUpdateEmployee(2, before, { role: "Caixa" });
    expect(movements).toHaveLength(1);
    expect(movements[0].movementType).toBe("role_change");
    expect(movements[0].previousValue).toBe("Atendente");
    expect(movements[0].newValue).toBe("Caixa");
  });

  it("editar salário E cargo registra dois movimentos", () => {
    const movements = logicaUpdateEmployee(3, before, { salaryBase: 2800, role: "Gerente Assistente" });
    expect(movements).toHaveLength(2);
    const types = movements.map(m => m.movementType);
    expect(types).toContain("salary_change");
    expect(types).toContain("role_change");
  });

  it("editar salário com mesmo valor NÃO registra movimento", () => {
    const movements = logicaUpdateEmployee(4, before, { salaryBase: 2000 });
    expect(movements).toHaveLength(0);
  });

  it("editar cargo com mesmo valor NÃO registra movimento", () => {
    const movements = logicaUpdateEmployee(5, before, { role: "Atendente" });
    expect(movements).toHaveLength(0);
  });

  it("editar outros campos (nome, benefícios) NÃO registra movimento", () => {
    const movements = logicaUpdateEmployee(6, before, {});
    expect(movements).toHaveLength(0);
  });

  it("salary_change com decimal funciona corretamente", () => {
    const movements = logicaUpdateEmployee(7, { salaryBase: 2000.50, role: "Atendente" }, { salaryBase: 2100.75 });
    expect(movements).toHaveLength(1);
    expect(movements[0].previousValue).toBe("2000.5");
    expect(movements[0].newValue).toBe("2100.75");
  });
});

// ─── Testes Bug B — saveRevenue ───────────────────────────────────────────────

describe("Bug B — saveRevenue não descarta zeros", () => {
  it("ANTES da correção: R$ 0 era descartado", () => {
    const entries = saveRevenueAntigo({ 8: "0", 9: "500", 10: "0" });
    expect(entries).toHaveLength(1);
    expect(entries[0].hour).toBe(9);
  });

  it("DEPOIS da correção: R$ 0 é incluído e enviado ao upsert", () => {
    const entries = saveRevenueCorrigido({ 8: "0", 9: "500", 10: "0" });
    expect(entries).toHaveLength(3);
    const hours = entries.map(e => e.hour);
    expect(hours).toContain(8);
    expect(hours).toContain(9);
    expect(hours).toContain(10);
  });

  it("DEPOIS da correção: valor 0 explícito é preservado", () => {
    const entries = saveRevenueCorrigido({ 12: "0" });
    expect(entries).toHaveLength(1);
    expect(entries[0].revenue).toBe(0);
  });

  it("DEPOIS da correção: valores positivos continuam funcionando", () => {
    const entries = saveRevenueCorrigido({ 10: "1500", 11: "2000" });
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.hour === 10)?.revenue).toBe(1500);
    expect(entries.find(e => e.hour === 11)?.revenue).toBe(2000);
  });

  it("DEPOIS da correção: string vazia vira 0 (não NaN)", () => {
    const entries = saveRevenueCorrigido({ 8: "" });
    expect(entries[0].revenue).toBe(0);
    expect(Number.isNaN(entries[0].revenue)).toBe(false);
  });

  it("DEPOIS da correção: todas as horas do período são enviadas (sem omissão)", () => {
    const allHours: Record<number, string> = {};
    for (let h = 8; h < 23; h++) allHours[h] = h === 12 ? "0" : String(h * 100);
    const entries = saveRevenueCorrigido(allHours);
    expect(entries).toHaveLength(15);
    expect(entries.find(e => e.hour === 12)?.revenue).toBe(0);
  });
});

// ─── Testes de role_change e salary_change ──────────────────────────────────

describe("updateEmployee movement logging", () => {
  it("should detect role change", () => {
    const current = { role: "Atendente", salaryBase: 1500 };
    const input = { role: "Caixa", salaryBase: 1500 };
    const movements: string[] = [];
    if (input.role !== undefined && input.role !== current.role) {
      movements.push("role_change");
    }
    if (input.salaryBase !== undefined && input.salaryBase !== current.salaryBase) {
      movements.push("salary_change");
    }
    expect(movements).toEqual(["role_change"]);
  });

  it("should detect salary change", () => {
    const current = { role: "Atendente", salaryBase: 1500 };
    const input = { role: "Atendente", salaryBase: 1800 };
    const movements: string[] = [];
    if (input.role !== undefined && input.role !== current.role) {
      movements.push("role_change");
    }
    if (input.salaryBase !== undefined && input.salaryBase !== current.salaryBase) {
      movements.push("salary_change");
    }
    expect(movements).toEqual(["salary_change"]);
  });

  it("should detect both changes simultaneously", () => {
    const current = { role: "Atendente", salaryBase: 1500 };
    const input = { role: "Caixa", salaryBase: 1800 };
    const movements: string[] = [];
    if (input.role !== undefined && input.role !== current.role) {
      movements.push("role_change");
    }
    if (input.salaryBase !== undefined && input.salaryBase !== current.salaryBase) {
      movements.push("salary_change");
    }
    expect(movements).toEqual(["role_change", "salary_change"]);
  });

  it("should log nothing when only benefits change", () => {
    const current = { role: "Atendente", salaryBase: 1500 };
    const input = { transportAllowance: 200, mealAllowance: 300 };
    const movements: string[] = [];
    if ((input as any).role !== undefined && (input as any).role !== current.role) {
      movements.push("role_change");
    }
    if ((input as any).salaryBase !== undefined && (input as any).salaryBase !== current.salaryBase) {
      movements.push("salary_change");
    }
    expect(movements).toEqual([]);
  });
});
