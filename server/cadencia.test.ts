/**
 * Unit tests for calcularCadencia (pure function — no DB required)
 */

import { describe, it, expect } from "vitest";
import { calcularCadencia } from "./scheduled/cadencia-semanal";
import { CADENCIA_LIMIAR_REUNIAO } from "./scheduled/cadencia-config";

describe("calcularCadencia", () => {
  it("retorna 100 quando tudo está perfeito", () => {
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 7,
      preturnosEsperados: 5,
      preturnosRealizados: 5,
      diasSemContagem: 3,
      reclamacoesParadas: 0,
    });
    expect(result.nota).toBe(100);
    expect(result.abaixoLimiar).toBe(false);
    expect(result.alertas).toHaveLength(0);
  });

  it("retorna 0 quando tudo está parado", () => {
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 0,
      preturnosEsperados: 5,
      preturnosRealizados: 0,
      diasSemContagem: null, // nunca contado
      reclamacoesParadas: 5, // 5 × 20 = 100 de penalidade
    });
    expect(result.nota).toBe(0);
    expect(result.abaixoLimiar).toBe(true);
    expect(result.componentes.lancamento).toBe(0);
    expect(result.componentes.preturno).toBe(0);
    expect(result.componentes.contagem).toBe(0);
    expect(result.componentes.ocorrencia).toBe(0);
  });

  it("nota de lançamento é proporcional aos dias com entrada", () => {
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 4,
      preturnosEsperados: 0,
      preturnosRealizados: 0,
      diasSemContagem: 3,
      reclamacoesParadas: 0,
    });
    // lancamento = round(4/7 * 100) = 57
    expect(result.componentes.lancamento).toBe(57);
    expect(result.alertas.some((a) => a.includes("3 dia(s) sem lançar"))).toBe(true);
  });

  it("contagem nula (nunca contada) zera o componente e gera alerta", () => {
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 7,
      preturnosEsperados: 0,
      preturnosRealizados: 0,
      diasSemContagem: null,
      reclamacoesParadas: 0,
    });
    expect(result.componentes.contagem).toBe(0);
    expect(result.alertas.some((a) => a.includes("nunca realizada"))).toBe(true);
  });

  it("contagem dentro do limiar não gera alerta", () => {
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 7,
      preturnosEsperados: 0,
      preturnosRealizados: 0,
      diasSemContagem: 5, // dentro do limiar de 10 dias
      reclamacoesParadas: 0,
    });
    expect(result.componentes.contagem).toBe(100);
    expect(result.alertas.some((a) => a.includes("contagem"))).toBe(false);
  });

  it("cada reclamação parada reduz ocorrencia em 20 pontos", () => {
    const result1 = calcularCadencia({
      totalDias: 7, diasComLancamento: 7, preturnosEsperados: 0,
      preturnosRealizados: 0, diasSemContagem: 3, reclamacoesParadas: 1,
    });
    expect(result1.componentes.ocorrencia).toBe(80);

    const result3 = calcularCadencia({
      totalDias: 7, diasComLancamento: 7, preturnosEsperados: 0,
      preturnosRealizados: 0, diasSemContagem: 3, reclamacoesParadas: 3,
    });
    expect(result3.componentes.ocorrencia).toBe(40);

    const result5 = calcularCadencia({
      totalDias: 7, diasComLancamento: 7, preturnosEsperados: 0,
      preturnosRealizados: 0, diasSemContagem: 3, reclamacoesParadas: 5,
    });
    expect(result5.componentes.ocorrencia).toBe(0);
  });

  it("sem pré-turno configurado retorna nota 100 para o componente", () => {
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 7,
      preturnosEsperados: 0, // nenhum configurado
      preturnosRealizados: 0,
      diasSemContagem: 3,
      reclamacoesParadas: 0,
    });
    expect(result.componentes.preturno).toBe(100);
  });

  it("abaixoLimiar é true quando nota < CADENCIA_LIMIAR_REUNIAO", () => {
    // Força nota baixa: sem lançamento nenhum
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 0,
      preturnosEsperados: 7,
      preturnosRealizados: 0,
      diasSemContagem: null,
      reclamacoesParadas: 3,
    });
    expect(result.nota).toBeLessThan(CADENCIA_LIMIAR_REUNIAO);
    expect(result.abaixoLimiar).toBe(true);
  });

  it("pesos somam 1.0 e nota é calculada corretamente", () => {
    // All components = 50 → nota should be 50
    const result = calcularCadencia({
      totalDias: 7,
      diasComLancamento: 4,       // round(4/7*100) = 57 ≈ 57
      preturnosEsperados: 2,
      preturnosRealizados: 1,     // 50
      diasSemContagem: 15,        // > 10 → 0
      reclamacoesParadas: 1,      // 80
    });
    // nota = round(57*0.25 + 50*0.25 + 0*0.25 + 80*0.25)
    //      = round(14.25 + 12.5 + 0 + 20) = round(46.75) = 47
    expect(result.nota).toBe(47);
  });
});
