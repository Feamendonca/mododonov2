/**
 * hojepage-cmv.test.ts
 * Testes unitários para a lógica de seleção da meta de CMV no HojePage.
 *
 * Cobre:
 *  1. Com orçamento aprovado: cmvMetaPct do orçamento é usado
 *  2. Sem orçamento: fallback para store.budgetCmvPct
 *  3. Sem orçamento e sem store.budgetCmvPct: fallback para 30%
 *  4. cmvColor: vermelho quando CMV > meta+1, âmbar quando CMV > meta, verde quando CMV <= meta
 */

import { describe, it, expect } from "vitest";

// ─── Lógica pura extraída do HojePage ────────────────────────────────────────

function calcCmvMeta(
  cmvMetaPctFromPayload: number | null | undefined,
  storeBudgetCmvPct: string | null | undefined
): number {
  const parsed = parseFloat(storeBudgetCmvPct ?? "30");
  const storeVal = isNaN(parsed) ? 30 : parsed;
  return cmvMetaPctFromPayload ?? storeVal;
}

function calcCmvColor(cmvPct: number, cmvMeta: number): "verde" | "ambar" | "vermelho" {
  if (cmvPct > cmvMeta + 1) return "vermelho";
  if (cmvPct > cmvMeta) return "ambar";
  return "verde";
}

// ─── Testes: seleção da meta de CMV ──────────────────────────────────────────

describe("cmvMeta — seleção da fonte correta", () => {
  it("com orçamento aprovado: usa cmvMetaPct do payload (não store.budgetCmvPct)", () => {
    // Orçamento tem CMV 28%; store tem 32% configurado
    const meta = calcCmvMeta(28, "32");
    expect(meta).toBe(28); // deve usar o orçamento
  });

  it("sem orçamento (cmvMetaPct=null): fallback para store.budgetCmvPct", () => {
    const meta = calcCmvMeta(null, "32");
    expect(meta).toBe(32);
  });

  it("sem orçamento (cmvMetaPct=undefined): fallback para store.budgetCmvPct", () => {
    const meta = calcCmvMeta(undefined, "35");
    expect(meta).toBe(35);
  });

  it("sem orçamento e sem store.budgetCmvPct: fallback para 30%", () => {
    const meta = calcCmvMeta(null, null);
    expect(meta).toBe(30);
  });

  it("sem orçamento e store.budgetCmvPct='': fallback para 30%", () => {
    // String vazia → parseFloat("") = NaN → fallback para 30
    const meta = calcCmvMeta(undefined, "");
    expect(meta).toBe(30); // NaN tratado como 30
  });

  it("orçamento com CMV 0%: usa 0 (não ignora zero)", () => {
    // Caso extremo: orçamento com CMV zerado
    const meta = calcCmvMeta(0, "30");
    // 0 é falsy em JS — ?? não substitui 0, apenas null/undefined
    expect(meta).toBe(0);
  });
});

// ─── Testes: cmvColor ─────────────────────────────────────────────────────────

describe("cmvColor — semáforo correto", () => {
  it("CMV 28% com meta 30% → verde (abaixo da meta)", () => {
    expect(calcCmvColor(28, 30)).toBe("verde");
  });

  it("CMV 30% com meta 30% → verde (exatamente na meta)", () => {
    expect(calcCmvColor(30, 30)).toBe("verde");
  });

  it("CMV 30.5% com meta 30% → âmbar (acima da meta, dentro de 1pp)", () => {
    expect(calcCmvColor(30.5, 30)).toBe("ambar");
  });

  it("CMV 31% com meta 30% → âmbar (exatamente 1pp acima)", () => {
    expect(calcCmvColor(31, 30)).toBe("ambar");
  });

  it("CMV 31.1% com meta 30% → vermelho (mais de 1pp acima)", () => {
    expect(calcCmvColor(31.1, 30)).toBe("vermelho");
  });

  it("CMV 35% com meta 28% (orçamento) → vermelho", () => {
    // Antes do fix: meta era 30% (store), CMV 35% → vermelho (ok)
    // Após o fix: meta é 28% (orçamento), CMV 35% → ainda vermelho (mais correto)
    expect(calcCmvColor(35, 28)).toBe("vermelho");
  });

  it("CMV 27% com meta 28% (orçamento) → verde (abaixo do orçado)", () => {
    // Antes do fix: meta era 30% (store), CMV 27% → verde
    // Após o fix: meta é 28% (orçamento), CMV 27% → ainda verde (mais preciso)
    expect(calcCmvColor(27, 28)).toBe("verde");
  });
});
