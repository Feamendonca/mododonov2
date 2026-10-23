/**
 * revenue-curve.test.ts
 * Testes unitários para distribuirPorCurva e parsePdvPaste.
 */

import { describe, it, expect } from "vitest";
import { distribuirPorCurva, parsePdvPaste, CURVA_PADRAO } from "../server/revenue-curve";

describe("distribuirPorCurva", () => {
  it("soma dos valores distribuídos é aproximadamente igual ao total", () => {
    const entries = distribuirPorCurva(10000, 8, 23);
    const soma = entries.reduce((s, e) => s + e.revenue, 0);
    expect(Math.abs(soma - 10000)).toBeLessThan(0.02); // tolerância de 2 centavos
  });

  it("retorna apenas horas dentro do intervalo [startHour, endHour)", () => {
    const entries = distribuirPorCurva(5000, 10, 15);
    const hours = entries.map(e => e.hour);
    expect(hours).toEqual([10, 11, 12, 13, 14]);
  });

  it("marca todas as entradas como isEstimate: true", () => {
    const entries = distribuirPorCurva(3000, 8, 12);
    expect(entries.every(e => e.isEstimate === true)).toBe(true);
  });

  it("hora de pico (12h) recebe mais que hora fora do pico (8h)", () => {
    const entries = distribuirPorCurva(10000, 8, 23);
    const h12 = entries.find(e => e.hour === 12)!;
    const h8  = entries.find(e => e.hour === 8)!;
    expect(h12.revenue).toBeGreaterThan(h8.revenue);
  });

  it("retorna array vazio quando totalRevenue = 0", () => {
    expect(distribuirPorCurva(0, 8, 23)).toHaveLength(0);
  });

  it("distribui igualmente quando todos os pesos são 0 no intervalo", () => {
    const zerosWeights = new Array(24).fill(0);
    const entries = distribuirPorCurva(600, 8, 11, zerosWeights); // 3 horas
    const soma = entries.reduce((s, e) => s + e.revenue, 0);
    expect(Math.abs(soma - 600)).toBeLessThan(0.02);
    expect(entries).toHaveLength(3);
  });

  it("pesos customizados são respeitados", () => {
    const weights = new Array(24).fill(0);
    weights[10] = 1;
    weights[12] = 3; // 12h deve receber 3x mais que 10h
    const entries = distribuirPorCurva(4000, 10, 13, weights);
    const h10 = entries.find(e => e.hour === 10)!;
    const h12 = entries.find(e => e.hour === 12)!;
    expect(h12.revenue).toBeCloseTo(h10.revenue * 3, 0);
  });
});

describe("parsePdvPaste", () => {
  it("parseia formato 'hora;valor' básico", () => {
    const result = parsePdvPaste("12:00;350\n13:00;500");
    expect(result).toHaveLength(2);
    expect(result.find(e => e.hour === 12)?.revenue).toBe(350);
    expect(result.find(e => e.hour === 13)?.revenue).toBe(500);
  });

  it("parseia formato 'hora valor' com espaço", () => {
    const result = parsePdvPaste("12:00 350\n13:00 500");
    expect(result.find(e => e.hour === 12)?.revenue).toBe(350);
  });

  it("parseia formato 'Xh;valor'", () => {
    const result = parsePdvPaste("12h;350");
    expect(result.find(e => e.hour === 12)?.revenue).toBe(350);
  });

  it("parseia valor com ponto de milhar pt-BR: 'R$ 1.250,50'", () => {
    const result = parsePdvPaste("12:00;R$ 1.250,50");
    expect(result.find(e => e.hour === 12)?.revenue).toBeCloseTo(1250.5, 1);
  });

  it("parseia valor com vírgula decimal: '350,00'", () => {
    const result = parsePdvPaste("12:00;350,00");
    expect(result.find(e => e.hour === 12)?.revenue).toBe(350);
  });

  it("ignora linhas não reconhecidas silenciosamente", () => {
    const result = parsePdvPaste("Hora;Venda\n12:00;350\nTotal;1000");
    expect(result).toHaveLength(1);
    expect(result[0].hour).toBe(12);
  });

  it("não duplica horas (primeira ocorrência vence)", () => {
    const result = parsePdvPaste("12:00;350\n12:00;999");
    expect(result.filter(e => e.hour === 12)).toHaveLength(1);
    expect(result.find(e => e.hour === 12)?.revenue).toBe(350);
  });

  it("retorna array vazio para texto vazio", () => {
    expect(parsePdvPaste("")).toHaveLength(0);
    expect(parsePdvPaste("   ")).toHaveLength(0);
  });

  it("aceita R$ 0 como valor válido", () => {
    const result = parsePdvPaste("12:00;0");
    expect(result.find(e => e.hour === 12)?.revenue).toBe(0);
  });

  it("parseia múltiplos formatos misturados", () => {
    const text = "08:00;420\n09h;380\n10:00 510\n11:00;R$ 1.200,00";
    const result = parsePdvPaste(text);
    expect(result).toHaveLength(4);
    expect(result.find(e => e.hour === 11)?.revenue).toBeCloseTo(1200, 0);
  });
});

describe("CURVA_PADRAO", () => {
  it("tem exatamente 24 pesos (um por hora)", () => {
    expect(CURVA_PADRAO).toHaveLength(24);
  });

  it("hora 12 (pico almoço) tem o maior peso", () => {
    const max = Math.max(...CURVA_PADRAO);
    expect(CURVA_PADRAO[12]).toBe(max);
  });

  it("horas 0-6 têm peso 0 (madrugada)", () => {
    for (let h = 0; h <= 6; h++) {
      expect(CURVA_PADRAO[h]).toBe(0);
    }
  });
});
