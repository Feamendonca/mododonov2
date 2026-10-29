/**
 * orcamento-resumo.test.ts
 * Task L3 (reforma "orçamento linha a linha"): `calcularResumoLinhas` — EBITDA
 * calculado SOMENTE pelas FOLHAS (linhas sem filhos e não-derivadas), nunca
 * somando um grupo nível-1 junto com suas sub-linhas (dupla contagem).
 */
import { describe, it, expect } from "vitest";
import { calcularResumoLinhas } from "./orcamento-resumo";
import type { LinhaProposta } from "./orcamento-arvore";

/**
 * Árvore completa (tipo `LinhaProposta`, com `derivada`/`temFilhos` já
 * calculados — como devolvido por `proporLinhas`):
 *  - "1 - Receita Bruta" (grupo, 2 filhos: Balcão 600k + Delivery 400k)
 *  - "2 - Custo de Mercadoria Vendida (CMV)" (grupo, 2 filhos: -180k, -40k)
 *  - "3 - Ocupação" (grupo, 2 filhos: Aluguel -50k, Energia -15k)
 *  - "4 - Receita Líquida" (DERIVADA — subtotal pronto da planilha; nunca
 *    entra, mesmo valendo 1.000.000-220.000-65.000=715.000 — testaria dupla
 *    contagem se entrasse)
 *  - "5 - Despesas Não Operacionais" (grupo não-operacional, filho Juros -8k)
 *  - "6 - Pró-labore" (folha, sem filhos, excluída do EBITDA)
 *  - "7 - Resultado Operacional / EBITDA" (DERIVADA — subtotal pronto,
 *    nunca entra, mesmo "parecendo" a resposta certa)
 *
 * Os GRUPOS (1, 2, 3, 5) carregam um `proposto` agregado (soma dos filhos)
 * só para provar que são EXCLUÍDOS do cálculo (armadilha de dupla contagem)
 * — `temFilhos=true` tira eles do conjunto de folhas. `LinhaProposta` não
 * tem campo `valor` — o valor usado pelo resumo é `proposto` (Task L1).
 */
function linha(p: Partial<LinhaProposta> & Pick<LinhaProposta, "codigo" | "label" | "nivel">): LinhaProposta {
  return {
    derivada: false,
    temFilhos: false,
    natureza: "custo",
    histMedia: null,
    proposto: null,
    ...p,
  } as LinhaProposta;
}

function arvoreCompleta(opts?: { energiaNull?: boolean }): LinhaProposta[] {
  return [
    linha({ codigo: "1", label: "Receita Bruta", nivel: 1, temFilhos: true, natureza: "subtotal", proposto: 1_000_000 }),
    linha({ codigo: "1.1", label: "Vendas Balcão", nivel: 2, natureza: "receita", proposto: 600_000 }),
    linha({ codigo: "1.2", label: "Vendas Delivery", nivel: 2, natureza: "receita", proposto: 400_000 }),
    linha({ codigo: "2", label: "Custo de Mercadoria Vendida (CMV)", nivel: 1, temFilhos: true, natureza: "subtotal", proposto: -220_000 }),
    linha({ codigo: "2.1", label: "Custo Comida", nivel: 2, proposto: -180_000 }),
    linha({ codigo: "2.2", label: "Custo Bebida", nivel: 2, proposto: -40_000 }),
    linha({ codigo: "3", label: "Ocupação", nivel: 1, temFilhos: true, natureza: "subtotal", proposto: -65_000 }),
    linha({ codigo: "3.1", label: "Aluguel", nivel: 2, proposto: -50_000 }),
    linha({ codigo: "3.2", label: "Energia", nivel: 2, proposto: opts?.energiaNull ? null : -15_000 }),
    linha({ codigo: "4", label: "Receita Líquida", nivel: 1, derivada: true, natureza: "subtotal", proposto: 715_000 }),
    linha({ codigo: "5", label: "Despesas Não Operacionais", nivel: 1, temFilhos: true, natureza: "subtotal", proposto: -8_000 }),
    linha({ codigo: "5.1", label: "Juros de Empréstimo", nivel: 2, proposto: -8_000 }),
    linha({ codigo: "6", label: "Pró-labore", nivel: 1, proposto: -30_000 }),
    linha({ codigo: "7", label: "Resultado Operacional / EBITDA", nivel: 1, derivada: true, natureza: "subtotal", proposto: 715_000 }),
  ];
}

describe("calcularResumoLinhas — árvore completa (LinhaProposta[])", () => {
  it("receitaBruta soma só as FOLHAS de receita (1.1+1.2), não o grupo '1'", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    expect(resumo.receitaBruta).toBe(1_000_000);
  });

  it("ebitda soma SÓ folhas operacionais (receita+CMV+Ocupação), exclui não-operacional/pró-labore, SEM dupla contagem do grupo+filhos", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    // 600k + 400k - 180k - 40k - 50k - 15k = 715.000
    // (Se somasse os GRUPOS '1'/'2'/'3' TAMBÉM, daria o dobro — 1.430.000)
    expect(resumo.ebitda).toBe(715_000);
  });

  it("ebitda NÃO inclui as linhas DERIVADAS ('4 - Receita Líquida', '7 - EBITDA'), mesmo tendo o valor 'certo' pronto", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    // Se a linha derivada "7" (715.000) tivesse entrado em dobro no cálculo,
    // ebitda seria 1.430.000. Resultado correto bate com o calculado pelas
    // folhas (715.000), não pelo "atalho" da linha pronta.
    expect(resumo.ebitda).toBe(715_000);
  });

  it("ebitda exclui não-operacionais ('5.1 - Juros') e pró-labore ('6')", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    // Se juros (-8k) ou pró-labore (-30k) entrassem, ebitda seria diferente de 715.000.
    expect(resumo.ebitda).not.toBe(715_000 - 8_000);
    expect(resumo.ebitda).not.toBe(715_000 - 30_000);
    expect(resumo.ebitda).toBe(715_000);
  });

  it("ebitdaPct = ebitda/receitaBruta", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    expect(resumo.ebitdaPct).toBeCloseTo(0.715, 6);
  });

  it("metaDiaria = receitaBruta/diasNoMes", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    expect(resumo.metaDiaria).toBeCloseTo(1_000_000 / 30, 6);
  });

  it("pontoEquilibrio = custosFixos(exceto CMV) / (1 - %CMV/receita)", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    // %CMV = 220.000/1.000.000 = 0,22; custosFixos = Ocupação = 65.000
    // (exclui CMV, receita, não-operacional e pró-labore)
    expect(resumo.pontoEquilibrio).toBeCloseTo(65_000 / 0.78, 2);
  });

  it("parcial=false quando nenhuma folha operacional relevante tem valor null", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta(), 30);
    expect(resumo.parcial).toBe(false);
  });

  it("folha operacional com valor null → parcial=true, e o EBITDA soma só o que tem dado (NÃO chuta)", () => {
    const resumo = calcularResumoLinhas(arvoreCompleta({ energiaNull: true }), 30);
    expect(resumo.parcial).toBe(true);
    // Energia (-15k) não entra: 1.000.000 - 220.000 - 50.000 = 730.000
    expect(resumo.ebitda).toBe(730_000);
  });

  it("sem nenhuma linha de receita bruta → receitaBruta/ebitdaPct/metaDiaria/pontoEquilibrio = null", () => {
    const semReceita = arvoreCompleta().filter(l => l.codigo !== "1" && l.codigo !== "1.1" && l.codigo !== "1.2");
    const resumo = calcularResumoLinhas(semReceita, 30);
    expect(resumo.receitaBruta).toBeNull();
    expect(resumo.ebitdaPct).toBeNull();
    expect(resumo.metaDiaria).toBeNull();
    expect(resumo.pontoEquilibrio).toBeNull();
    // ebitda ainda é calculável pelas folhas restantes (CMV+Ocupação, sem receita)
    expect(resumo.ebitda).toBe(-220_000 - 65_000);
  });

  it("array vazio → tudo null, parcial=false", () => {
    const resumo = calcularResumoLinhas([], 30);
    expect(resumo).toEqual({
      receitaBruta: null,
      ebitda: null,
      ebitdaPct: null,
      metaDiaria: null,
      pontoEquilibrio: null,
      parcial: false,
    });
  });
});

describe("calcularResumoLinhas — shape simplificado (sem derivada/histMedia/proposto)", () => {
  it("funciona com linhas FLAT (só nível 1, sem natureza/temFilhos) derivando tudo pelo label", () => {
    const linhasSimples = [
      { codigo: "1", label: "Receita Bruta", nivel: 1, valor: 1_000_000 },
      { codigo: "2", label: "Custo de Mercadoria Vendida (CMV)", nivel: 1, valor: -220_000 },
      { codigo: "3", label: "Ocupação", nivel: 1, valor: -65_000 },
      { codigo: "4", label: "Pró-labore", nivel: 1, valor: -30_000 },
    ];
    const resumo = calcularResumoLinhas(linhasSimples, 30);
    expect(resumo.receitaBruta).toBe(1_000_000);
    // Pró-labore excluído: 1.000.000 - 220.000 - 65.000 = 715.000
    expect(resumo.ebitda).toBe(715_000);
    expect(resumo.parcial).toBe(false);
  });

  it("grupo com filhos no mesmo array (nível 2 presente) é excluído mesmo sem campo temFilhos explícito", () => {
    const linhasComFilhos = [
      { codigo: "1", label: "Receita Bruta", nivel: 1, valor: 1_000_000 }, // folha (sem filho nível 2 "1.x")
      { codigo: "3", label: "Ocupação", nivel: 1, valor: -65_000 }, // tem filhos → deve ser EXCLUÍDO
      { codigo: "3.1", label: "Aluguel", nivel: 2, valor: -50_000 },
      { codigo: "3.2", label: "Energia", nivel: 2, valor: -15_000 },
    ];
    const resumo = calcularResumoLinhas(linhasComFilhos, 30);
    // Se o grupo "3" (-65.000) entrasse JUNTO com os filhos (-50.000-15.000=-65.000),
    // o ebitda seria 1.000.000-130.000=870.000 (dobro do custo de ocupação).
    // Correto: 1.000.000 - 50.000 - 15.000 = 935.000.
    expect(resumo.ebitda).toBe(935_000);
  });

  it("natureza='subtotal' explícito exclui a linha do cálculo mesmo sem temFilhos/derivada", () => {
    const linhasComNatureza = [
      { codigo: "1", label: "Receita Bruta", nivel: 1, valor: 1_000_000, natureza: "receita" },
      { codigo: "9", label: "Resultado Qualquer", nivel: 1, valor: 999_999, natureza: "subtotal" },
      { codigo: "2", label: "CMV", nivel: 1, valor: -220_000, natureza: "custo" },
    ];
    const resumo = calcularResumoLinhas(linhasComNatureza, 30);
    expect(resumo.ebitda).toBe(1_000_000 - 220_000);
  });
});
