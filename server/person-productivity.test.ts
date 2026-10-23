/**
 * person-productivity.test.ts
 * Testes unitários para calcPersonProductivity e sugestão individual.
 *
 * Cobre:
 *  1. Cálculo de horas trabalhadas por pessoa (soma de durações dos blocos escalados)
 *  2. Receita coberta (soma da receita das horas dos turnos — compartilhada)
 *  3. Ranking ordenado por R$/h desc
 *  4. Semáforo verde/âmbar/vermelho vs meta de produtividade
 *  5. Sugestão individual disparada no cenário correto
 *  6. Pessoa não escalada não aparece no ranking
 */

import { describe, it, expect } from "vitest";
import { calcEmployeeCosts } from "./db-pessoas";

// ─── Helpers para simular calcPersonProductivity sem banco ───────────────────

type MockEmployee = {
  id: number;
  name: string;
  role: string;
  salaryBase: number;
  transportAllowance: number;
  mealAllowance: number;
  otherBenefits: number;
  hoursPerMonth: number;
};

type MockBlock = { id: number; startHour: number; endHour: number };
type MockSchedule = { employeeId: number; shiftBlockId: number; workDate: string };
type MockRevenue = { revenueDate: string; hour: number; revenue: number };

function calcPersonProductivitySync(
  employees: MockEmployee[],
  blocks: MockBlock[],
  schedules: MockSchedule[],
  revenues: MockRevenue[],
  chargesPercent: number,
  productivityTarget: number
) {
  // Mapa custo/hora
  const empCostMap = new Map<number, number>();
  for (const emp of employees) {
    const { hourlyRate } = calcEmployeeCosts(emp, chargesPercent);
    empCostMap.set(emp.id, hourlyRate);
  }

  // Mapa receita: date → hour → revenue
  const revMap = new Map<string, Map<number, number>>();
  for (const r of revenues) {
    if (!revMap.has(r.revenueDate)) revMap.set(r.revenueDate, new Map());
    revMap.get(r.revenueDate)!.set(r.hour, r.revenue);
  }

  const blockMap = new Map(blocks.map(b => [b.id, b]));
  const personHorasMap = new Map<number, number>();
  const personReceitaMap = new Map<number, number>();

  for (const s of schedules) {
    const block = blockMap.get(s.shiftBlockId);
    if (!block) continue;
    const duration = block.endHour - block.startHour;
    personHorasMap.set(s.employeeId, (personHorasMap.get(s.employeeId) ?? 0) + duration);
    const dayRevMap = revMap.get(s.workDate) ?? new Map();
    let receitaBloco = 0;
    for (let h = block.startHour; h < block.endHour; h++) {
      receitaBloco += dayRevMap.get(h) ?? 0;
    }
    personReceitaMap.set(s.employeeId, (personReceitaMap.get(s.employeeId) ?? 0) + receitaBloco);
  }

  const results = [];
  for (const emp of employees) {
    const horas = personHorasMap.get(emp.id) ?? 0;
    if (horas === 0) continue;
    const receita = personReceitaMap.get(emp.id) ?? 0;
    const prodRH = horas > 0 ? receita / horas : 0;
    const custoH = empCostMap.get(emp.id) ?? 0;
    const razao = custoH > 0 ? prodRH / custoH : 0;
    const status: "green" | "amber" | "red" =
      prodRH >= productivityTarget ? "green" :
      prodRH >= productivityTarget * 0.5 ? "amber" : "red";
    results.push({ employeeId: emp.id, name: emp.name, role: emp.role, horasTrabalhadas: horas, receitaCoberta: receita, produtividadeRH: prodRH, custoHora: custoH, razaoReceitaCusto: razao, status });
  }
  return results.sort((a, b) => b.produtividadeRH - a.produtividadeRH);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMP_A: MockEmployee = { id: 1, name: "Ana", role: "Atendente", salaryBase: 1800, transportAllowance: 200, mealAllowance: 300, otherBenefits: 0, hoursPerMonth: 220 };
const EMP_B: MockEmployee = { id: 2, name: "Bruno", role: "Caixa", salaryBase: 2200, transportAllowance: 200, mealAllowance: 300, otherBenefits: 0, hoursPerMonth: 220 };
const EMP_C: MockEmployee = { id: 3, name: "Carla", role: "Gerente", salaryBase: 4000, transportAllowance: 200, mealAllowance: 300, otherBenefits: 0, hoursPerMonth: 220 };

// Bloco manhã: 8h–14h (6h), Bloco tarde: 14h–22h (8h)
const BLOCK_MANHA: MockBlock = { id: 1, startHour: 8, endHour: 14 };
const BLOCK_TARDE: MockBlock = { id: 2, startHour: 14, endHour: 22 };

// Receita: manhã R$1200 (6h × R$200/h), tarde R$3200 (8h × R$400/h)
const REVENUES: MockRevenue[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ revenueDate: "2026-08-04", hour: 8 + i, revenue: 200 })),
  ...Array.from({ length: 8 }, (_, i) => ({ revenueDate: "2026-08-04", hour: 14 + i, revenue: 400 })),
];

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("calcPersonProductivity — horas trabalhadas", () => {
  it("Ana no bloco manhã (6h) → horasTrabalhadas = 6", () => {
    const schedules: MockSchedule[] = [{ employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" }];
    const result = calcPersonProductivitySync([EMP_A], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].horasTrabalhadas).toBe(6);
  });

  it("Bruno no bloco tarde (8h) → horasTrabalhadas = 8", () => {
    const schedules: MockSchedule[] = [{ employeeId: 2, shiftBlockId: 2, workDate: "2026-08-04" }];
    const result = calcPersonProductivitySync([EMP_B], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].horasTrabalhadas).toBe(8);
  });

  it("Ana em 2 blocos no mesmo dia → horas somadas (6+8=14)", () => {
    const schedules: MockSchedule[] = [
      { employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" },
      { employeeId: 1, shiftBlockId: 2, workDate: "2026-08-04" },
    ];
    const result = calcPersonProductivitySync([EMP_A], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].horasTrabalhadas).toBe(14);
  });
});

describe("calcPersonProductivity — receita coberta", () => {
  it("Ana no bloco manhã → receitaCoberta = 1200 (6h × 200)", () => {
    const schedules: MockSchedule[] = [{ employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" }];
    const result = calcPersonProductivitySync([EMP_A], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].receitaCoberta).toBe(1200);
  });

  it("Bruno no bloco tarde → receitaCoberta = 3200 (8h × 400)", () => {
    const schedules: MockSchedule[] = [{ employeeId: 2, shiftBlockId: 2, workDate: "2026-08-04" }];
    const result = calcPersonProductivitySync([EMP_B], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].receitaCoberta).toBe(3200);
  });

  it("receita coberta é compartilhada: Ana e Bruno no mesmo bloco tarde → ambos recebem 3200", () => {
    const schedules: MockSchedule[] = [
      { employeeId: 1, shiftBlockId: 2, workDate: "2026-08-04" },
      { employeeId: 2, shiftBlockId: 2, workDate: "2026-08-04" },
    ];
    const result = calcPersonProductivitySync([EMP_A, EMP_B], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    const ana = result.find(r => r.employeeId === 1)!;
    const bruno = result.find(r => r.employeeId === 2)!;
    expect(ana.receitaCoberta).toBe(3200);
    expect(bruno.receitaCoberta).toBe(3200);
  });
});

describe("calcPersonProductivity — ranking e semáforo", () => {
  it("ranking ordenado por R$/h desc: tarde (400/h) > manhã (200/h)", () => {
    const schedules: MockSchedule[] = [
      { employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" }, // Ana manhã: 200/h
      { employeeId: 2, shiftBlockId: 2, workDate: "2026-08-04" }, // Bruno tarde: 400/h
    ];
    const result = calcPersonProductivitySync([EMP_A, EMP_B], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].employeeId).toBe(2); // Bruno primeiro (400/h)
    expect(result[1].employeeId).toBe(1); // Ana segundo (200/h)
  });

  it("semáforo verde: R$/h >= meta", () => {
    const schedules: MockSchedule[] = [{ employeeId: 2, shiftBlockId: 2, workDate: "2026-08-04" }];
    const result = calcPersonProductivitySync([EMP_B], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result[0].produtividadeRH).toBe(400);
    expect(result[0].status).toBe("green");
  });

  it("semáforo âmbar: R$/h entre 50% e 100% da meta", () => {
    const schedules: MockSchedule[] = [{ employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" }];
    // Ana manhã: 200/h, meta 200 → exatamente na meta → verde
    // Para âmbar, precisamos meta > 200, ex: meta 300
    const result = calcPersonProductivitySync([EMP_A], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 300);
    expect(result[0].produtividadeRH).toBe(200);
    expect(result[0].status).toBe("amber"); // 200 >= 150 (50% de 300) → âmbar
  });

  it("semáforo vermelho: R$/h < 50% da meta", () => {
    const schedules: MockSchedule[] = [{ employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" }];
    // Ana manhã: 200/h, meta 500 → 200 < 250 (50% de 500) → vermelho
    const result = calcPersonProductivitySync([EMP_A], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 500);
    expect(result[0].status).toBe("red");
  });

  it("pessoa não escalada NÃO aparece no ranking", () => {
    const schedules: MockSchedule[] = [{ employeeId: 1, shiftBlockId: 1, workDate: "2026-08-04" }];
    const result = calcPersonProductivitySync([EMP_A, EMP_B, EMP_C], [BLOCK_MANHA, BLOCK_TARDE], schedules, REVENUES, 70, 200);
    expect(result).toHaveLength(1);
    expect(result[0].employeeId).toBe(1);
  });
});

describe("sugestão individual — lógica de disparo", () => {
  /**
   * Simula a lógica de seleção de candidatos para sugestão individual.
   * Pessoa com produtividade < 50% da média E custo/h acima da média E >= 10h escaladas.
   */
  function selecionarCandidatos(
    personData: Array<{ employeeId: number; name: string; produtividadeRH: number; custoHora: number; horasTrabalhadas: number }>
  ) {
    if (personData.length < 2) return [];
    const avgProd = personData.reduce((s, p) => s + p.produtividadeRH, 0) / personData.length;
    const avgCusto = personData.reduce((s, p) => s + p.custoHora, 0) / personData.length;
    return personData.filter(
      p => p.produtividadeRH < avgProd * 0.5 && p.custoHora > avgCusto && p.horasTrabalhadas >= 10
    );
  }

  it("pessoa com baixa produtividade, custo alto e 10+ horas → candidata para sugestão", () => {
    const data = [
      { employeeId: 1, name: "Ana", produtividadeRH: 400, custoHora: 15, horasTrabalhadas: 20 },
      { employeeId: 2, name: "Bruno", produtividadeRH: 50, custoHora: 25, horasTrabalhadas: 15 }, // baixa prod, custo alto
    ];
    const candidatos = selecionarCandidatos(data);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].employeeId).toBe(2);
  });

  it("pessoa com baixa produtividade mas custo baixo → NÃO é candidata", () => {
    const data = [
      { employeeId: 1, name: "Ana", produtividadeRH: 400, custoHora: 25, horasTrabalhadas: 20 },
      { employeeId: 2, name: "Bruno", produtividadeRH: 50, custoHora: 10, horasTrabalhadas: 15 }, // custo abaixo da média
    ];
    const candidatos = selecionarCandidatos(data);
    expect(candidatos).toHaveLength(0);
  });

  it("pessoa com < 10h escaladas → NÃO é candidata (dados insuficientes)", () => {
    const data = [
      { employeeId: 1, name: "Ana", produtividadeRH: 400, custoHora: 15, horasTrabalhadas: 20 },
      { employeeId: 2, name: "Bruno", produtividadeRH: 50, custoHora: 25, horasTrabalhadas: 8 }, // < 10h
    ];
    const candidatos = selecionarCandidatos(data);
    expect(candidatos).toHaveLength(0);
  });

  it("menos de 2 pessoas no ranking → sem sugestão individual (dados insuficientes)", () => {
    const data = [
      { employeeId: 1, name: "Ana", produtividadeRH: 50, custoHora: 25, horasTrabalhadas: 20 },
    ];
    const candidatos = selecionarCandidatos(data);
    expect(candidatos).toHaveLength(0);
  });
});
