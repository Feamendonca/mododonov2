import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { cellToNumberDre, parseNumeroBR } from "./sheet-parser";

// Mocka storageDownload — Task 2 não toca banco nem storage real, só o parser.
vi.mock("./storage", () => ({
  storageDownload: vi.fn(),
}));

import { storageDownload } from "./storage";
import { lerDreHistorico } from "./orcamento-import";

/**
 * Gera, por código (XLSX.utils.aoa_to_sheet), um workbook no formato real do
 * export F360 multi-mês (ver docs/superpowers/specs/2026-10-27-dre-f360-formato-referencia.md):
 *   - Linha 1: nome da loja + blocos de 3 colunas por mês (valor | % | vazio)
 *   - Linhas: os 15 grupos nível 1, valores pt-BR com "R$", CMV/despesas negativos.
 * Determinístico: sempre produz o mesmo Buffer.
 */
function gerarFixtureDreF360(): Buffer {
  const aoa: (string | number)[][] = [
    ["Agrobar Porto Alegre", "12/2025", "%", "", "01/2026", "%", "", "02/2026", "%", ""],
    ["1 - Receita Bruta", "R$ 700.000,00", "100,0%", "", "R$ 720.000,00", "100,0%", "", "R$ 740.000,00", "100,0%", ""],
    ["2 - Redutores de Venda", "-R$ 5.000,00", "0,7%", "", "-R$ 5.200,00", "0,7%", "", "-R$ 5.400,00", "0,7%", ""],
    ["3 - Receita Líquida", "R$ 695.000,00", "99,3%", "", "R$ 714.800,00", "99,3%", "", "R$ 734.600,00", "99,3%", ""],
    ["4 - Custo de Mercadoria", "-R$ 200.000,00", "28,6%", "", "-R$ 205.000,00", "28,5%", "", "-R$ 210.000,00", "28,4%", ""],
    ["5 - Impostos", "-R$ 50.000,00", "7,1%", "", "-R$ 51.000,00", "7,1%", "", "-R$ 52.000,00", "7,0%", ""],
    ["6 - Taxa Mensal Franquias", "-R$ 15.000,00", "2,1%", "", "-R$ 15.500,00", "2,2%", "", "-R$ 16.000,00", "2,2%", ""],
    ["7 - Colaboradores", "-R$ 180.000,00", "25,7%", "", "-R$ 185.000,00", "25,7%", "", "-R$ 190.000,00", "25,7%", ""],
    ["8 - Serviços de Terceiros", "-R$ 10.000,00", "1,4%", "", "-R$ 10.200,00", "1,4%", "", "-R$ 10.400,00", "1,4%", ""],
    ["9 - Terceiros Eventuais", "-R$ 8.000,00", "1,1%", "", "-R$ 8.200,00", "1,1%", "", "-R$ 8.400,00", "1,1%", ""],
    ["10 - Custo de Ocupação", "-R$ 40.000,00", "5,7%", "", "-R$ 41.000,00", "5,7%", "", "-R$ 42.000,00", "5,7%", ""],
    ["11 - Despesas Financeiras", "-R$ 12.000,00", "1,7%", "", "-R$ 12.300,00", "1,7%", "", "-R$ 12.600,00", "1,7%", ""],
    ["12 - Lucro Operacional", "R$ 180.000,00", "25,7%", "", "R$ 186.600,00", "25,9%", "", "R$ 193.200,00", "26,1%", ""],
    ["13 - Pró-labore / Distribuição", "-R$ 20.000,00", "2,9%", "", "-R$ 20.000,00", "2,8%", "", "-R$ 20.000,00", "2,7%", ""],
    ["14 - Resultado", "R$ 160.000,00", "22,9%", "", "R$ 166.600,00", "23,1%", "", "R$ 173.200,00", "23,4%", ""],
    ["15 - Despesas Não Operacionais", "-R$ 5.000,00", "0,7%", "", "-R$ 3.000,00", "0,4%", "", "-R$ 2.000,00", "0,3%", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  // Aba extra "Filtros Escolhidos" com metadados do export — igual ao arquivo real,
  // não deve ser escolhida (não tem colunas de mês).
  const wsFiltros = XLSX.utils.aoa_to_sheet([
    ["Modelo", "DRE F360º"],
    ["Empresa", "Agrobar Porto Alegre"],
    ["Regime", "Competência"],
  ]);
  XLSX.utils.book_append_sheet(wb, wsFiltros, "Filtros Escolhidos");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("lerDreHistorico", () => {
  beforeEach(() => {
    vi.mocked(storageDownload).mockReset();
  });

  it("baixa o buffer via storageDownload, chama extractDreHistorico e devolve os últimos N meses", async () => {
    const buf = gerarFixtureDreF360();
    vi.mocked(storageDownload).mockResolvedValue(buf);

    const meses = await lerDreHistorico("dre/agrobar-poa.xlsx", "DRE Agrobar Porto Alegre_Novo.xlsx", 3);

    expect(storageDownload).toHaveBeenCalledWith("dre/agrobar-poa.xlsx");
    expect(meses).toHaveLength(3);
    expect(meses.map(m => m.anoMes)).toEqual(["2025-12", "2026-01", "2026-02"]);

    const [dez, jan, fev] = meses;

    expect(dez.faturamento).toBe(700000);
    expect(dez.cmv).toBe(200000);
    expect(dez.folha).toBe(180000);
    expect(dez.impostos).toBe(50000);

    expect(jan.faturamento).toBe(720000);
    expect(jan.cmv).toBe(205000);
    expect(jan.folha).toBe(185000);
    expect(jan.impostos).toBe(51000);

    expect(fev.faturamento).toBe(740000);
    expect(fev.cmv).toBe(210000);
    expect(fev.folha).toBe(190000);
    expect(fev.impostos).toBe(52000);
  });

  it("devolve só os últimos 2 meses quando meses=2", async () => {
    const buf = gerarFixtureDreF360();
    vi.mocked(storageDownload).mockResolvedValue(buf);

    const meses = await lerDreHistorico("dre/agrobar-poa.xlsx", "qualquer.xlsx", 2);

    expect(meses).toHaveLength(2);
    expect(meses.map(m => m.anoMes)).toEqual(["2026-01", "2026-02"]);
  });

  it("usa meses=3 como default quando o parâmetro é omitido", async () => {
    const buf = gerarFixtureDreF360();
    vi.mocked(storageDownload).mockResolvedValue(buf);

    const meses = await lerDreHistorico("dre/agrobar-poa.xlsx", "qualquer.xlsx");

    expect(meses).toHaveLength(3);
  });
});

describe("cellToNumberDre / parseNumeroBR — conversão de célula pt-BR com R$", () => {
  it("cellToNumberDre: 'R$ 1.234,56' → 1234.56", () => {
    expect(cellToNumberDre("R$ 1.234,56")).toBe(1234.56);
  });

  it("cellToNumberDre: '-R$ 200.000,00' → -200000", () => {
    expect(cellToNumberDre("-R$ 200.000,00")).toBe(-200000);
  });

  it("cellToNumberDre: 'R$ -' (zero) → 0", () => {
    expect(cellToNumberDre("R$ -")).toBe(0);
  });

  it("parseNumeroBR: '1.234,56' → 1234.56", () => {
    expect(parseNumeroBR("1.234,56")).toBe(1234.56);
  });
});
