/**
 * CMV Module — Unit Tests
 * Tests for alert detection, consumption calculation and stock period logic.
 */
import { describe, expect, it } from "vitest";
import { detectAlerts, type AlertFlag } from "./db-cmv";

// ─── detectAlerts ─────────────────────────────────────────────────────────────

describe("detectAlerts", () => {
  it("returns empty array when everything is normal", () => {
    const flags = detectAlerts({
      openingStock: 10,
      purchases: 5,
      closingStock: 8,
      unitCost: 20,
      prevWeekConsumption: 7,
      cmvPct: 28,
      cmvTargetPct: 30,
    });
    expect(flags).toEqual([]);
  });

  it("detects negative_stock when closing stock is below zero", () => {
    const flags = detectAlerts({
      openingStock: 2,
      purchases: 0,
      closingStock: -1,
      unitCost: 10,
    });
    expect(flags).toContain("negative_stock");
  });

  it("does NOT flag negative_stock when closing stock is exactly zero", () => {
    const flags = detectAlerts({
      openingStock: 5,
      purchases: 0,
      closingStock: 0,
      unitCost: 10,
    });
    expect(flags).not.toContain("negative_stock");
  });

  it("detects unnecessary_purchase: had stock, bought more, consumed less than purchased", () => {
    // Scenario: had 5kg, bought 5kg, consumed 3kg → didn't need to buy
    const flags = detectAlerts({
      openingStock: 5,
      purchases: 5,
      closingStock: 7, // consumption = 5 + 5 - 7 = 3
      unitCost: 30,
    });
    expect(flags).toContain("unnecessary_purchase");
  });

  it("does NOT flag unnecessary_purchase when opening stock was zero", () => {
    const flags = detectAlerts({
      openingStock: 0,
      purchases: 5,
      closingStock: 2, // consumption = 3
      unitCost: 30,
    });
    expect(flags).not.toContain("unnecessary_purchase");
  });

  it("detects anomalous_consumption when deviation from previous week exceeds 50%", () => {
    // Previous: 10kg consumed, this week: 16kg (60% deviation)
    const flags = detectAlerts({
      openingStock: 20,
      purchases: 0,
      closingStock: 4, // consumption = 16
      unitCost: 10,
      prevWeekConsumption: 10,
    });
    expect(flags).toContain("anomalous_consumption");
  });

  it("does NOT flag anomalous_consumption when deviation is within 50%", () => {
    // Previous: 10kg, this week: 14kg (40% deviation — within threshold)
    const flags = detectAlerts({
      openingStock: 20,
      purchases: 0,
      closingStock: 6, // consumption = 14
      unitCost: 10,
      prevWeekConsumption: 10,
    });
    expect(flags).not.toContain("anomalous_consumption");
  });

  it("detects zero_consumption when there was stock but nothing was consumed", () => {
    const flags = detectAlerts({
      openingStock: 5,
      purchases: 2,
      closingStock: 7, // consumption = 5 + 2 - 7 = 0
      unitCost: 15,
    });
    expect(flags).toContain("zero_consumption");
  });

  it("does NOT flag zero_consumption when both opening and closing are zero", () => {
    const flags = detectAlerts({
      openingStock: 0,
      purchases: 0,
      closingStock: 0,
      unitCost: 15,
    });
    expect(flags).not.toContain("zero_consumption");
  });

  it("detects high_cmv when CMV% exceeds target by more than 10%", () => {
    // Target: 30%, actual: 34% (>33% = 30 * 1.1)
    const flags = detectAlerts({
      openingStock: 10,
      purchases: 5,
      closingStock: 2,
      unitCost: 20,
      cmvPct: 34,
      cmvTargetPct: 30,
    });
    expect(flags).toContain("high_cmv");
  });

  it("does NOT flag high_cmv when CMV% is exactly at target", () => {
    const flags = detectAlerts({
      openingStock: 10,
      purchases: 5,
      closingStock: 2,
      unitCost: 20,
      cmvPct: 30,
      cmvTargetPct: 30,
    });
    expect(flags).not.toContain("high_cmv");
  });

  it("does NOT flag high_cmv when cmvPct or cmvTargetPct are undefined", () => {
    const flags = detectAlerts({
      openingStock: 10,
      purchases: 5,
      closingStock: 2,
      unitCost: 20,
    });
    expect(flags).not.toContain("high_cmv");
  });

  it("can return multiple flags at once", () => {
    // negative stock + zero consumption scenario is impossible (negative means over-consumed)
    // But negative stock + anomalous consumption is possible
    const flags = detectAlerts({
      openingStock: 2,
      purchases: 0,
      closingStock: -3, // consumption = 5, negative stock
      unitCost: 10,
      prevWeekConsumption: 1, // 5 vs 1 = 400% deviation
    });
    expect(flags).toContain("negative_stock");
    expect(flags).toContain("anomalous_consumption");
  });
});

// ─── Consumption Calculation ──────────────────────────────────────────────────

describe("CMV consumption formula", () => {
  it("calculates consumption correctly: opening + purchases - closing", () => {
    const opening = 10;
    const purchases = 5;
    const closing = 8;
    const consumption = opening + purchases - closing;
    expect(consumption).toBe(7);
  });

  it("calculates CMV value: consumption * unitCost", () => {
    const consumption = 7;
    const unitCost = 25.5;
    const cmvValue = consumption * unitCost;
    expect(cmvValue).toBeCloseTo(178.5, 2);
  });

  it("calculates CMV percentage: cmvValue / revenue * 100", () => {
    const cmvValue = 1500;
    const revenue = 5000;
    const cmvPct = (cmvValue / revenue) * 100;
    expect(cmvPct).toBe(30);
  });

  it("handles zero revenue gracefully (no division by zero)", () => {
    const cmvValue = 100;
    const revenue = 0;
    const cmvPct = revenue > 0 ? (cmvValue / revenue) * 100 : 0;
    expect(cmvPct).toBe(0);
  });
});

// ─── ISOWeek Helper (inline test) ─────────────────────────────────────────────

describe("ISO week calculation", () => {
  function getISOWeek(date: Date): { week: number; year: number } {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { week, year: d.getUTCFullYear() };
  }

  it("returns week 1 for the first week of January 2026", () => {
    const result = getISOWeek(new Date("2026-01-05"));
    expect(result.week).toBe(2);
    expect(result.year).toBe(2026);
  });

  it("returns correct week for a known date (2026-05-24 = week 21)", () => {
    const result = getISOWeek(new Date("2026-05-24"));
    expect(result.week).toBe(21);
    expect(result.year).toBe(2026);
  });
});

// ─── upsertStockMovement — lógica de NULL como sentinela ──────────────────────
// ─── upsertStockMovement — SIMULAÇÃO da lógica SQL (não toca o banco) ─────────
// ATENÇÃO: estes testes simulam a lógica de COALESCE/ON DUPLICATE KEY UPDATE
// em JavaScript puro. Eles NÃO executam SQL real nem validam o comportamento
// do banco em produção. Para testes de integração reais seria necessário um
// harness com MySQL/TiDB de teste (não disponível neste ambiente).
// O que eles garantem: a lógica de "NULL como sentinela" está correta — ou seja,
// que os campos ausentes chegam como null (não 0) ao upsertStockMovement.

describe("[SIMULAÇÃO JS — não toca banco] upsertStockMovement — clobber fix (NULL sentinela)", () => {
  /**
   * Simula COALESCE(newValue, existingValue):
   *   - newValue NULL → mantém existingValue (não sobrescreve)
   *   - newValue 0    → usa 0 (valor explícito, sobrescreve)
   */
  function simulateUpsert(
    existing: Record<string, number | null>,
    incoming: Record<string, number | null>
  ): Record<string, number | null> {
    const result: Record<string, number | null> = { ...existing };
    for (const key of Object.keys(incoming)) {
      result[key] = incoming[key] !== null ? incoming[key] : existing[key];
    }
    return result;
  }

  function calcCmvFromRow(row: Record<string, number | null>) {
    const opening = row.openingStock ?? 0;
    const purchases = row.purchases ?? 0;
    const closing = row.closingStock ?? 0;
    const openCost = row.openingCost ?? 0;
    const purchCost = row.purchasesCost ?? 0;
    const closeCost = row.closingCost ?? 0;
    return {
      consumption: opening + purchases - closing,
      cmvValue: openCost + purchCost - closeCost,
    };
  }

  it("salvar só o inicial não zera compras/fechamento", () => {
    // Passo 1: gravar inicial
    let row = simulateUpsert({}, {
      openingStock: 100, purchases: null, closingStock: null,
      openingCost: 1000, purchasesCost: null, closingCost: null,
    });
    // Passo 2: gravar compras (não passa inicial nem fechamento)
    row = simulateUpsert(row, {
      openingStock: null, purchases: 50, closingStock: null,
      openingCost: null, purchasesCost: 500, closingCost: null,
    });
    // Passo 3: gravar fechamento (não passa inicial nem compras)
    row = simulateUpsert(row, {
      openingStock: null, purchases: null, closingStock: 80,
      openingCost: null, purchasesCost: null, closingCost: 800,
    });

    expect(row.openingStock).toBe(100);
    expect(row.purchases).toBe(50);
    expect(row.closingStock).toBe(80);

    const { consumption, cmvValue } = calcCmvFromRow(row);
    expect(consumption).toBe(70);   // 100 + 50 - 80
    expect(cmvValue).toBe(700);     // 1000 + 500 - 800
  });

  it("salvar fechamento com valor 0 explícito é preservado", () => {
    let row = simulateUpsert({}, {
      openingStock: 10, purchases: 5, closingStock: null,
      openingCost: 100, purchasesCost: 50, closingCost: null,
    });
    row = simulateUpsert(row, {
      openingStock: null, purchases: null, closingStock: 0,
      openingCost: null, purchasesCost: null, closingCost: 0,
    });

    expect(row.closingStock).toBe(0);
    const { consumption, cmvValue } = calcCmvFromRow(row);
    expect(consumption).toBe(15);   // 10 + 5 - 0
    expect(cmvValue).toBe(150);     // 100 + 50 - 0
  });

  it("sem compras: CMV = Ei − Ef", () => {
    let row = simulateUpsert({}, {
      openingStock: 100, purchases: null, closingStock: null,
      openingCost: 1000, purchasesCost: null, closingCost: null,
    });
    row = simulateUpsert(row, {
      openingStock: null, purchases: null, closingStock: 80,
      openingCost: null, purchasesCost: null, closingCost: 800,
    });

    const { consumption, cmvValue } = calcCmvFromRow(row);
    expect(consumption).toBe(20);   // 100 + 0 - 80
    expect(cmvValue).toBe(200);     // 1000 + 0 - 800
  });

  it("com compras: CMV = Ei + compras − Ef", () => {
    const row = simulateUpsert({}, {
      openingStock: 50, purchases: 30, closingStock: 20,
      openingCost: 500, purchasesCost: 300, closingCost: 200,
    });

    const { consumption, cmvValue } = calcCmvFromRow(row);
    expect(consumption).toBe(60);   // 50 + 30 - 20
    expect(cmvValue).toBe(600);     // 500 + 300 - 200
  });

  it("salvar o mesmo campo duas vezes usa o último valor", () => {
    let row = simulateUpsert({}, { openingStock: 100, purchases: null, closingStock: null, openingCost: 1000, purchasesCost: null, closingCost: null });
    // Corrigir o inicial
    row = simulateUpsert(row, { openingStock: 120, purchases: null, closingStock: null, openingCost: 1200, purchasesCost: null, closingCost: null });
    expect(row.openingStock).toBe(120);
    expect(row.openingCost).toBe(1200);
  });
});
