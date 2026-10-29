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

describe("extrairGruposPorMes — arquivo com muitas abas (>5), aba 'DRE' resolvida por nome (Task S6)", () => {
  it("lê os meses da aba 'DRE' mesmo sem selectedSheet, num arquivo com 15 abas — simula Bella Gula", () => {
    const buf = gerarFixtureDreMuitasAbas();
    // Igual ao caller real (server/routers/orcamento.ts): NUNCA passa selectedSheet.
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Ano26 BGP (AZM).xlsx", undefined, 3);

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(gruposPorMes[0].grupos["1"]).toBe(500000);
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
    expect(gruposPorMes.every(m => m.grupos["1"] > 0)).toBe(true);
  });
});

describe("extrairGruposPorMes — cabeçalho de mês em serial de data do Excel (Task S6)", () => {
  it("lê os 3 meses quando o cabeçalho vem como serial (46023/46054/46082) em vez de texto — simula Bella Gula", () => {
    const buf = gerarFixtureDreSerial();
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Ano26 BGP (AZM).xlsx", undefined, 3);

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2026-01", "2026-02", "2026-03"]);

    const [jan, fev, mar] = gruposPorMes;
    expect(jan.grupos["1"]).toBe(500000);
    expect(jan.grupos["4"]).toBe(-150000);
    expect(jan.grupos["7"]).toBe(-120000);
    expect(fev.grupos["1"]).toBe(520000);
    expect(mar.grupos["1"]).toBe(540000);
  });
});

describe("extrairGruposPorMes", () => {
  it("lê os grupos nível-1 dos últimos 3 meses (default) da fixture F360", () => {
    const buf = gerarFixtureDre();
    const gruposPorMes = extrairGruposPorMes(buf, "DRE Agrobar Porto Alegre_Novo.xlsx");

    expect(gruposPorMes).toHaveLength(3);
    expect(gruposPorMes.map(m => m.anoMes)).toEqual(["2025-12", "2026-01", "2026-02"]);

    const [dez, jan, fev] = gruposPorMes;

    expect(dez.grupos["1"]).toBe(700000);
    expect(dez.grupos["4"]).toBe(-200000); // CMV negativo, igual à fixture
    expect(dez.grupos["7"]).toBe(-180000);
    expect(dez.grupos["5"]).toBe(-50000);
    expect(dez.grupos["6"]).toBe(-15000);
    expect(dez.grupos["8"]).toBe(-10000);
    expect(dez.grupos["10"]).toBe(-40000);
    expect(dez.grupos["11"]).toBe(-12000);
    expect(dez.grupos["13"]).toBe(-20000);
    // Sub-linhas (4.1, 1.1) NÃO entram — só nível 1.
    expect(dez.grupos["4.1"]).toBeUndefined();
    expect(dez.grupos["1.1"]).toBeUndefined();
    // Grupo "9 - Terceiros Eventuais" não existe na fixture → ausente no dict.
    expect(dez.grupos["9"]).toBeUndefined();

    expect(jan.grupos["1"]).toBe(720000);
    expect(jan.grupos["4"]).toBe(-205000);
    expect(jan.grupos["7"]).toBe(-185000);

    expect(fev.grupos["1"]).toBe(740000);
    expect(fev.grupos["4"]).toBe(-210000);
    expect(fev.grupos["7"]).toBe(-190000);
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
      grupos: { "1": 700000, "4": -200000, "5": -50000, "6": -15000, "7": -180000, "8": -10000, "10": -40000, "11": -12000, "13": -20000 },
    },
    {
      anoMes: "2026-01",
      grupos: { "1": 720000, "4": -205000, "5": -51000, "6": -15500, "7": -185000, "8": -10200, "10": -41000, "11": -12300, "13": -20000 },
    },
    {
      anoMes: "2026-02",
      grupos: { "1": 740000, "4": -210000, "5": -52000, "6": -16000, "7": -190000, "8": -10400, "10": -42000, "11": -12600, "13": -20000 },
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

  it("NUNCA chuta: grupo 9 (Terceiros Eventuais) ausente em TODOS os meses → outrasDespesas e marketing ficam null (não 0, não benchmark)", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.outrasDespesas).toBeNull();
    expect(rascunho.marketing).toBeNull();
    // Prova explícita de que não é zero disfarçado:
    expect(rascunho.outrasDespesas).not.toBe(0);
  });

  it("grupo 6 (Taxa Mensal Franquias) não tem sub-linha pra separar royalties de fundo de promoção: o total vai pra royaltiesPct e fundoMarketingPct fica null", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.royaltiesPct).not.toBeNull();
    expect(rascunho.fundoMarketingPct).toBeNull();
  });

  it("grupo 10 (Custo de Ocupação) não tem sub-linha pra separar aluguel/condomínio/energia/gás/água: só aluguel recebe o total, os demais ficam null", () => {
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
  // passou a ser a regra REAL — resultado operacional médio (soma dos grupos
  // 1..11, com sinal) negativo. Cobertura completa do novo critério está em
  // `orcamento-em-atencao.test.ts`; os testes abaixo só confirmam que, com
  // ESTE histórico (positivo), o critério novo concorda com o antigo.
  it("emAtencao = false quando o resultado operacional médio do histórico é positivo", () => {
    const rascunho = proporOrcamento(gruposPorMes);
    expect(rascunho.emAtencao).toBe(false);
    expect(rascunho.rampaMeses).toBeNull();
  });

  it("grupo de CMV ausente em todos os meses não derruba o resultado operacional pra negativo (removendo uma despesa o resultado só aumenta) → emAtencao continua false", () => {
    const semCmv: GrupoDreMes[] = gruposPorMes.map(m => {
      const { "4": _omit, ...resto } = m.grupos;
      return { anoMes: m.anoMes, grupos: resto };
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
