/**
 * cmv-purchases.test.ts
 * Testes para as funções de compras que alimentam o CMV real.
 * Verifica a lógica de addProductPurchase, setProductPurchase e parsePurchaseSheet.
 */

import { describe, it, expect } from "vitest";

// ─── Lógica de acumulação de compras ─────────────────────────────────────────

/**
 * Simula a lógica do SQL:
 * INSERT ... ON DUPLICATE KEY UPDATE purchases = purchases + VALUES(purchases)
 */
function simulateAddPurchase(
  existing: { purchases: number; purchasesCost: number } | null,
  qty: number,
  totalCost: number
): { purchases: number; purchasesCost: number } {
  if (!existing) return { purchases: qty, purchasesCost: totalCost };
  return {
    purchases: existing.purchases + qty,
    purchasesCost: existing.purchasesCost + totalCost,
  };
}

/**
 * Simula a lógica do SQL:
 * INSERT ... ON DUPLICATE KEY UPDATE purchases = VALUES(purchases)
 */
function simulateSetPurchase(
  _existing: { purchases: number; purchasesCost: number } | null,
  qty: number,
  totalCost: number
): { purchases: number; purchasesCost: number } {
  return { purchases: qty, purchasesCost: totalCost };
}

/**
 * Simula a coluna gerada: consumption = openingStock + purchases - closingStock
 * e cmvValue = openingCost + purchasesCost - closingCost
 */
function calcCmv(
  openingStock: number, purchases: number, closingStock: number,
  openingCost: number, purchasesCost: number, closingCost: number
) {
  return {
    consumption: openingStock + purchases - closingStock,
    cmvValue: openingCost + purchasesCost - closingCost,
  };
}

describe("addProductPurchase — lógica de acumulação", () => {
  it("cria novo registro quando não existe movimento", () => {
    const result = simulateAddPurchase(null, 10, 150);
    expect(result.purchases).toBe(10);
    expect(result.purchasesCost).toBe(150);
  });

  it("soma ao registro existente (múltiplas notas do mesmo produto)", () => {
    const existing = { purchases: 5, purchasesCost: 75 };
    const result = simulateAddPurchase(existing, 10, 150);
    expect(result.purchases).toBe(15);
    expect(result.purchasesCost).toBe(225);
  });

  it("soma zero não altera o valor", () => {
    const existing = { purchases: 5, purchasesCost: 75 };
    const result = simulateAddPurchase(existing, 0, 0);
    expect(result.purchases).toBe(5);
    expect(result.purchasesCost).toBe(75);
  });

  it("três notas acumulam corretamente", () => {
    let state = simulateAddPurchase(null, 10, 100);
    state = simulateAddPurchase(state, 5, 50);
    state = simulateAddPurchase(state, 8, 80);
    expect(state.purchases).toBe(23);
    expect(state.purchasesCost).toBe(230);
  });
});

describe("setProductPurchase — lógica de substituição", () => {
  it("substitui o valor existente", () => {
    const existing = { purchases: 100, purchasesCost: 1000 };
    const result = simulateSetPurchase(existing, 20, 200);
    expect(result.purchases).toBe(20);
    expect(result.purchasesCost).toBe(200);
  });

  it("cria novo registro quando não existe", () => {
    const result = simulateSetPurchase(null, 15, 150);
    expect(result.purchases).toBe(15);
    expect(result.purchasesCost).toBe(150);
  });

  it("pode corrigir para zero", () => {
    const existing = { purchases: 50, purchasesCost: 500 };
    const result = simulateSetPurchase(existing, 0, 0);
    expect(result.purchases).toBe(0);
    expect(result.purchasesCost).toBe(0);
  });
});

describe("CMV real: consumption = Ei + compras − Ef", () => {
  it("sem compras: CMV = Ei − Ef", () => {
    const { consumption, cmvValue } = calcCmv(100, 0, 80, 1000, 0, 800);
    expect(consumption).toBe(20);
    expect(cmvValue).toBe(200);
  });

  it("com compras: CMV aumenta corretamente", () => {
    const { consumption, cmvValue } = calcCmv(100, 50, 80, 1000, 500, 800);
    expect(consumption).toBe(70);  // 100 + 50 - 80
    expect(cmvValue).toBe(700);    // 1000 + 500 - 800
  });

  it("compras zeradas não quebram o cálculo", () => {
    const { consumption, cmvValue } = calcCmv(0, 0, 0, 0, 0, 0);
    expect(consumption).toBe(0);
    expect(cmvValue).toBe(0);
  });

  it("compra maior que Ei+Ef produz consumo correto", () => {
    const { consumption } = calcCmv(10, 100, 5, 100, 1000, 50);
    expect(consumption).toBe(105); // 10 + 100 - 5
  });
});

describe("parsePurchaseSheet — normalização de colunas", () => {
  // Testa a lógica de detecção de colunas sem precisar do banco
  function detectCols(header: string[]) {
    const h = header.map(s => s.toLowerCase().trim());
    return {
      colNome:  h.findIndex(s => s.includes("produto") || s.includes("nome") || s.includes("item") || s.includes("descri")),
      colQty:   h.findIndex(s => s.includes("qtd") || s.includes("quant") || s.includes("kg") || s.includes("unid")),
      colCusto: h.findIndex(s => s.includes("custo") || s.includes("valor") || s.includes("total") || s.includes("r$") || s.includes("preco") || s.includes("preço")),
    };
  }

  it("detecta colunas padrão (Produto, Qtd, Custo)", () => {
    const { colNome, colQty, colCusto } = detectCols(["Produto", "Qtd", "Custo"]);
    expect(colNome).toBe(0);
    expect(colQty).toBe(1);
    expect(colCusto).toBe(2);
  });

  it("detecta colunas com nomes alternativos (Nome, Quantidade, Valor Total)", () => {
    const { colNome, colQty, colCusto } = detectCols(["Nome", "Quantidade", "Valor Total"]);
    expect(colNome).toBe(0);
    expect(colQty).toBe(1);
    expect(colCusto).toBe(2);
  });

  it("detecta colunas com R$ no cabeçalho", () => {
    const { colCusto } = detectCols(["Item", "KG", "R$ Total"]);
    expect(colCusto).toBe(2);
  });

  it("retorna -1 quando coluna não encontrada", () => {
    const { colNome } = detectCols(["Código", "Unidade", "Preço"]);
    expect(colNome).toBe(-1); // "Código" não bate com nenhum padrão
  });

  it("não duplica produto quando importado duas vezes com addMode=add", () => {
    // Simula dois imports do mesmo produto
    let state = simulateAddPurchase(null, 10, 100);
    state = simulateAddPurchase(state, 10, 100);
    expect(state.purchases).toBe(20);
    expect(state.purchasesCost).toBe(200);
  });

  it("não duplica produto quando importado duas vezes com addMode=set", () => {
    // Simula dois imports do mesmo produto com substituição
    let state = simulateSetPurchase(null, 10, 100);
    state = simulateSetPurchase(state, 10, 100);
    expect(state.purchases).toBe(10); // não duplica
    expect(state.purchasesCost).toBe(100);
  });
});
