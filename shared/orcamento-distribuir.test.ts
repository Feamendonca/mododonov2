import { describe, it, expect } from "vitest";
import { distribuirProporcional } from "./orcamento-distribuir";

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("distribuirProporcional", () => {
  it("distribui proporcionalmente mantendo a razão entre os filhos", () => {
    // filhos 100k/150k/50k (soma 300k) → meta 300k → mantém exatamente
    expect(distribuirProporcional(300000, [100000, 150000, 50000])).toEqual([
      100000, 150000, 50000,
    ]);
  });

  it("escala pra cima/baixo preservando a proporção", () => {
    // mesma razão 1:1.5:0.5, mas meta é o DOBRO
    const r = distribuirProporcional(600000, [100000, 150000, 50000]);
    expect(soma(r)).toBe(600000);
    expect(r).toEqual([200000, 300000, 100000]);
  });

  it("soma final bate a meta mesmo quando a divisão não é exata (arredondamento vai pro último filho)", () => {
    const r = distribuirProporcional(290000, [100000, 150000, 50000]);
    expect(soma(r)).toBe(290000);
    // 290000/300000 = 0.966666...
    expect(r[0]).toBe(96667);
    expect(r[1]).toBe(145000);
    // sobra do arredondamento cai no último
    expect(r[2]).toBe(290000 - 96667 - 145000);
  });

  it("distribui igualmente quando a soma atual dos filhos é zero", () => {
    expect(distribuirProporcional(300, [0, 0, 0])).toEqual([100, 100, 100]);
  });

  it("distribui igualmente (com sobra no último) quando não divide exato", () => {
    const r = distribuirProporcional(100, [0, 0, 0]);
    expect(soma(r)).toBe(100);
    expect(r).toEqual([33, 33, 34]);
  });

  it("um único filho recebe o valor inteiro", () => {
    expect(distribuirProporcional(700, [500])).toEqual([700]);
    expect(distribuirProporcional(700, [0])).toEqual([700]);
  });

  it("nenhum filho devolve array vazio", () => {
    expect(distribuirProporcional(1000, [])).toEqual([]);
  });

  it("preserva o sinal dos filhos negativos (ex.: deduções/custos)", () => {
    const r = distribuirProporcional(-150, [-100, -200]);
    expect(soma(r)).toBe(-150);
    expect(r).toEqual([-50, -100]);
  });

  it("filhos com peso zero no meio (tratado como 0, sem dividir por zero)", () => {
    const r = distribuirProporcional(100, [0, 50, 50]);
    expect(soma(r)).toBe(100);
    expect(r[0]).toBe(0);
    expect(r[1]).toBe(50);
    expect(r[2]).toBe(50);
  });
});
