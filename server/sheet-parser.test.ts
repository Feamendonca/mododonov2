/**
 * sheet-parser.test.ts
 * Testes automatizados para os caminhos de importação de planilha.
 *
 * Cobre:
 *  1. parseNumeroBR — bug confirmado: "1.234,56" deve virar 1234.56, não 1.234
 *  2. parseProductSheet — produtos com custo em pt-BR, curva inválida, custo negativo
 *  3. parseSpreadsheetToGrid — leitura de .xlsx em base64 com números pt-BR
 *  4. parseChecklistSheet — itens com turno válido/inválido
 */
// 5. xlsb: SheetJS lê .xlsb nativamente (sem conversão)
// 6. Content-Type por extensão (lógica do frontend)

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseNumeroBR,
  parseProductSheet,
  parseChecklistSheet,
  parseSpreadsheetToGrid,
  extractDreContext,
  parseMesLabel,
} from "./sheet-parser";

// ─── Helpers para gerar planilhas em memória ──────────────────────────────────

function makeXlsxBase64(rows: unknown[][]): string {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf.toString("base64");
}

function makeXlsxBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ─── 1. parseNumeroBR — bug confirmado ───────────────────────────────────────

describe("parseNumeroBR", () => {
  it("converte número com milhar brasileiro corretamente", () => {
    // BUG CONFIRMADO: "1.234,56" deve virar 1234.56, não 1.234
    expect(parseNumeroBR("1.234,56")).toBe(1234.56);
  });

  it("converte número sem milhar com vírgula decimal", () => {
    expect(parseNumeroBR("18,50")).toBe(18.5);
  });

  it("converte número com múltiplos pontos de milhar", () => {
    expect(parseNumeroBR("1.234.567,89")).toBe(1234567.89);
  });

  it("trata string com apenas ponto como milhar (comportamento pt-BR): '89.90' vira 8990", () => {
    // No formato pt-BR, '89.90' é interpretado como 8990 (ponto é separador de milhar).
    // Para passar números en-US, o chamador deve converter antes de chamar parseNumeroBR.
    // Este teste documenta o comportamento esperado.
    expect(parseNumeroBR("89.90")).toBe(8990);
  });

  it("converte número inteiro sem separadores", () => {
    expect(parseNumeroBR("1000")).toBe(1000);
  });

  it("retorna 0 para string vazia", () => {
    expect(parseNumeroBR("")).toBe(0);
  });

  it("retorna 0 para null", () => {
    expect(parseNumeroBR(null)).toBe(0);
  });

  it("retorna 0 para undefined", () => {
    expect(parseNumeroBR(undefined)).toBe(0);
  });

  it("retorna o próprio número quando já é number", () => {
    expect(parseNumeroBR(42.5)).toBe(42.5);
  });

  it("custo de estoque 1.250,00 por caixa deve ser 1250, não 1.25", () => {
    // Caso real da auditoria: "1.250,00" estava virando 1.25 com o bug antigo
    expect(parseNumeroBR("1.250,00")).toBe(1250);
  });

  it("retorna 0 para string não-numérica", () => {
    expect(parseNumeroBR("abc")).toBe(0);
  });
});

// ─── 2. parseProductSheet — produtos ─────────────────────────────────────────

describe("parseProductSheet", () => {
  it("lê produto com custo em formato pt-BR (milhar)", () => {
    const rows = [
      ["nome", "categoria", "unidade", "curva", "custo"],
      ["Filé Mignon", "Carnes", "KG", "A", "1.234,56"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.validCount).toBe(1);
    expect(result.rows[0].custoUnitario).toBe(1234.56);
    expect(result.rows[0].errors).toHaveLength(0);
  });

  it("lê produto com custo em formato decimal simples", () => {
    const rows = [
      ["nome", "categoria", "unidade", "curva", "custo"],
      ["Frango Peito", "Carnes", "KG", "A", "18,50"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.rows[0].custoUnitario).toBe(18.5);
    expect(result.rows[0].errors).toHaveLength(0);
  });

  it("marca erro quando custo é string não-numérica", () => {
    const rows = [
      ["nome", "categoria", "unidade", "curva", "custo"],
      ["Produto X", "Geral", "KG", "B", "abc"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[0].errors[0]).toContain("Custo inválido");
  });

  it("marca erro quando custo é negativo", () => {
    const rows = [
      ["nome", "categoria", "unidade", "curva", "custo"],
      ["Produto Y", "Geral", "KG", "B", "-5,00"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[0].errors[0]).toContain("negativo");
  });

  it("marca erro quando curva ABC é inválida", () => {
    const rows = [
      ["nome", "categoria", "unidade", "curva", "custo"],
      ["Produto Z", "Geral", "KG", "X", "10,00"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[0].errors[0]).toContain("Curva ABC inválida");
  });

  it("marca erro quando nome está vazio", () => {
    const rows = [
      ["nome", "categoria", "unidade", "curva", "custo"],
      ["", "Geral", "KG", "B", "10,00"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors).toContain("Nome do produto é obrigatório");
  });

  it("usa padrões quando campos opcionais estão ausentes", () => {
    const rows = [
      ["nome"],
      ["Produto Simples"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.rows[0].categoria).toBe("Geral");
    expect(result.rows[0].unidade).toBe("KG");
    expect(result.rows[0].curvaABC).toBe("B");
    expect(result.rows[0].custoUnitario).toBe(0);
  });

  it("lê múltiplos produtos com curvas diferentes", () => {
    const rows = [
      ["nome", "curva", "custo"],
      ["Produto A", "A", "100,00"],
      ["Produto B", "B", "50,00"],
      ["Produto C", "C", "10,00"],
    ];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.validCount).toBe(3);
    expect(result.rows[0].curvaABC).toBe("A");
    expect(result.rows[1].curvaABC).toBe("B");
    expect(result.rows[2].curvaABC).toBe("C");
  });

  it("retorna arrays vazios para planilha sem dados", () => {
    const rows: unknown[][] = [];
    const result = parseProductSheet(makeXlsxBase64(rows));
    expect(result.rows).toHaveLength(0);
    expect(result.validCount).toBe(0);
  });
});

// ─── 3. parseSpreadsheetToGrid — leitura em grade ────────────────────────────

describe("parseSpreadsheetToGrid", () => {
  it("normaliza números pt-BR na grade", () => {
    const rows = [
      ["Produto", "Custo"],
      ["Filé Mignon", "1.234,56"],
      ["Frango", "18,50"],
    ];
    const buf = makeXlsxBuffer(rows);
    const result = parseSpreadsheetToGrid(buf, "teste.xlsx");
    expect(result.needsSheetSelection).toBe(false);
    expect(result.sheets).toHaveLength(1);
    const sheet = result.sheets[0];
    // Linha 2 (índice 1): custo deve ser 1234.56
    expect(sheet.rows[1].cells[1]).toBe(1234.56);
    // Linha 3 (índice 2): custo deve ser 18.5
    expect(sheet.rows[2].cells[1]).toBe(18.5);
  });

  it("retorna needsSheetSelection=true para arquivo com mais de 5 abas", () => {
    const wb = XLSX.utils.book_new();
    for (let i = 1; i <= 7; i++) {
      const ws = XLSX.utils.aoa_to_sheet([["Aba", i]]);
      XLSX.utils.book_append_sheet(wb, ws, `Aba${i}`);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseSpreadsheetToGrid(buf, "multi.xlsx");
    expect(result.needsSheetSelection).toBe(true);
    expect(result.sheetNames).toHaveLength(7);
    expect(result.sheets).toHaveLength(0);
  });

  it("processa apenas as abas selecionadas quando selectedSheets é fornecido", () => {
    const wb = XLSX.utils.book_new();
    for (let i = 1; i <= 7; i++) {
      const ws = XLSX.utils.aoa_to_sheet([[`Dado${i}`]]);
      XLSX.utils.book_append_sheet(wb, ws, `Aba${i}`);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseSpreadsheetToGrid(buf, "multi.xlsx", ["Aba2", "Aba5"]);
    expect(result.needsSheetSelection).toBe(false);
    expect(result.sheets).toHaveLength(2);
    expect(result.sheets[0].sheetName).toBe("Aba2");
    expect(result.sheets[1].sheetName).toBe("Aba5");
  });

  it("lê arquivo base64 corretamente", () => {
    const rows = [["A", "B"], [1, 2]];
    const base64 = makeXlsxBase64(rows);
    const result = parseSpreadsheetToGrid(base64, "teste.xlsx");
    expect(result.sheets[0].rows).toHaveLength(2);
  });

  it("SheetJS é tolerante com conteúdo inválido: retorna resultado sem lançar erro", () => {
    // SheetJS interpreta conteúdo binário inválido como texto CSV.
    // O comportamento documentado: retorna resultado válido (não lança erro).
    const invalidBase64 = Buffer.from("isto nao e um xlsx").toString("base64");
    const result = parseSpreadsheetToGrid(invalidBase64, "corrompido.xlsx");
    expect(result).toBeDefined();
    expect(result.fileName).toBe("corrompido.xlsx");
    // SheetJS retorna a string como dado — o que importa é que não lança
    expect(result.sheets.length).toBeGreaterThanOrEqual(0);
  });

  it("inclui nome do arquivo no resultado", () => {
    const rows = [["col"]];
    const buf = makeXlsxBuffer(rows);
    const result = parseSpreadsheetToGrid(buf, "meu-arquivo.xlsx");
    expect(result.fileName).toBe("meu-arquivo.xlsx");
  });
});

// ─── 3b. parseSpreadsheetToGrid — rawNumbers (correção escala US vs pt-BR, Task S7) ──
// Repro ao vivo confirmada: na aba "DRE" real (Bella Gula), as células de
// valor são t=n (número) com v=599814.61 (cru, correto) e w=" 599,814.61 "
// (texto formatado em padrão US — vírgula=milhar, ponto=decimal). Com
// raw:false (default), o leitor pega o .w e normalizePtBR ASSUME pt-BR
// (remove o ponto) → ~1000x menor. rawNumbers:true usa o .v cru.

/** Constrói um .xlsx com uma célula numérica cujo .w fica formatado em padrão US. */
function makeUsFormattedXlsx(value: number, label = "Receita Bruta"): Buffer {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  ws["A1"] = { t: "s", v: label };
  ws["B1"] = { t: "n", v: value, z: "#,##0.00" };
  ws["!ref"] = "A1:B1";
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseSpreadsheetToGrid — rawNumbers (Task S7)", () => {
  it("com rawNumbers:true, devolve o valor numérico CRU (599814.61), não o texto formatado US mal-interpretado", () => {
    const buf = makeUsFormattedXlsx(599814.61);
    const result = parseSpreadsheetToGrid(buf, "dre.xlsx", undefined, { rawNumbers: true });
    expect(result.sheets[0].rows[0].cells[1]).toBe(599814.61);
  });

  it("documenta o bug: sem rawNumbers (default), o mesmo arquivo formatado US sai ~1000x menor", () => {
    const buf = makeUsFormattedXlsx(599814.61);
    const result = parseSpreadsheetToGrid(buf, "dre.xlsx");
    // .w=" 599,814.61 " é lido como texto; normalizePtBR assume pt-BR
    // (remove o ponto de "milhar") → 599.81461, não 599814.61.
    expect(result.sheets[0].rows[0].cells[1]).not.toBe(599814.61);
    expect(result.sheets[0].rows[0].cells[1]).toBeCloseTo(599.81461, 3);
  });

  it("rawNumbers:true não quebra célula de DATA do Excel usada como cabeçalho de mês (vira Date sob raw:true+cellDates — precisa reconverter para serial)", () => {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {};
    // Cabeçalho "jan/26" como serial de data do Excel (46023), formatado "mmm-yy"
    ws["A1"] = { t: "n", v: 46023, z: "mmm-yy" };
    ws["B1"] = { t: "n", v: 599814.61, z: "#,##0.00" };
    ws["!ref"] = "A1:B1";
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseSpreadsheetToGrid(buf, "dre.xlsx", undefined, { rawNumbers: true });
    const headerCell = result.sheets[0].rows[0].cells[0];
    expect(parseMesLabel(headerCell as string | number)).toBe("2026-01");
    // E o valor ao lado continua correto
    expect(result.sheets[0].rows[0].cells[1]).toBe(599814.61);
  });

  it("rawNumbers:true não quebra célula t='d' (Date real do Excel) usada como cabeçalho de mês", () => {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {};
    ws["A1"] = { t: "d", v: new Date(Date.UTC(2026, 0, 1)), z: "mmm-yy" };
    ws["!ref"] = "A1:A1";
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseSpreadsheetToGrid(buf, "dre.xlsx", undefined, { rawNumbers: true });
    const headerCell = result.sheets[0].rows[0].cells[0];
    expect(parseMesLabel(headerCell as string | number)).toBe("2026-01");
  });

  it("default (sem opts) continua lendo normalmente — não quebra chamadas existentes", () => {
    const rows = [
      ["Produto", "Custo"],
      ["Filé Mignon", "1.234,56"],
    ];
    const buf = makeXlsxBuffer(rows);
    const result = parseSpreadsheetToGrid(buf, "teste.xlsx");
    expect(result.sheets[0].rows[1].cells[1]).toBe(1234.56);
  });
});

// ─── 4. parseChecklistSheet — checklist ──────────────────────────────────────

describe("parseChecklistSheet", () => {
  it("lê item de checklist com turno válido", () => {
    const rows = [
      ["titulo", "categoria", "turno", "descricao", "ordem"],
      ["Verificar temperatura", "Cozinha", "abertura", "Câmara fria", 1],
    ];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.validCount).toBe(1);
    expect(result.rows[0].turno).toBe("abertura");
    expect(result.rows[0].errors).toHaveLength(0);
  });

  it("aceita variações de turno (fechamento, operacao, todos)", () => {
    const rows = [
      ["titulo", "turno"],
      ["Item A", "fechamento"],
      ["Item B", "operacao"],
      ["Item C", "todos"],
    ];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.rows[0].turno).toBe("fechamento");
    expect(result.rows[1].turno).toBe("operacao");
    expect(result.rows[2].turno).toBe("todos");
    expect(result.validCount).toBe(3);
  });

  it("marca erro quando turno é inválido", () => {
    const rows = [
      ["titulo", "turno"],
      ["Item X", "manha"],
    ];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[0].errors[0]).toContain("Turno inválido");
  });

  it("usa 'todos' como padrão quando turno está ausente", () => {
    const rows = [
      ["titulo"],
      ["Item sem turno"],
    ];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.rows[0].turno).toBe("todos");
    expect(result.rows[0].errors).toHaveLength(0);
  });

  it("marca erro quando título está vazio", () => {
    const rows = [
      ["titulo", "turno"],
      ["", "abertura"],
    ];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors).toContain("Título do item é obrigatório");
  });

  it("usa índice como ordem quando ordem não é fornecida", () => {
    const rows = [
      ["titulo"],
      ["Item 1"],
      ["Item 2"],
    ];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.rows[0].ordem).toBe(1);
    expect(result.rows[1].ordem).toBe(2);
  });

  it("retorna arrays vazios para planilha sem dados", () => {
    const rows: unknown[][] = [];
    const result = parseChecklistSheet(makeXlsxBase64(rows));
    expect(result.rows).toHaveLength(0);
  });
});

// ─── 5. xlsb — SheetJS lê nativamente (sem conversão) ────────────────────────

describe("parseSpreadsheetToGrid — xlsb", () => {
  it("lê buffer .xlsb nativamente via SheetJS (sem conversão)", () => {
    // SheetJS suporta xlsb com type:'buffer' — gerar um arquivo xlsb em memória
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Receita", "CMV"], [100000, 34000]]);
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsb" }) as Buffer;
    // parseSpreadsheetToGrid deve ler o buffer xlsb sem lançar erro
    const result = parseSpreadsheetToGrid(buf, "dre.xlsb");
    expect(result.needsSheetSelection).toBe(false);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].rows).toHaveLength(2);
    // Linha 1: cabeçalhos
    expect(result.sheets[0].rows[0].cells[0]).toBe("Receita");
    // Linha 2: valores numéricos
    expect(result.sheets[0].rows[1].cells[0]).toBe(100000);
    expect(result.sheets[0].rows[1].cells[1]).toBe(34000);
  });

  it("lê buffer .xlsm nativamente via SheetJS", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Folha"], [25000]]);
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsm" }) as Buffer;
    const result = parseSpreadsheetToGrid(buf, "planilha.xlsm");
    expect(result.sheets[0].rows[1].cells[0]).toBe(25000);
  });
});

// ─── 6. Content-Type por extensão ────────────────────────────────────────────

describe("Content-Type por extensão (lógica do frontend)", () => {
  // Espelha a lógica do handleFileChange em OrcamentoAssistidoPage.tsx
  function getContentTypeByExt(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const ctMap: Record<string, string> = {
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
      xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
      xls: "application/vnd.ms-excel",
      csv: "text/csv",
    };
    return ctMap[ext] ?? "application/octet-stream";
  }

  it("xlsx → Content-Type correto", () => {
    expect(getContentTypeByExt("dre.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });
  it("xlsb → Content-Type correto", () => {
    expect(getContentTypeByExt("dre.xlsb")).toBe(
      "application/vnd.ms-excel.sheet.binary.macroEnabled.12"
    );
  });
  it("xlsm → Content-Type correto", () => {
    expect(getContentTypeByExt("dre.xlsm")).toBe(
      "application/vnd.ms-excel.sheet.macroEnabled.12"
    );
  });
  it("csv → Content-Type correto", () => {
    expect(getContentTypeByExt("dados.csv")).toBe("text/csv");
  });
  it("extensão desconhecida → fallback octet-stream", () => {
    expect(getContentTypeByExt("arquivo.bin")).toBe("application/octet-stream");
  });
  it("arquivo sem extensão → fallback octet-stream", () => {
    expect(getContentTypeByExt("arquivo")).toBe("application/octet-stream");
  });
  it("não depende de file.type (que pode vir vazio em arquivos convertidos)", () => {
    // Simula file.type vazio — a lógica usa só o nome do arquivo
    const fileName = "dre_convertida.xlsb";
    const fileTypeMimetype = ""; // vazio, como acontece com arquivos convertidos
    const ct = getContentTypeByExt(fileName);
    // Deve retornar o tipo correto independente do file.type
    expect(ct).toBe("application/vnd.ms-excel.sheet.binary.macroEnabled.12");
    expect(ct).not.toBe(fileTypeMimetype);
  });
});

// ─── Testes de extractDreContext ─────────────────────────────────────────────
describe("extractDreContext", () => {
  it("detecta aba com RECEITA BRUTA em XLSB multi-aba", () => {
    // Criar workbook com 2 abas — a segunda tem RECEITA BRUTA
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([["Dados"], ["irrelevante"]]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Descrição", "jan/26", "fev/26", "mar/26"],
      ["1 - RECEITA BRUTA", "500000", "520000", "480000"],
      ["2 - CMV", "160000", "166400", "153600"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, "Resumo");
    XLSX.utils.book_append_sheet(wb, ws2, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const result = extractDreContext(buf, "pecorino.xlsx");
    expect(result.abaSelecionada).toBe("DRE");
    expect(result.needsSheetSelection).toBe(false);
    expect(result.dreContexto).toContain("RECEITA BRUTA");
  });

  it("detecta mês-base como último com dado real (ignora futuros zerados)", () => {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Descrição", "jan/26", "fev/26", "mar/26", "abr/26", "mai/26"],
      ["1 - RECEITA BRUTA", "500000", "520000", "480000", "0", "0"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const result = extractDreContext(buf, "dre.xlsx");
    // Mês-base deve ser mar/26 (último com dado real), não mai/26
    expect(result.mesBase.toLowerCase()).toMatch(/mar/);
  });

  it("parseia CSV com separador ; e valores pt-BR", () => {
    const csvContent = "Descrição;jan/26;fev/26\n1 - RECEITA BRUTA;524.386,78;510.000,00\n2 - CMV;167.803,77;163.200,00\n";
    const buf = Buffer.from(csvContent, "utf-8");
    const result = extractDreContext(buf, "dre.csv");
    expect(result.dreContexto).toContain("524.386,78");
    expect(result.needsSheetSelection).toBe(false);
  });

  it("retorna needsSheetSelection quando arquivo tem muitas abas sem RECEITA", () => {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    for (let i = 1; i <= 7; i++) {
      const ws = XLSX.utils.aoa_to_sheet([["Aba " + i, "valor"], ["linha", i * 100]]);
      XLSX.utils.book_append_sheet(wb, ws, `Aba${i}`);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const result = extractDreContext(buf, "multi.xlsx");
    expect(result.needsSheetSelection).toBe(true);
    expect(result.sheetNames.length).toBe(7);
  });
});

// ─── Testes de cellToNumberDre (formato US vs BR) e detectDreSheetName (score) ─
describe("extractDreContext — formato US vs BR e seleção de aba por score", () => {
  it("formato US '524,386.78' é parseado como 524386.78 (não corrompido)", () => {
    const wb = XLSX.utils.book_new();
    // jan/26 tem o maior valor (524,386.78), mas mar/26 é o último com dado real
    // O extractDreContext usa o mês-base = último mês com dado real = mar/26 (498,200.50)
    const ws = XLSX.utils.aoa_to_sheet([
      ["Descrição", "jan/26", "fev/26", "mar/26"],
      ["1 - RECEITA BRUTA", "524,386.78", "510,000.00", "498,200.50"],
      ["2 - CMV", "167,803.77", "163,200.00", "159,424.16"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = extractDreContext(buf, "dre_us.xlsx");
    // Mês-base é mar/26 (último com dado real); valor de RECEITA BRUTA = 498,200.50 → exibido como 498.200,50
    expect(result.dreContexto).toContain("498.200,50");
    expect(result.needsSheetSelection).toBe(false);
    expect(result.abaSelecionada).toBe("DRE");
    // Confirmar que o mês-base é mar/26
    expect(result.mesBase.toLowerCase()).toMatch(/mar/);
  });

  it("formato pt-BR '524.386,78' é parseado como 524386.78", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Descrição", "jan/26", "fev/26", "mar/26"],
      ["1 - RECEITA BRUTA", "524.386,78", "510.000,00", "498.200,50"],
      ["2 - CMV", "167.803,77", "163.200,00", "159.424,16"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = extractDreContext(buf, "dre_br.xlsx");
    // Mês-base é mar/26; valor de RECEITA BRUTA = 498.200,50 (pt-BR)
    expect(result.dreContexto).toContain("498.200,50");
    expect(result.needsSheetSelection).toBe(false);
    expect(result.mesBase.toLowerCase()).toMatch(/mar/);
  });

  it("aba DE-PARA (sem colunas de mês) é ignorada; aba DRE (com meses) é escolhida — simula Pecorino", () => {
    const wb = XLSX.utils.book_new();
    // Aba DE-PARA: tem "RECEITA OPERACIONAL" mas SEM colunas de mês (aba de mapeamento)
    const wsDePara = XLSX.utils.aoa_to_sheet([
      ["Código", "Descrição", "Conta Contábil"],
      ["1", "RECEITA OPERACIONAL", "3.1.1"],
      ["2", "CMV", "4.1.1"],
      ["3", "Folha de Pagamento", "4.2.1"],
    ]);
    XLSX.utils.book_append_sheet(wb, wsDePara, "DE-PARA");
    // Aba DRE: tem RECEITA BRUTA + colunas de mês + valores reais (formato US)
    const wsDre = XLSX.utils.aoa_to_sheet([
      ["Descrição", "jan/26", "fev/26", "mar/26", "abr/26", "mai/26", "jun/26", "jul/26"],
      ["1 - RECEITA BRUTA", "524,386.78", "510,000.00", "498,200.50", "512,000.00", "530,000.00", "505,000.00", "0"],
      ["2 - CMV", "167,803.77", "163,200.00", "159,424.16", "163,840.00", "169,600.00", "161,600.00", "0"],
    ]);
    XLSX.utils.book_append_sheet(wb, wsDre, "DRE");
    // Adicionar abas de meses para simular as 14 abas do Pecorino
    for (const mes of ["JAN26","FEV26","MAR26","ABR26","MAI26","JUN26","JUL26","AGO26","SET26","OUT26","NOV26","DEZ26"]) {
      const ws = XLSX.utils.aoa_to_sheet([["Mês", mes], ["Receita", "100000"]]);
      XLSX.utils.book_append_sheet(wb, ws, mes);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = extractDreContext(buf, "pecorino.xlsb");
    // Deve escolher "DRE", não "DE-PARA"
    expect(result.abaSelecionada).toBe("DRE");
    expect(result.needsSheetSelection).toBe(false);
    // Mês-base deve ser jun/26 (último com dado real — jul/26 = 0)
    expect(result.mesBase.toLowerCase()).toMatch(/jun/);
    // Valor 505,000.00 (US) deve aparecer como 505.000,00 (pt-BR)
    expect(result.dreContexto).toContain("505.000,00");
  });

  it("Bug 3: aba selecionada sem linha de mês nem valores reais (>= 100) → needsSheetSelection=true", () => {
    const wb = XLSX.utils.book_new();
    // Aba de mapeamento: tem "RECEITA OPERACIONAL" mas só índices pequenos (1, 2, 3.1.1)
    // Sem colunas de mês e sem valores >= 100 (que indicariam DRE real)
    const ws = XLSX.utils.aoa_to_sheet([
      ["Código", "Descrição", "Conta"],
      ["1", "RECEITA OPERACIONAL", "3.1.1"],
      ["2", "CMV", "4.1.1"],
      ["3", "Folha", "4.2.1"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Mapeamento");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    // Forçar seleção da aba de mapeamento (sem meses nem valores reais de DRE)
    const result = extractDreContext(buf, "mapeamento.xlsx", ["Mapeamento"]);
    expect(result.needsSheetSelection).toBe(true);
  });
});

// ─── Testes de parseMesLabel — serial de data do Excel (Task S6) ─────────────
// Repro ao vivo: aba "DRE" da Bella Gula (DRE Ano26 BGP (AZM).xlsb) tem o
// cabeçalho de mês como SERIAL de data do Excel (46023=2026-01, 46054=2026-02,
// 46082=2026-03, 46113=2026-04...) em vez de texto ("jan/26"). O leitor
// detectava 0 meses porque só reconhecia texto.
describe("parseMesLabel — serial de data do Excel", () => {
  it("converte serial numérico (number) para YYYY-MM", () => {
    expect(parseMesLabel(46023)).toBe("2026-01");
    expect(parseMesLabel(46054)).toBe("2026-02");
    expect(parseMesLabel(46082)).toBe("2026-03");
    expect(parseMesLabel(46113)).toBe("2026-04");
  });

  it("converte serial numérico como STRING (como vem da grade lida) para YYYY-MM", () => {
    // parseSpreadsheetToGrid/sheet_to_json normalizam a célula numérica, mas o
    // código de detecção sempre faz String(cell) antes de chamar parseMesLabel.
    expect(parseMesLabel("46023")).toBe("2026-01");
    expect(parseMesLabel("46054")).toBe("2026-02");
  });

  it("NÃO quebra a detecção de texto existente (jan/26, 01/2026, MM/AAAA)", () => {
    expect(parseMesLabel("jan/26")).toBe("2026-01");
    expect(parseMesLabel("jan-26")).toBe("2026-01");
    expect(parseMesLabel("01/2026")).toBe("2026-01");
    expect(parseMesLabel("1/26")).toBe("2026-01");
  });

  it("não confunde número pequeno (fora da faixa de serial de data) com mês", () => {
    // "2026" sozinho (ano, sem separador) não é um serial de data plausível
    // (fora da faixa ~40000-60000) nem bate o formato de texto — deve ser null.
    expect(parseMesLabel("2026")).toBeNull();
    expect(parseMesLabel(2026)).toBeNull();
  });
});

// ─── Testes de parseMesLabel — abreviação de mês em INGLÊS (Task S6) ────────
// Repro ao vivo real: a aba "DRE" da Bella Gula tem célula de DATA do Excel
// (t:"d") cujo texto formatado (`.w`, o que `raw:false` devolve) é "Jan-26",
// "Feb-26", "Mar-26"... (abreviação em INGLÊS, não "jan/26" pt-BR). Só
// jan/mar/jun/jul/nov coincidem com o prefixo pt-BR — fev/abr/mai/ago/set/
// out/dez (fev→feb, abr→apr, mai→may, ago→aug, set→sep, out→oct, dez→dec)
// não batiam e o mês era perdido/mal-detectado.
describe("parseMesLabel — abreviação de mês em inglês (cabeçalho de data formatada)", () => {
  it("reconhece os 12 meses em abreviação inglesa 'Mon-YY'", () => {
    expect(parseMesLabel("Jan-26")).toBe("2026-01");
    expect(parseMesLabel("Feb-26")).toBe("2026-02");
    expect(parseMesLabel("Mar-26")).toBe("2026-03");
    expect(parseMesLabel("Apr-26")).toBe("2026-04");
    expect(parseMesLabel("May-26")).toBe("2026-05");
    expect(parseMesLabel("Jun-26")).toBe("2026-06");
    expect(parseMesLabel("Jul-26")).toBe("2026-07");
    expect(parseMesLabel("Aug-26")).toBe("2026-08");
    expect(parseMesLabel("Sep-26")).toBe("2026-09");
    expect(parseMesLabel("Oct-26")).toBe("2026-10");
    expect(parseMesLabel("Nov-26")).toBe("2026-11");
    expect(parseMesLabel("Dec-26")).toBe("2026-12");
  });
});
