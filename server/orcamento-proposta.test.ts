import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extrairGruposPorMes,
  proporOrcamento,
  calcularDre,
  type GrupoDreMes,
  type RascunhoOrcamento,
} from "./orcamento-proposta";

/**
 * Gera, por código (XLSX.utils.aoa_to_sheet), um workbook no formato real do
 * export F360 multi-mês (ver docs/superpowers/specs/2026-10-27-dre-f360-formato-referencia.md):
 *   - Linha 1: nome da loja + blocos de 3 colunas por mês (valor | % | vazio)
 *   - Linhas de nível 1 (N - Nome), valores pt-BR com "R$", negativos p/ despesa.
 *   - Deliberadamente SEM a linha "9 - Terceiros Eventuais" em nenhum mês —
 *     usada para provar que um grupo ausente vira `null`, nunca 0/benchmark.
 *   - 4 meses (nov/2025..fev/2026) p/ testar o corte "últimos N" (default 3).
 */
function gerarFixtureDre(): Buffer {
  const aoa: (string | number)[][] = [
    [
      "Agrobar Porto Alegre",
      "11/2025", "%", "",
      "12/2025", "%", "",
      "01/2026", "%", "",
      "02/2026", "%", "",
    ],
    ["1 - Receita Bruta", "R$ 680.000,00", "100,0%", "", "R$ 700.000,00", "100,0%", "", "R$ 720.000,00", "100,0%", "", "R$ 740.000,00", "100,0%", ""],
    ["1.1 - Dinheiro", "R$ 68.000,00", "10,0%", "", "R$ 70.000,00", "10,0%", "", "R$ 72.000,00", "10,0%", "", "R$ 74.000,00", "10,0%", ""],
    ["2 - Redutores de Venda", "-R$ 4.800,00", "0,7%", "", "-R$ 5.000,00", "0,7%", "", "-R$ 5.200,00", "0,7%", "", "-R$ 5.400,00", "0,7%", ""],
    ["3 - Receita Líquida", "R$ 675.200,00", "99,3%", "", "R$ 695.000,00", "99,3%", "", "R$ 714.800,00", "99,3%", "", "R$ 734.600,00", "99,3%", ""],
    ["4 - Custo de Mercadoria", "-R$ 195.000,00", "28,7%", "", "-R$ 200.000,00", "28,6%", "", "-R$ 205.000,00", "28,5%", "", "-R$ 210.000,00", "28,4%", ""],
    ["4.1 - Mat.Limpeza", "-R$ 3.000,00", "0,4%", "", "-R$ 3.100,00", "0,4%", "", "-R$ 3.200,00", "0,4%", "", "-R$ 3.300,00", "0,4%", ""],
    ["5 - Impostos", "-R$ 49.000,00", "7,2%", "", "-R$ 50.000,00", "7,1%", "", "-R$ 51.000,00", "7,1%", "", "-R$ 52.000,00", "7,0%", ""],
    ["6 - Taxa Mensal Franquias", "-R$ 14.500,00", "2,1%", "", "-R$ 15.000,00", "2,1%", "", "-R$ 15.500,00", "2,2%", "", "-R$ 16.000,00", "2,2%", ""],
    ["7 - Colaboradores", "-R$ 175.000,00", "25,7%", "", "-R$ 180.000,00", "25,7%", "", "-R$ 185.000,00", "25,7%", "", "-R$ 190.000,00", "25,7%", ""],
    ["8 - Serviços de Terceiros", "-R$ 9.800,00", "1,4%", "", "-R$ 10.000,00", "1,4%", "", "-R$ 10.200,00", "1,4%", "", "-R$ 10.400,00", "1,4%", ""],
    // SEM linha "9 - Terceiros Eventuais" de propósito (grupo ausente em todos os meses).
    ["10 - Custo de Ocupação", "-R$ 39.000,00", "5,7%", "", "-R$ 40.000,00", "5,7%", "", "-R$ 41.000,00", "5,7%", "", "-R$ 42.000,00", "5,7%", ""],
    ["11 - Despesas Financeiras", "-R$ 11.800,00", "1,7%", "", "-R$ 12.000,00", "1,7%", "", "-R$ 12.300,00", "1,7%", "", "-R$ 12.600,00", "1,7%", ""],
    ["12 - Lucro Operacional", "R$ 171.100,00", "25,2%", "", "R$ 180.000,00", "25,7%", "", "R$ 186.600,00", "25,9%", "", "R$ 193.200,00", "26,1%", ""],
    ["13 - Pró-labore / Distribuição", "-R$ 20.000,00", "2,9%", "", "-R$ 20.000,00", "2,9%", "", "-R$ 20.000,00", "2,8%", "", "-R$ 20.000,00", "2,7%", ""],
    ["14 - Resultado", "R$ 151.100,00", "22,2%", "", "R$ 160.000,00", "22,9%", "", "R$ 166.600,00", "23,1%", "", "R$ 173.200,00", "23,4%", ""],
    ["15 - Despesas Não Operacionais", "-R$ 6.000,00", "0,9%", "", "-R$ 5.000,00", "0,7%", "", "-R$ 3.000,00", "0,4%", "", "-R$ 2.000,00", "0,3%", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  // Aba extra sem colunas de mês — não deve ser escolhida.
  const wsFiltros = XLSX.utils.aoa_to_sheet([
    ["Modelo", "DRE F360º"],
    ["Empresa", "Agrobar Porto Alegre"],
  ]);
  XLSX.utils.book_append_sheet(wb, wsFiltros, "Filtros Escolhidos");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Simula o arquivo real da Bella Gula (`DRE Ano26 BGP (AZM).xlsb`): o
 * cabeçalho de mês vem como SERIAL de data do Excel (número puro — 46023,
 * 46054, 46082 — em vez de texto "jan/26"). Mesmo layout F360 (valor | % |
 * vazio por mês), só muda o tipo da célula de cabeçalho (number, não string).
 * Task S6: antes do fix, extrairGruposPorMes voltava [] (0 meses lidos).
 */
function gerarFixtureDreSerial(): Buffer {
  const aoa: (string | number)[][] = [
    ["Bella Gula", 46023, "%", "", 46054, "%", "", 46082, "%", ""],
    ["1 - Receita Bruta", "R$ 500.000,00", "100,0%", "", "R$ 520.000,00", "100,0%", "", "R$ 540.000,00", "100,0%", ""],
    ["4 - Custo de Mercadoria", "-R$ 150.000,00", "30,0%", "", "-R$ 156.000,00", "30,0%", "", "-R$ 160.000,00", "29,6%", ""],
    ["7 - Colaboradores", "-R$ 120.000,00", "24,0%", "", "-R$ 125.000,00", "24,0%", "", "-R$ 130.000,00", "24,1%", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Simula o arquivo real da Bella Gula no que importa pra esta função: 15 abas
 * (1 aba "DRE" + 14 abas auxiliares, uma por mês — DE-PARA, JAN26, FEV26...).
 * `parseSpreadsheetToGrid` teria `needsSheetSelection=true` por ter >5 abas
 * — `extrairGruposPorMes` precisa resolver a aba "DRE" por nome mesmo assim
 * (sem exigir `selectedSheet` explícito, igual ao caller real em
 * server/routers/orcamento.ts, que nunca passa `selectedSheet`).
 */
function gerarFixtureDreMuitasAbas(): Buffer {
  const aoa: (string | number)[][] = [
    ["Bella Gula", "Jan-26", "%", "", "Feb-26", "%", "", "Mar-26", "%", ""],
    ["1 - Receita Bruta", "R$ 500.000,00", "100,0%", "", "R$ 520.000,00", "100,0%", "", "R$ 540.000,00", "100,0%", ""],
    ["4 - Custo de Mercadoria", "-R$ 150.000,00", "30,0%", "", "-R$ 156.000,00", "30,0%", "", "-R$ 160.000,00", "29,6%", ""],
    ["7 - Colaboradores", "-R$ 120.000,00", "24,0%", "", "-R$ 125.000,00", "24,0%", "", "-R$ 130.000,00", "24,1%", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  // Aba "DE-PARA" (mapeamento, sem colunas de mês) — como no arquivo real.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Código", "Descrição"], ["1", "RECEITA"]]), "DE-PARA");
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  for (const mes of ["JAN26", "FEV26", "MAR26", "ABR26", "MAI26", "JUN26", "JUL26", "AGO26", "SET26", "OUT26", "NOV26", "DEZ26", "JUN.25"]) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Mês", mes], ["Receita", "100000"]]), mes);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Simula o bug real cravado ao vivo na Bella Gula (Task S7): as células de
 * VALOR na aba "DRE" não são texto pt-BR — são células numéricas (t:"n")
 * cujo valor cru (.v) é o número certo, mas a FORMATAÇÃO DE EXIBIÇÃO (.z) é
 * padrão US (vírgula=milhar, ponto=decimal), produzindo .w=" 599,814.61 ".
 * `aoa_to_sheet` com string literal ("R$ 500.000,00") NÃO reproduz isto —
 * precisa de célula numérica real com `z` definido, por isso a construção
 * manual de células abaixo (igual ao fixture de sheet-parser.test.ts).
 */
function gerarFixtureDreFormatoUS(): Buffer {
  const ws: XLSX.WorkSheet = {};
  const linhas: { desc: string; valores: number[] }[] = [
    { desc: "1 - Receita Bruta", valores: [550000.1, 560000.2, 574285.61] },
    { desc: "4 - Custo de Mercadoria", valores: [-170000.3, -175000.4, -180000.5] },
    { desc: "7 - Colaboradores", valores: [-120000, -125000, -130000] },
  ];
  // Linha 1: cabeçalho — "Bella Gula" + 3 blocos (mês | % | vazio), mês como texto pt-BR.
  ws["A1"] = { t: "s", v: "Bella Gula" };
  const meses = ["jan/26", "fev/26", "mar/26"];
  meses.forEach((m, i) => {
    const col = 1 + i * 3; // B, E, H...
    ws[XLSX.utils.encode_cell({ r: 0, c: col })] = { t: "s", v: m };
    ws[XLSX.utils.encode_cell({ r: 0, c: col + 1 })] = { t: "s", v: "%" };
  });
  // Linhas de dado: célula de valor numérica formatada em padrão US.
  linhas.forEach((linha, rIdx) => {
    const row = rIdx + 1;
    ws[XLSX.utils.encode_cell({ r: row, c: 0 })] = { t: "s", v: linha.desc };
    linha.valores.forEach((v, i) => {
      const col = 1 + i * 3;
      ws[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "n", v, z: "#,##0.00" };
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: 9 } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("extrairGruposPorMes — células de valor formatadas em padrão US (Task S7)", () => {
  it("lê o valor CRU (574285.61), não o ~1000x menor produzido por normalizePtBR em texto US", () => {
    const buf = gerarFixtureDreFormatoUS();
    const gruposPorMes = extrairGruposPorMes(buf, "dre_bgp.xlsx", undefined, 3);

    expect(gruposPorMes).toHaveLength(3);
    const [jan, fev, mar] = gruposPorMes;
    expect(jan.cats.receitaBruta).toBeCloseTo(550000.1, 2);
    expect(fev.cats.receitaBruta).toBeCloseTo(560000.2, 2);
    expect(mar.cats.receitaBruta).toBeCloseTo(574285.61, 2);
    expect(mar.cats.cmv).toBeCloseTo(-180000.5, 2);
    expect(mar.cats.folha).toBeCloseTo(-130000, 2);
  });
});

describe("extrairGruposPorMes — arquivo com muitas abas (>5), aba 'DRE' resolvida por nome (Task S6)", () => {
  it("lê os meses da aba 'DRE' mesmo sem selectedSheet, num arquivo com 15 abas — simula Bella Gula", () => {
    const buf = gerarFixtureDreMuitasAbas();
    // Igual ao caller real (server/routers/orcamento.ts): NUNCA passa selectedSheet.
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Ano26 BGP (AZM).xlsx", undefined, 3);

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(gruposPorMes[0].cats.receitaBruta).toBe(500000);
  });
});

/**
 * Task S8 — o achado-chave: a NUMERAÇÃO dos grupos nível-1 difere por
 * template de DRE. Mesma loja/dado, duas numerações diferentes:
 *   - "Agrobar": folha = grupo 7.
 *   - "Bella Gula": grupo 7 é "MARGEM BRUTA" (SUBTOTAL, derivado) e folha é
 *     o grupo 8. Mapear por NÚMERO pegaria a Margem Bruta (positiva) como
 *     se fosse folha — o bug que esta task corrige.
 */
// `detectarColunasDeMes` só reconhece um cabeçalho de mês com >=3 colunas de
// mês real — por isso as fixtures abaixo têm 3 meses (jan/fev/mar), mesmo
// quando o teste só precisa do último.
function gerarFixtureNumeracaoAgrobar(): Buffer {
  const aoa: (string | number)[][] = [
    ["Loja Agrobar", "jan/26", "%", "", "fev/26", "%", "", "mar/26", "%", ""],
    ["1 - Receita Bruta", "R$ 600.000,00", "100,0%", "", "R$ 600.000,00", "100,0%", "", "R$ 600.000,00", "100,0%", ""],
    ["4 - Custo de Mercadoria", "-R$ 180.000,00", "30,0%", "", "-R$ 180.000,00", "30,0%", "", "-R$ 180.000,00", "30,0%", ""],
    ["7 - Colaboradores", "-R$ 150.000,00", "25,0%", "", "-R$ 150.000,00", "25,0%", "", "-R$ 150.000,00", "25,0%", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function gerarFixtureNumeracaoBellaGula(): Buffer {
  const aoa: (string | number)[][] = [
    ["Loja Bella Gula", "jan/26", "%", "", "fev/26", "%", "", "mar/26", "%", ""],
    ["1 - Receita Bruta", "R$ 600.000,00", "100,0%", "", "R$ 600.000,00", "100,0%", "", "R$ 600.000,00", "100,0%", ""],
    ["4 - Custo de Mercadoria", "-R$ 180.000,00", "30,0%", "", "-R$ 180.000,00", "30,0%", "", "-R$ 180.000,00", "30,0%", ""],
    // SUBTOTAL (derivado) — mesmo número que a folha do Agrobar
    ["7 - MARGEM BRUTA", "R$ 420.000,00", "70,0%", "", "R$ 420.000,00", "70,0%", "", "R$ 420.000,00", "70,0%", ""],
    // folha é o grupo 8 aqui, não o 7
    ["8 - Colaboradores", "-R$ 150.000,00", "25,0%", "", "-R$ 150.000,00", "25,0%", "", "-R$ 150.000,00", "25,0%", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("extrairGruposPorMes — Task S8: classifica pelo NOME, não pelo número (numeração difere por template)", () => {
  it("numeração Agrobar (folha=grupo 7): classifica receita/cmv/folha corretamente pela categoria", () => {
    const buf = gerarFixtureNumeracaoAgrobar();
    const [mes] = extrairGruposPorMes(buf, "agrobar.xlsx", undefined, 1);

    expect(mes.cats.receitaBruta).toBe(600000);
    expect(mes.cats.cmv).toBe(-180000);
    expect(mes.cats.folha).toBe(-150000);
  });

  it("numeração Bella Gula (folha=grupo 8; grupo 7='MARGEM BRUTA' é SUBTOTAL): classifica folha corretamente e IGNORA a Margem Bruta — nunca pelo número", () => {
    const buf = gerarFixtureNumeracaoBellaGula();
    const [mes] = extrairGruposPorMes(buf, "bella-gula.xlsx", undefined, 1);

    expect(mes.cats.receitaBruta).toBe(600000);
    expect(mes.cats.cmv).toBe(-180000);
    // folha é o grupo 8 (Colaboradores, negativo) — NUNCA o grupo 7 (Margem Bruta, positiva).
    expect(mes.cats.folha).toBe(-150000);
    // "MARGEM BRUTA" é derivada (subtotal) — NÃO entra em nenhuma categoria.
    expect(Object.values(mes.cats)).not.toContain(420000);
  });

  it("prova a regressão do bug original: se fosse lido por NÚMERO, 'folha' pegaria a Margem Bruta (420000, positiva) em vez de Colaboradores (-150000, negativa)", () => {
    const buf = gerarFixtureNumeracaoBellaGula();
    const [mes] = extrairGruposPorMes(buf, "bella-gula.xlsx", undefined, 1);

    expect(mes.cats.folha).not.toBe(420000);
    expect(mes.cats.folha).toBeLessThan(0);
  });
});

describe("extrairGruposPorMes — categoria repetida na mesma aba é SOMADA (Task S8)", () => {
  it("'Serviços de Terceiros' (grupo 8) + 'Terceiros Eventuais' (grupo 9) — ambos categoria 'terceiros' — são somados no mesmo mês", () => {
    const aoa: (string | number)[][] = [
      ["Loja Z", "jan/26", "%", "", "fev/26", "%", "", "mar/26", "%", ""],
      ["1 - Receita Bruta", "R$ 600.000,00", "100,0%", "", "R$ 600.000,00", "100,0%", "", "R$ 600.000,00", "100,0%", ""],
      ["8 - Serviços de Terceiros", "-R$ 10.000,00", "1,7%", "", "-R$ 10.000,00", "1,7%", "", "-R$ 10.000,00", "1,7%", ""],
      ["9 - Terceiros Eventuais", "-R$ 40.000,00", "6,7%", "", "-R$ 40.000,00", "6,7%", "", "-R$ 40.000,00", "6,7%", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const [mes] = extrairGruposPorMes(buf, "loja-z.xlsx", undefined, 1);
    expect(mes.cats.terceiros).toBe(-50000);
  });
});

/**
 * Simula um DRE ORÇAMENTÁRIO anual (ex.: "DRE Ano26"): tem coluna pra TODOS
 * os 12 meses do ano, mas jul/ago/set (últimos com execução real) vêm
 * preenchidos e out/nov/dez (futuro, ainda sem execução) vêm com todos os
 * grupos ZERADOS — não ausentes, zerados mesmo (como no arquivo real da
 * Bella Gula). "Últimos 3 meses" tem que pular essa cauda zerada.
 */
function gerarFixtureDreComCaudaZerada(): Buffer {
  const header: (string | number)[] = ["Bella Gula"];
  const linhaReceita: (string | number)[] = ["1 - Receita Bruta"];
  const linhaCmv: (string | number)[] = ["4 - Custo de Mercadoria"];
  const meses = ["Jul-26", "Aug-26", "Sep-26", "Oct-26", "Nov-26", "Dec-26"];
  for (let i = 0; i < meses.length; i++) {
    header.push(meses[i], "%", "");
    const temDado = i < 3; // jul/ago/set com dado; out/nov/dez zerados (futuro)
    linhaReceita.push(temDado ? `R$ ${500000 + i * 10000},00`.replace(",00", ",00") : "R$ -", "100,0%", "");
    linhaCmv.push(temDado ? "-R$ 150.000,00" : "R$ -", "30,0%", "");
  }
  const aoa: (string | number)[][] = [header, linhaReceita, linhaCmv];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("extrairGruposPorMes — cauda de meses futuros zerados (orçamento anual) é ignorada (Task S6)", () => {
  it("'últimos 3 meses' pula out/nov/dez zerados e devolve jul/ago/set (último histórico real)", () => {
    const buf = gerarFixtureDreComCaudaZerada();
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Ano26.xlsx", undefined, 3);

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(gruposPorMes.every(m => (m.cats.receitaBruta ?? 0) > 0)).toBe(true);
  });
});

describe("extrairGruposPorMes — cabeçalho de mês em serial de data do Excel (Task S6)", () => {
  it("lê os 3 meses quando o cabeçalho vem como serial (46023/46054/46082) em vez de texto — simula Bella Gula", () => {
    const buf = gerarFixtureDreSerial();
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Ano26 BGP (AZM).xlsx", undefined, 3);

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2026-01", "2026-02", "2026-03"]);

    const [jan, fev, mar] = gruposPorMes;
    expect(jan.cats.receitaBruta).toBe(500000);
    expect(jan.cats.cmv).toBe(-150000);
    expect(jan.cats.folha).toBe(-120000);
    expect(fev.cats.receitaBruta).toBe(520000);
    expect(mar.cats.receitaBruta).toBe(540000);
  });
});

describe("extrairGruposPorMes", () => {
  it("classifica os grupos nível-1 dos últimos 3 meses (default) pela CATEGORIA do nome — fixture F360 (numeração Agrobar)", () => {
    const buf = gerarFixtureDre();
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Agrobar Porto Alegre_Novo.xlsx");

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2025-12", "2026-01", "2026-02"]);

    const [dez, jan, fev] = gruposPorMes;

    expect(dez.cats.receitaBruta).toBe(700000);
    expect(dez.cats.redutores).toBe(-5000);
    expect(dez.cats.cmv).toBe(-200000); // CMV negativo, igual à fixture
    expect(dez.cats.folha).toBe(-180000);
    expect(dez.cats.impostos).toBe(-50000);
    expect(dez.cats.franquias).toBe(-15000);
    expect(dez.cats.terceiros).toBe(-10000); // só "Serviços de Terceiros" — "Terceiros Eventuais" não existe nesta fixture
    expect(dez.cats.ocupacao).toBe(-40000);
    expect(dez.cats.financeiras).toBe(-12000);
    expect(dez.cats.proLabore).toBe(-20000);
    // Categoria sem NENHUMA linha correspondente na fixture → ausente no dict (nunca 0 disfarçado).
    expect(dez.cats.outras).toBeUndefined();
    // Linhas DERIVADAS ("Receita Líquida", "Lucro Operacional", "Resultado") NUNCA entram em categoria nenhuma.
    expect(Object.values(dez.cats)).not.toContain(675200); // Receita Líquida (grupo 3)
    expect(Object.values(dez.cats)).not.toContain(171100); // Lucro Operacional (grupo 12)
    expect(Object.values(dez.cats)).not.toContain(151100); // Resultado (grupo 14)

    expect(jan.cats.receitaBruta).toBe(720000);
    expect(jan.cats.cmv).toBe(-205000);
    expect(jan.cats.folha).toBe(-185000);

    expect(fev.cats.receitaBruta).toBe(740000);
    expect(fev.cats.cmv).toBe(-210000);
    expect(fev.cats.folha).toBe(-190000);
  });

  it("devolve só os últimos N meses quando `meses` é passado explicitamente", () => {
    const buf = gerarFixtureDre();
    const gruposPorMes = extrairGruposPorMes(buf, "qualquer.xlsx", undefined, 2);

    expect(gruposPorMes).toHaveLength(2);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2026-01", "2026-02"]);
  });

  it("devolve os 4 meses quando `meses=4`", () => {
    const buf = gerarFixtureDre();
    const gruposPorMes = extrairGruposPorMes(buf, "qualquer.xlsx", undefined, 4);

    expect(gruposPorMes).toHaveLength(4);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("proporOrcamento", () => {
  // Mesmos 3 meses do teste acima (dez/2025, jan/2026, fev/2026) — valores
  // conferidos via node (ver task-3-report.md) para garantir a média exata.
  const gruposPorMes: GrupoDreMes[] = [
    {
      anoMes: "2025-12",
      cats: { receitaBruta: 700000, cmv: -200000, impostos: -50000, franquias: -15000, folha: -180000, terceiros: -10000, ocupacao: -40000, financeiras: -12000, proLabore: -20000 },
    },
    {
      anoMes: "2026-01",
      cats: { receitaBruta: 720000, cmv: -205000, impostos: -51000, franquias: -15500, folha: -185000, terceiros: -10200, ocupacao: -41000, financeiras: -12300, proLabore: -20000 },
    },
    {
      anoMes: "2026-02",
      cats: { receitaBruta: 740000, cmv: -210000, impostos: -52000, franquias: -16000, folha: -190000, terceiros: -10400, ocupacao: -42000, financeiras: -12600, proLabore: -20000 },
    },
  ];

  it("calcula receitaBruta como média simples dos meses", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.receitaBruta).toBe(720000);
  });

  it("converte CMV/impostos/royalties/taxaCartão em % média da receita bruta DO MÊS", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.cmvPct).toBeCloseTo(0.28474009724, 8);
    expect(rascunho.impostosPct).toBeCloseTo(0.07084405834, 8);
    expect(rascunho.royaltiesPct).toBeCloseTo(0.02152599028, 8);
    expect(rascunho.taxaCartaoPct).toBeCloseTo(0.01708440583, 8);
  });

  it("converte folha/aluguel/outrosServicos/proLabore em R$ médio (não %)", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.folha).toBe(185000);
    expect(rascunho.aluguel).toBe(41000);
    expect(rascunho.outrosServicos).toBe(10200);
    expect(rascunho.proLabore).toBe(20000);
  });

  it("NUNCA chuta: categorias 'despesasOperacionais'/'outras' ausentes em TODOS os meses → outrasDespesas e marketing ficam null (não 0, não benchmark)", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.outrasDespesas).toBeNull();
    expect(rascunho.marketing).toBeNull();
    // Prova explícita de que não é zero disfarçado:
    expect(rascunho.outrasDespesas).not.toBe(0);
  });

  it("categoria 'franquias' (royalties + fundo de promoção) não tem sub-linha pra separar os dois: o total vai pra royaltiesPct e fundoMarketingPct fica null", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.royaltiesPct).not.toBeNull();
    expect(rascunho.fundoMarketingPct).toBeNull();
  });

  it("categoria 'ocupacao' (aluguel+condomínio+energia+gás+água+utilidades) não tem sub-linha pra separar: só aluguel recebe o total, os demais ficam null", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.aluguel).not.toBeNull();
    expect(rascunho.condominio).toBeNull();
    expect(rascunho.energia).toBeNull();
    expect(rascunho.gas).toBeNull();
    expect(rascunho.agua).toBeNull();
    expect(rascunho.outrosOcupacao).toBeNull();
  });

  it("campos sem NENHUMA linha correspondente em nenhum mês (contabilidade/sistemas/juros/tarifas) ficam null", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.contabilidade).toBeNull();
    expect(rascunho.sistemas).toBeNull();
    expect(rascunho.juros).toBeNull();
    expect(rascunho.tarifasBancarias).toBeNull();
  });

  // Nota (Task 7, Fase B): `emAtencao` deixou de ser "faltam dados-base" e
  // passou a ser a regra REAL — resultado operacional médio (receita líquida
  // + categorias de custo, com sinal) negativo. Cobertura completa do novo
  // critério está em `orcamento-em-atencao.test.ts`; os testes abaixo só
  // confirmam que, com ESTE histórico (positivo), o critério novo concorda
  // com o antigo.
  it("emAtencao = false quando o resultado operacional médio do histórico é positivo", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.emAtencao).toBe(false);
    expect(rascunho.rampaMeses).toBeNull();
  });

  it("categoria 'cmv' ausente em todos os meses não derruba o resultado operacional pra negativo (removendo uma despesa o resultado só aumenta) → emAtencao continua false", () => {
    const semCmv: GrupoDreMes[] = gruposPorMes.map(m => {
      const { cmv: _omit, ...resto } = m.cats;
      return { anoMes: m.anoMes, cats: resto };
    });
    const rascunho = proporOrcamento(semCmv);
    expect(rascunho.cmvPct).toBeNull();
    expect(rascunho.emAtencao).toBe(false);
  });

  it("lista vazia de meses → todos os campos null e emAtencao=false (sem histórico não há base pra afirmar que a loja está no vermelho)", () => {
    const rascunho = proporOrcamento([]);
    expect(rascunho.receitaBruta).toBeNull();
    expect(rascunho.cmvPct).toBeNull();
    expect(rascunho.folha).toBeNull();
    expect(rascunho.emAtencao).toBe(false);
    expect(rascunho.rampaMeses).toBeNull();
  });
});

describe("calcularDre", () => {
  const rascunhoCompleto: RascunhoOrcamento = {
    receitaBruta: 100000,
    cmvPct: 0.30,
    impostosPct: 0.08,
    royaltiesPct: 0.02,
    fundoMarketingPct: 0.01,
    folha: 25000,
    aluguel: 5000,
    condominio: 1000,
    energia: 1500,
    gas: 300,
    agua: 200,
    outrosOcupacao: 0,
    contabilidade: 800,
    sistemas: 700,
    outrosServicos: 0,
    taxaCartaoPct: 0.03,
    juros: 0,
    tarifasBancarias: 500,
    marketing: 1000,
    outrasDespesas: 1000,
    proLabore: 8000,
    emAtencao: false,
    rampaMeses: null,
  };

  it("calcula ebitda/ebitdaPct/pontoEquilibrio/metaDiaria com rascunho 100% preenchido (parcial=false)", () => {
    const calc = calcularDre(rascunhoCompleto, 30);

    expect(calc.receitaLiquida).toBe(100000);
    expect(calc.cmvRs).toBe(30000);
    expect(calc.ebitda).toBeCloseTo(19000, 6);
    expect(calc.ebitdaPct).toBeCloseTo(0.19, 6);
    expect(calc.pontoEquilibrio).toBeCloseTo(66071.428571, 3);
    expect(calc.metaDiaria).toBeCloseTo(3333.333333, 3);
    expect(calc.parcial).toBe(false);
  });

  it("rascunho com componente null → trata como 0 no cálculo MAS marca parcial=true", () => {
    const rascunhoParcial: RascunhoOrcamento = {
      ...rascunhoCompleto,
      tarifasBancarias: null,
      outrasDespesas: null,
    };

    const calc = calcularDre(rascunhoParcial, 30);

    // tarifasBancarias(500) + outrasDespesas(1000) removidas do total de custos → ebitda sobe em 1500
    expect(calc.ebitda).toBeCloseTo(19000 + 500 + 1000, 6);
    expect(calc.parcial).toBe(true);
    // Nunca deve virar NaN mesmo com campos ausentes.
    expect(Number.isNaN(calc.ebitda)).toBe(false);
    expect(Number.isNaN(calc.pontoEquilibrio)).toBe(false);
  });

  it("receitaBruta null → trata como 0, metaDiaria e ebitdaPct ficam 0 (não NaN), parcial=true", () => {
    const rascunhoSemReceita: RascunhoOrcamento = { ...rascunhoCompleto, receitaBruta: null };
    const calc = calcularDre(rascunhoSemReceita, 30);

    expect(calc.receitaLiquida).toBe(0);
    expect(calc.metaDiaria).toBe(0);
    expect(calc.ebitdaPct).toBe(0);
    expect(calc.parcial).toBe(true);
    expect(Number.isNaN(calc.ebitda)).toBe(false);
  });

  it("diasOperacao=0 → metaDiaria=0 (não divide por zero/Infinity)", () => {
    const calc = calcularDre(rascunhoCompleto, 0);
    expect(calc.metaDiaria).toBe(0);
    expect(Number.isFinite(calc.metaDiaria)).toBe(true);
  });
});
