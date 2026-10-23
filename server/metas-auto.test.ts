/**
 * metas-auto.test.ts
 * Testes unitários para o helper de medidas automáticas.
 *
 * Cobre:
 *  1. avaliarAtingimento — lte (CMV), gte (faturamento/EBITDA), eq
 *  2. Medidas computáveis recebem valor_atual/atingida corretos (batido e furado)
 *  3. Indicadores custom/subjetivos não são computáveis (fonte manual)
 *  4. INDICADORES_COMPUTAVEIS contém exatamente os 4 esperados
 */

import { describe, it, expect } from "vitest";
import { avaliarAtingimento, INDICADORES_COMPUTAVEIS } from "./db-metas-auto";

// ─── avaliarAtingimento ───────────────────────────────────────────────────────

describe("avaliarAtingimento — operador lte (CMV, Folha)", () => {
  it("realizado <= meta → atingida (CMV 28% <= meta 30%)", () => {
    expect(avaliarAtingimento(28, 30, "lte")).toBe(true);
  });

  it("realizado == meta → atingida (CMV 30% == meta 30%)", () => {
    expect(avaliarAtingimento(30, 30, "lte")).toBe(true);
  });

  it("realizado > meta → NÃO atingida (CMV 32% > meta 30%)", () => {
    expect(avaliarAtingimento(32, 30, "lte")).toBe(false);
  });

  it("caso-limite: 30.001% > 30% → NÃO atingida", () => {
    expect(avaliarAtingimento(30.001, 30, "lte")).toBe(false);
  });
});

describe("avaliarAtingimento — operador gte (Faturamento, EBITDA)", () => {
  it("realizado >= meta → atingida (faturamento 125k >= meta 120k)", () => {
    expect(avaliarAtingimento(125000, 120000, "gte")).toBe(true);
  });

  it("realizado == meta → atingida (faturamento 120k == meta 120k)", () => {
    expect(avaliarAtingimento(120000, 120000, "gte")).toBe(true);
  });

  it("realizado < meta → NÃO atingida (faturamento 115k < meta 120k)", () => {
    expect(avaliarAtingimento(115000, 120000, "gte")).toBe(false);
  });

  it("EBITDA 16% >= meta 15% → atingida", () => {
    expect(avaliarAtingimento(16, 15, "gte")).toBe(true);
  });

  it("EBITDA 14% < meta 15% → NÃO atingida", () => {
    expect(avaliarAtingimento(14, 15, "gte")).toBe(false);
  });
});

describe("avaliarAtingimento — operador eq", () => {
  it("valores iguais → atingida", () => {
    expect(avaliarAtingimento(100, 100, "eq")).toBe(true);
  });

  it("diferença < 0.01% → atingida (tolerância)", () => {
    expect(avaliarAtingimento(100.000001, 100, "eq")).toBe(true);
  });

  it("diferença > 0.01% → NÃO atingida", () => {
    expect(avaliarAtingimento(101, 100, "eq")).toBe(false);
  });
});

// ─── INDICADORES_COMPUTAVEIS ──────────────────────────────────────────────────

describe("INDICADORES_COMPUTAVEIS", () => {
  it("contém exatamente os 5 indicadores esperados (incluindo turnover)", () => {
    expect(INDICADORES_COMPUTAVEIS.has("faturamento")).toBe(true);
    expect(INDICADORES_COMPUTAVEIS.has("cmv")).toBe(true);
    expect(INDICADORES_COMPUTAVEIS.has("ebitda")).toBe(true);
    expect(INDICADORES_COMPUTAVEIS.has("folha")).toBe(true);
    expect(INDICADORES_COMPUTAVEIS.has("turnover")).toBe(true);
    expect(INDICADORES_COMPUTAVEIS.size).toBe(5);
  });

  it("indicadores custom/subjetivos NÃO são computáveis", () => {
    expect(INDICADORES_COMPUTAVEIS.has("custom")).toBe(false);
    expect(INDICADORES_COMPUTAVEIS.has("nps")).toBe(false);
    expect(INDICADORES_COMPUTAVEIS.has("satisfacao")).toBe(false);
    expect(INDICADORES_COMPUTAVEIS.has("")).toBe(false);
  });
});

// ─── Lógica de enriquecimento automático (simulada) ──────────────────────────

/**
 * Simula o enriquecimento de medidas que o metas.list faz,
 * sem precisar de banco de dados.
 */
function enriquecerMedidas(
  medidas: Array<{
    id: number;
    indicador: string;
    metaValor: number | null;
    metaOperador: "lte" | "gte" | "eq";
    progresso?: { valorAtual: number | null; atingida: boolean } | null;
    fonteProgresso?: string;
  }>,
  realizado: Record<string, number>
) {
  return medidas.map(medida => {
    if (!INDICADORES_COMPUTAVEIS.has(medida.indicador)) return medida;
    const valorRealizado = realizado[medida.indicador];
    if (valorRealizado == null) return medida;
    const atingida = medida.metaValor != null
      ? avaliarAtingimento(valorRealizado, medida.metaValor, medida.metaOperador)
      : false;
    return {
      ...medida,
      progresso: { id: 0, medidaId: medida.id, mes: 7, ano: 2026, valorAtual: valorRealizado, atingida, observacao: null, updatedAt: Date.now() },
      fonteProgresso: "auto",
    };
  });
}

const REALIZADO = {
  faturamento: 125000,  // acima da meta 120000 → atingida
  cmv: 28,              // abaixo da meta 30% → atingida
  ebitda: 14,           // abaixo da meta 15% → NÃO atingida
  folha: 26,            // acima da meta 25% → NÃO atingida
};

const MEDIDAS_BASE = [
  { id: 1, indicador: "faturamento", metaValor: 120000, metaOperador: "gte" as const },
  { id: 2, indicador: "cmv",         metaValor: 30,     metaOperador: "lte" as const },
  { id: 3, indicador: "ebitda",      metaValor: 15,     metaOperador: "gte" as const },
  { id: 4, indicador: "folha",       metaValor: 25,     metaOperador: "lte" as const },
  { id: 5, indicador: "custom",      metaValor: null,   metaOperador: "gte" as const }, // manual
];

describe("enriquecimento automático de medidas", () => {
  const enriquecidas = enriquecerMedidas(MEDIDAS_BASE, REALIZADO);

  it("faturamento 125k >= meta 120k → atingida, fonte=auto", () => {
    const m = enriquecidas.find(m => m.indicador === "faturamento")!;
    expect(m.progresso?.valorAtual).toBe(125000);
    expect(m.progresso?.atingida).toBe(true);
    expect(m.fonteProgresso).toBe("auto");
  });

  it("CMV 28% <= meta 30% → atingida, fonte=auto", () => {
    const m = enriquecidas.find(m => m.indicador === "cmv")!;
    expect(m.progresso?.valorAtual).toBe(28);
    expect(m.progresso?.atingida).toBe(true);
    expect(m.fonteProgresso).toBe("auto");
  });

  it("EBITDA 14% < meta 15% → NÃO atingida, fonte=auto", () => {
    const m = enriquecidas.find(m => m.indicador === "ebitda")!;
    expect(m.progresso?.valorAtual).toBe(14);
    expect(m.progresso?.atingida).toBe(false);
    expect(m.fonteProgresso).toBe("auto");
  });

  it("Folha 26% > meta 25% → NÃO atingida (lte furado), fonte=auto", () => {
    const m = enriquecidas.find(m => m.indicador === "folha")!;
    expect(m.progresso?.valorAtual).toBe(26);
    expect(m.progresso?.atingida).toBe(false);
    expect(m.fonteProgresso).toBe("auto");
  });

  it("medida custom NÃO é enriquecida automaticamente (fonte manual)", () => {
    const m = enriquecidas.find(m => m.indicador === "custom")!;
    expect(m.fonteProgresso).toBeUndefined();
    expect(m.progresso).toBeUndefined();
  });
});
