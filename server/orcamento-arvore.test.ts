import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extrairArvoreDre, proporLinhas, type MesArvore } from "./orcamento-arvore";

/**
 * Fixture no formato real do export F360 multi-mês (mesmo layout de
 * orcamento-proposta.test.ts): linha 1 = loja + blocos de 3 colunas por mês
 * (valor | % | vazio); linhas com rótulo "N - Nome" (nível 1) ou
 * "N.M - Nome" (nível 2, sub-linha). Inclui:
 *   - "1 - Receita Bruta" com filho "1.1 - Dinheiro" → grupo 1 é SUBTOTAL
 *     (tem filho), mesmo o nome batendo com /receita/i.
 *   - "2 - Redutores de Venda" sem filho → folha, custo.
 *   - "3 - Receita Líquida" → DERIVADA (subtotal).
 *   - "4 - Custo de Mercadoria" com filho "4.1 - Mat.Limpeza" → subtotal.
 *   - "10 - Ocupação" com filho "10.1 - Aluguel" → exatamente o exemplo do
 *     brief (subtotal / folha-custo).
 *   - "15 - Outras Receitas" sem filho, nome bate /receita/i, valor ≥ 0 →
 *     natureza receita.
 *   - "20 - Despesa Fantasma" sem NENHUM valor em nenhum mês → histMedia null.
 *   - "4.1.2 - Sub Mais Profundo" (N.M.K) → deliberadamente ignorada (L1
 *     "começa ignorando" sub-linhas mais profundas que nível 2).
 */
function gerarFixtureArvore(): Buffer {
  const aoa: (string | number)[][] = [
    ["Loja X", "jan/26", "%", "", "fev/26", "%", "", "mar/26", "%", ""],
    ["1 - Receita Bruta", "R$ 600.000,00", "100,0%", "", "R$ 620.000,00", "100,0%", "", "R$ 640.000,00", "100,0%", ""],
    ["1.1 - Dinheiro", "R$ 60.000,00", "10,0%", "", "R$ 62.000,00", "10,0%", "", "R$ 64.000,00", "10,0%", ""],
    ["2 - Redutores de Venda", "-R$ 4.000,00", "0,7%", "", "-R$ 4.200,00", "0,7%", "", "-R$ 4.400,00", "0,7%", ""],
    ["3 - Receita Líquida", "R$ 596.000,00", "99,3%", "", "R$ 615.800,00", "99,3%", "", "R$ 635.600,00", "99,3%", ""],
    ["4 - Custo de Mercadoria", "-R$ 180.000,00", "30,0%", "", "-R$ 186.000,00", "30,0%", "", "-R$ 192.000,00", "30,0%", ""],
    ["4.1 - Mat.Limpeza", "-R$ 3.000,00", "0,5%", "", "-R$ 3.100,00", "0,5%", "", "-R$ 3.200,00", "0,5%", ""],
    ["4.1.2 - Sub Mais Profundo", "-R$ 500,00", "0,1%", "", "-R$ 520,00", "0,1%", "", "-R$ 540,00", "0,1%", ""],
    ["10 - Ocupação", "-R$ 39.000,00", "6,5%", "", "-R$ 40.000,00", "6,5%", "", "-R$ 41.000,00", "6,4%", ""],
    ["10.1 - Aluguel", "-R$ 20.000,00", "3,3%", "", "-R$ 20.500,00", "3,3%", "", "-R$ 21.000,00", "3,3%", ""],
    ["15 - Outras Receitas", "R$ 5.000,00", "0,8%", "", "R$ 5.200,00", "0,8%", "", "R$ 5.400,00", "0,8%", ""],
    ["20 - Despesa Fantasma", "", "", "", "", "", "", "", "", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("extrairArvoreDre", () => {
  it("devolve todas as linhas (nível 1 e 2) na ORDEM da DRE, com codigo/nivel/valor certos, ignorando N.M.K", () => {
    const buf = gerarFixtureArvore();
    const meses = extrairArvoreDre(buf, "loja-x.xlsx", undefined, 3);

    expect(meses).toHaveLength(3);
    expect(meses.map(m => m.anoMes)).toEqual(["2026-01", "2026-02", "2026-03"]);

    const jan = meses[0];
    // "4.1.2 - Sub Mais Profundo" NUNCA aparece — regex nível 2 só aceita N.M.
    expect(jan.linhas.find(l => l.label === "Sub Mais Profundo")).toBeUndefined();

    // Ordem preservada (mesma ordem da planilha).
    expect(jan.linhas.map(l => l.codigo)).toEqual([
      "1", "1.1", "2", "3", "4", "4.1", "10", "10.1", "15", "20",
    ]);

    const receitaBruta = jan.linhas.find(l => l.codigo === "1")!;
    expect(receitaBruta.nivel).toBe(1);
    expect(receitaBruta.label).toBe("Receita Bruta");
    expect(receitaBruta.valor).toBe(600000);

    const dinheiro = jan.linhas.find(l => l.codigo === "1.1")!;
    expect(dinheiro.nivel).toBe(2);
    expect(dinheiro.label).toBe("Dinheiro");
    expect(dinheiro.valor).toBe(60000);

    const ocupacao = jan.linhas.find(l => l.codigo === "10")!;
    expect(ocupacao.valor).toBe(-39000);

    const aluguel = jan.linhas.find(l => l.codigo === "10.1")!;
    expect(aluguel.nivel).toBe(2);
    expect(aluguel.valor).toBe(-20000);

    const fantasma = jan.linhas.find(l => l.codigo === "20")!;
    expect(fantasma.valor).toBeNull();

    const mar = meses[2];
    expect(mar.linhas.find(l => l.codigo === "1")!.valor).toBe(640000);
    expect(mar.linhas.find(l => l.codigo === "10.1")!.valor).toBe(-21000);
  });

  it("devolve só os últimos N meses quando `meses` é passado explicitamente", () => {
    const buf = gerarFixtureArvore();
    const meses = extrairArvoreDre(buf, "loja-x.xlsx", undefined, 2);
    expect(meses).toHaveLength(2);
    expect(meses.map(m => m.anoMes)).toEqual(["2026-02", "2026-03"]);
  });

  it("corta a cauda de meses futuros zerados (mesmo princípio de extrairGruposPorMes)", () => {
    const aoa: (string | number)[][] = [
      ["Loja Y", "jan/26", "%", "", "fev/26", "%", "", "mar/26", "%", "", "abr/26", "%", ""],
      ["1 - Receita Bruta", "R$ 500.000,00", "100,0%", "", "R$ 510.000,00", "100,0%", "", "R$ -", "", "", "R$ -", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const meses = extrairArvoreDre(buf, "loja-y.xlsx", undefined, 3);
    expect(meses.map(m => m.anoMes)).toEqual(["2026-01", "2026-02"]);
  });
});

describe("proporLinhas", () => {
  const buf = gerarFixtureArvore();
  const meses: MesArvore[] = extrairArvoreDre(buf, "loja-x.xlsx", undefined, 3);
  const linhas = proporLinhas(meses);

  it("preserva a ordem da DRE", () => {
    expect(linhas.map(l => l.codigo)).toEqual([
      "1", "1.1", "2", "3", "4", "4.1", "10", "10.1", "15", "20",
    ]);
  });

  it("'3 - Receita Líquida' → derivada=true, natureza=subtotal", () => {
    const l = linhas.find(l => l.codigo === "3")!;
    expect(l.derivada).toBe(true);
    expect(l.natureza).toBe("subtotal");
  });

  it("'10 - Ocupação' (tem filho 10.1) → temFilhos=true, natureza=subtotal", () => {
    const l = linhas.find(l => l.codigo === "10")!;
    expect(l.temFilhos).toBe(true);
    expect(l.derivada).toBe(false);
    expect(l.natureza).toBe("subtotal");
  });

  it("'10.1 - Aluguel' → folha (sem filhos), natureza=custo", () => {
    const l = linhas.find(l => l.codigo === "10.1")!;
    expect(l.temFilhos).toBe(false);
    expect(l.natureza).toBe("custo");
    expect(l.histMedia).toBeCloseTo(-20500, 6); // média de -20000,-20500,-21000
    expect(l.proposto).toBeCloseTo(-20500, 6);
  });

  it("'1 - Receita Bruta' tem filho ('1.1') → natureza=subtotal mesmo o nome batendo /receita/i", () => {
    const l = linhas.find(l => l.codigo === "1")!;
    expect(l.temFilhos).toBe(true);
    expect(l.natureza).toBe("subtotal");
  });

  it("'15 - Outras Receitas' (sem filhos, nome bate /receita/i, valor ≥ 0) → natureza=receita", () => {
    const l = linhas.find(l => l.codigo === "15")!;
    expect(l.temFilhos).toBe(false);
    expect(l.derivada).toBe(false);
    expect(l.natureza).toBe("receita");
    expect(l.histMedia).toBeCloseTo(5200, 6);
  });

  it("'20 - Despesa Fantasma' (sem valor em NENHUM mês) → histMedia=null, proposto=null (NÃO chuta)", () => {
    const l = linhas.find(l => l.codigo === "20")!;
    expect(l.histMedia).toBeNull();
    expect(l.proposto).toBeNull();
  });
});
