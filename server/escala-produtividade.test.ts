/**
 * escala-produtividade.test.ts — Produtividade sugerida a partir do histórico
 *
 * Testa `calcularProdutividadeHistorica` (server/escala-produtividade.ts):
 * dado o histórico de dias da loja (atendimentos + pessoas-hora escaladas),
 * sugere quantos atendimentos por pessoa-hora a função entrega — usando a
 * MEDIANA dos dias válidos, não a média, para que um feriado atípico ou dia
 * de evento não mova a régua da loja inteira. Função pura, sem banco.
 *
 * Ver .superpowers/sdd/2026-11-19-escala-configuracao/task-3-brief.md.
 *
 * Nota de rigor (aprendizado da Task 2): os casos de mediana abaixo usam
 * conjuntos em que média e mediana DIVERGEM, para que o teste rejeite uma
 * implementação que calcule média. Também cobrem número par e ímpar de
 * amostras, e os testes de guarda verificam o `motivo`, não só `valor`.
 */
import { describe, expect, it } from "vitest";
import { calcularProdutividadeHistorica } from "./escala-produtividade";

function amostra(atendimentos: number, pessoasHora: number) {
  return { atendimentos, pessoasHora };
}

describe("calcularProdutividadeHistorica — cálculo pela mediana", () => {
  it("devolve a mediana (não a média) com número ÍMPAR de dias, onde elas divergem", () => {
    // produtividades por dia: 10, 10, 10, 10, 100 → média = 28; mediana = 10
    const amostras = [
      amostra(10, 1),
      amostra(100, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBe(10);
    expect(r.amostras).toBe(5);
  });

  it("devolve a mediana (não a média) com número PAR de dias — média das duas centrais", () => {
    // 6 dias, produtividades ordenadas: 5, 8, 10, 20, 30, 100
    // mediana = (10 + 20) / 2 = 15; média = 173/6 ≈ 28,83 — divergem.
    const amostras = [
      amostra(100, 1), // 100
      amostra(10, 1), // 10
      amostra(30, 1), // 30
      amostra(5, 1), // 5
      amostra(20, 1), // 20
      amostra(8, 1), // 8
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBe(15);
    expect(r.amostras).toBe(6);
  });

  it("produtividade de cada dia é atendimentos dividido por pessoas-hora daquele dia", () => {
    // 5 dias, produtividades: 20/2=10, 30/3=10, 40/4=10, 9/3=3, 100/2=50
    // ordenado: 3, 10, 10, 10, 50 → mediana = 10; média = 16,6 — divergem.
    const amostras = [
      amostra(20, 2),
      amostra(30, 3),
      amostra(40, 4),
      amostra(9, 3),
      amostra(100, 2),
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBe(10);
  });
});

describe("calcularProdutividadeHistorica — guarda de pessoas-hora ausente/zerada", () => {
  it("devolve null com motivo quando não há pessoas-hora (zerada)", () => {
    const amostras = [
      amostra(100, 0),
      amostra(100, 0),
      amostra(100, 0),
      amostra(100, 0),
      amostra(100, 0),
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBeNull();
    expect(r.motivo).toMatch(/sem escala/i);
  });

  it("o único dia com pessoas-hora zerada é descartado, mesmo entre dias válidos", () => {
    // 5 dias válidos (produtividade 10 cada) + 1 dia com pessoasHora=0 (descartado).
    // Se o dia zerado não fosse descartado, divisão por zero contaminaria o resultado.
    const amostras = [
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(100, 0),
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBe(10);
    expect(r.amostras).toBe(5);
  });
});

describe("calcularProdutividadeHistorica — guarda de amostra insuficiente", () => {
  it("devolve null com motivo quando há menos de 5 dias de amostra", () => {
    const amostras = [amostra(10, 1), amostra(20, 2), amostra(30, 3), amostra(40, 4)];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBeNull();
    expect(r.motivo).toMatch(/insuficiente|m[ií]nimo|5 dias/i);
    expect(r.amostras).toBe(4);
  });

  it("exatamente 5 dias válidos já é suficiente (limite não é exclusivo)", () => {
    const amostras = [
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBe(10);
    expect(r.motivo).toBeUndefined();
  });

  it("array vazio devolve null com motivo de amostra insuficiente, não quebra", () => {
    const r = calcularProdutividadeHistorica([]);

    expect(r.valor).toBeNull();
    expect(r.motivo).toMatch(/insuficiente|m[ií]nimo|5 dias/i);
    expect(r.amostras).toBe(0);
  });
});

describe("calcularProdutividadeHistorica — descarte de dias com atendimentos zerados", () => {
  it("descarta dias com atendimentos zerados (loja fechada/feriado) antes do cálculo", () => {
    // 5 dias com atendimentos=0 (fechado) + 5 dias válidos de produtividade 10.
    // Se os dias de atendimentos=0 fossem tratados como produtividade 0 em vez
    // de descartados, a mediana dos 10 dias cairia para 0 (cinco zeros entre
    // dez valores empurram a mediana) — este teste distingue as duas leituras.
    const fechados = [amostra(0, 2), amostra(0, 3), amostra(0, 1), amostra(0, 4), amostra(0, 2)];
    const validos = [
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
    ];

    const r = calcularProdutividadeHistorica([...fechados, ...validos]);

    expect(r.valor).toBe(10);
    expect(r.amostras).toBe(5);
  });

  it("dia com atendimentos zerados não conta para o mínimo de 5 dias válidos", () => {
    const amostras = [
      amostra(0, 2), // descartado
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
      amostra(10, 1),
    ];

    const r = calcularProdutividadeHistorica(amostras);

    expect(r.valor).toBeNull();
    expect(r.amostras).toBe(4);
    expect(r.motivo).toMatch(/insuficiente|m[ií]nimo|5 dias/i);
  });
});
