/**
 * reallocation.test.ts
 * Testes unitários para a lógica de recomendação de realocação pico × morto.
 *
 * Cobre:
 *  1. Par morto+pico no mesmo dia → recomendação gerada com N pessoas correto
 *  2. Só morto (sem pico) → sem recomendação de realocação
 *  3. Só pico (sem morto) → sem recomendação de realocação
 *  4. Nenhum dos dois → sem recomendação
 *  5. Múltiplos dias com pares → uma recomendação por dia
 */

import { describe, it, expect } from "vitest";

// ─── Simulação da lógica do Trigger 7 ────────────────────────────────────────

type BlockEntry = {
  blockId: number;
  blockName: string;
  date: string;
  productivity: number;
  personHours: number;
  revenue: number;
  blockCost: number;
  status: "green" | "amber" | "red";
};

type ReallocationSuggestion = {
  trigger: string;
  title: string;
  description: string;
  nMover: number;
  mortoBlockName: string;
  picoBlockName: string;
  dow: number;
};

/**
 * Simula a lógica do Trigger 7 sem banco de dados.
 * Recebe blockDayMap (chave: `${blockId}-${dow}`) e produtividade target.
 */
function detectarRealocacoes(
  blockDayMap: Map<string, BlockEntry[]>,
  productivityTarget: number
): ReallocationSuggestion[] {
  const results: ReallocationSuggestion[] = [];
  const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  for (let dow = 0; dow < 7; dow++) {
    const dayKey = String(dow);

    const mortos = Array.from(blockDayMap.entries())
      .filter(([k]) => k.endsWith(`-${dayKey}`))
      .map(([, entries]) => entries)
      .filter(entries => {
        const avg = entries.reduce((s, e) => s + e.productivity, 0) / entries.length;
        const avgPH = entries.reduce((s, e) => s + e.personHours, 0) / entries.length;
        return avg < productivityTarget * 0.5 && avgPH > 0;
      });

    const picos = Array.from(blockDayMap.entries())
      .filter(([k]) => k.endsWith(`-${dayKey}`))
      .map(([, entries]) => entries)
      .filter(entries => {
        const avg = entries.reduce((s, e) => s + e.productivity, 0) / entries.length;
        return avg > productivityTarget * 2;
      });

    if (mortos.length > 0 && picos.length > 0) {
      const morto = mortos[0];
      const pico = picos[0];
      const avgMortoPH = morto.reduce((s, e) => s + e.personHours, 0) / morto.length;
      const avgMortoProd = morto.reduce((s, e) => s + e.productivity, 0) / morto.length;
      const avgPicoProd = pico.reduce((s, e) => s + e.productivity, 0) / pico.length;
      const blockMortoDuration = morto[0] ? (morto[0].personHours / Math.max(1, Math.round(morto[0].personHours / 6))) : 6;
      const pessoasMorto = Math.round(avgMortoPH / Math.max(1, blockMortoDuration));
      const nMover = Math.max(1, Math.floor(pessoasMorto / 2));

      results.push({
        trigger: "reallocation_peak_dead",
        title: `Realoque ${nMover} pessoa(s) do horário morto para o pico na ${dayNames[dow]}`,
        description: `Na ${dayNames[dow]}, o turno "${morto[0].blockName}" tem produtividade média de R$ ${avgMortoProd.toFixed(0)}/h-pessoa`,
        nMover,
        mortoBlockName: morto[0].blockName,
        picoBlockName: pico[0].blockName,
        dow,
      });
    }
  }

  return results;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(blockId: number, blockName: string, dow: number, productivity: number, personHours: number): [string, BlockEntry[]] {
  const entry: BlockEntry = {
    blockId, blockName,
    date: `2026-08-0${dow + 1}`,
    productivity, personHours,
    revenue: productivity * personHours,
    blockCost: 0,
    status: productivity >= 200 ? "green" : productivity >= 100 ? "amber" : "red",
  };
  return [`${blockId}-${dow}`, [entry, entry, entry]]; // 3 semanas
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Realocação pico × morto — detecção de pares", () => {
  const META = 200; // R$/h-pessoa

  it("par morto+pico na segunda → recomendação gerada", () => {
    const map = new Map([
      makeEntry(1, "Abertura", 1, 50, 12),   // morto: 50 < 100 (50% de 200)
      makeEntry(2, "Fechamento", 1, 600, 4),  // pico: 600 > 400 (2x de 200)
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0].trigger).toBe("reallocation_peak_dead");
    expect(sugestoes[0].mortoBlockName).toBe("Abertura");
    expect(sugestoes[0].picoBlockName).toBe("Fechamento");
    expect(sugestoes[0].dow).toBe(1);
  });

  it("N pessoas a mover = floor(pessoasMorto / 2), mínimo 1", () => {
    // personHours = 12, blockDuration ≈ 6 → pessoasMorto = 2 → nMover = 1
    const map = new Map([
      makeEntry(1, "Abertura", 1, 50, 12),
      makeEntry(2, "Fechamento", 1, 600, 4),
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes[0].nMover).toBe(1);
  });

  it("N pessoas a mover = 2 quando há 4 pessoas no turno morto", () => {
    // personHours = 24, blockDuration ≈ 6 → pessoasMorto = 4 → nMover = 2
    const map = new Map([
      makeEntry(1, "Abertura", 1, 50, 24),
      makeEntry(2, "Fechamento", 1, 600, 4),
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes[0].nMover).toBe(2);
  });

  it("só morto (sem pico) → sem recomendação de realocação", () => {
    const map = new Map([
      makeEntry(1, "Abertura", 1, 50, 12),   // morto
      makeEntry(2, "Fechamento", 1, 180, 8), // âmbar (não é pico)
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes).toHaveLength(0);
  });

  it("só pico (sem morto) → sem recomendação de realocação", () => {
    const map = new Map([
      makeEntry(1, "Abertura", 1, 250, 8),   // verde (não é morto)
      makeEntry(2, "Fechamento", 1, 600, 4), // pico
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes).toHaveLength(0);
  });

  it("nenhum morto nem pico → sem recomendação", () => {
    const map = new Map([
      makeEntry(1, "Abertura", 1, 180, 8),   // âmbar
      makeEntry(2, "Fechamento", 1, 220, 8), // verde leve
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes).toHaveLength(0);
  });

  it("par em dias diferentes → uma recomendação por dia", () => {
    const map = new Map([
      makeEntry(1, "Abertura", 1, 50, 12),   // morto segunda
      makeEntry(2, "Fechamento", 1, 600, 4), // pico segunda
      makeEntry(1, "Abertura", 5, 50, 12),   // morto sexta
      makeEntry(2, "Fechamento", 5, 600, 4), // pico sexta
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes).toHaveLength(2);
    const dows = sugestoes.map(s => s.dow).sort();
    expect(dows).toEqual([1, 5]);
  });

  it("morto em dia diferente do pico → sem par, sem recomendação", () => {
    const map = new Map([
      makeEntry(1, "Abertura", 1, 50, 12),   // morto segunda
      makeEntry(2, "Fechamento", 5, 600, 4), // pico sexta (dia diferente)
    ]);
    const sugestoes = detectarRealocacoes(map, META);
    expect(sugestoes).toHaveLength(0);
  });
});
