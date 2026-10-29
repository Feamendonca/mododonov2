/**
 * sheet-parser.ts
 * Parser de planilhas Excel/CSV para importação de produtos e checklist.
 * Usa SheetJS (xlsx) para leitura de arquivos em base64.
 *
 * LEITOR ÚNICO ROBUSTO: parseSpreadsheetToGrid
 * - Sempre usa header:1 (grade linha×coluna) — nunca cabeçalho automático
 * - Suporta .xlsx, .xls, .csv, .xlsb
 * - 300 linhas por aba (adaptativo)
 * - Quando > 5 abas: devolve lista para o usuário escolher
 * - Normaliza números pt-BR: "1.234,56" → 1234.56
 * - Erros acionáveis (nunca genéricos)
 */

import * as XLSX from "xlsx";

// ─── Leitor único robusto (DREs e planilhas complexas) ────────────────────────

export interface SheetGridRow {
  rowIndex: number; // 1-based (linha real na planilha)
  cells: (string | number | null)[]; // valores normalizados
}

export interface SheetGrid {
  sheetName: string;
  totalRows: number;
  rows: SheetGridRow[]; // até MAX_ROWS linhas
  truncated: boolean;
}

export interface SpreadsheetParseResult {
  /** Lista de abas disponíveis no arquivo */
  sheetNames: string[];
  /** Grade de cada aba solicitada (ou todas se ≤ 5 abas e nenhuma selecionada) */
  sheets: SheetGrid[];
  /** true quando o arquivo tem > 5 abas e nenhuma foi selecionada — o chamador deve pedir ao usuário para escolher */
  needsSheetSelection: boolean;
  /** Nome do arquivo original */
  fileName: string;
}

const MAX_ROWS_PER_SHEET = 300;
const MAX_AUTO_SHEETS = 5;

/**
 * Converte string numérica pt-BR para number.
 * "1.234,56" → 1234.56 (remove pontos de milhar ANTES de trocar vírgula)
 * Exportada para uso em outros módulos e testes.
 */
export function parseNumeroBR(v: unknown): number {
  if (typeof v === "number") return v;
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).trim();
  // Remove pontos de milhar, troca vírgula decimal por ponto
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

/**
 * Converte um JS Date (epoch 1899-12-30, mesma base do Excel) de volta para o
 * serial numérico de data do Excel. Necessário porque `raw:true` + workbook
 * lido com `cellDates:true` devolve `Date` para células de data (`t:"d"` ou
 * `t:"n"` formatada como data) em vez do serial numérico — e o detector de
 * cabeçalho de mês (`isMesHeaderCell`/`parseMesLabel`, Task S6) só reconhece
 * number/string, não `Date`. Sem isto, `rawNumbers:true` quebraria a detecção
 * de mês em arquivos reais (ex. Bella Gula) cujo cabeçalho é data do Excel.
 */
function excelSerialFromDate(d: Date): number {
  return Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Normaliza número pt-BR: "1.234,56" → 1234.56 */
function normalizePtBR(v: unknown): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return excelSerialFromDate(v);
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  if (s === "") return null;
  // Tenta número pt-BR: "1.234,56" ou "1234,56"
  const ptBR = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(ptBR);
  if (!isNaN(n) && /^-?[\d.,]+$/.test(s)) return n;
  return s;
}

/**
 * Lê uma planilha (base64 ou Buffer) em grade linha×coluna.
 * @param source base64 string ou Buffer do arquivo
 * @param fileName nome original do arquivo (para detectar extensão)
 * @param selectedSheets abas a incluir (undefined = todas, se ≤ 5)
 * @param opts.rawNumbers quando `true`, lê células numéricas (`t=n`) com
 *   `raw:true` — devolve `cell.v` (o número cru) em vez de `cell.w` (texto
 *   formatado para exibição). Corrige o bug de escala em DREs cujas células
 *   são formatadas em padrão US (`.w=" 599,814.61 "`): com `raw:false`,
 *   `normalizePtBR` assumia pt-BR e removia o ponto decimal, gerando valores
 *   ~1000x menores (Task S7). Default `false` — preserva o comportamento
 *   atual (texto formatado pt-BR) para produtos/checklist, que dependem de
 *   `normalizePtBR` interpretar strings como "1.234,56".
 */
export function parseSpreadsheetToGrid(
  source: string | Buffer,
  fileName: string,
  selectedSheets?: string[],
  opts?: { rawNumbers?: boolean }
): SpreadsheetParseResult {
  let workbook: XLSX.WorkBook;

  try {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const buf = typeof source === "string" ? Buffer.from(source, "base64") : source;

    if (ext === "csv") {
      const text = buf.toString("utf-8");
      workbook = XLSX.read(text, { type: "string" });
    } else if (ext === "xlsb") {
      // SheetJS lê .xlsb nativamente com type:buffer
      workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
    } else {
      workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
    }
  } catch (err) {
    // SheetJS lê XLSB nativamente — se chegou aqui, o arquivo está corrompido ou é inválido
    console.error("[sheet-parser] Erro ao ler planilha:", fileName, err);
    throw new Error(
      `Não foi possível ler a planilha (arquivo corrompido ou formato não suportado). Tente salvar como .xlsx ou .csv direto no Excel.`
    );
  }

  const allSheetNames = workbook.SheetNames;

  // Decidir quais abas processar
  let sheetsToProcess: string[];
  let needsSheetSelection = false;

  if (selectedSheets && selectedSheets.length > 0) {
    // Usuário escolheu abas específicas
    sheetsToProcess = selectedSheets.filter(s => allSheetNames.includes(s));
  } else if (allSheetNames.length > MAX_AUTO_SHEETS) {
    // Muitas abas: pedir seleção ao usuário
    needsSheetSelection = true;
    sheetsToProcess = [];
  } else {
    sheetsToProcess = allSheetNames;
  }

  const sheets: SheetGrid[] = [];

  for (const sheetName of sheetsToProcess) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    // Leitura em grade — SEMPRE header:1, nunca cabeçalho automático
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      // raw:false (default) retorna strings formatadas (.w) para preservar
      // pt-BR em produtos/checklist. raw:true (opts.rawNumbers) retorna o
      // valor cru (.v) das células numéricas — necessário para DREs com
      // formatação de exibição em padrão US (Task S7).
      raw: opts?.rawNumbers === true,
    });

    const totalRows = rawRows.length;
    const truncated = totalRows > MAX_ROWS_PER_SHEET;
    const rowsToInclude = rawRows.slice(0, MAX_ROWS_PER_SHEET);

    const gridRows: SheetGridRow[] = rowsToInclude.map((row, idx) => ({
      rowIndex: idx + 1,
      cells: (row as unknown[]).map(normalizePtBR),
    }));

    sheets.push({ sheetName, totalRows, rows: gridRows, truncated });
  }

  return {
    sheetNames: allSheetNames,
    sheets,
    needsSheetSelection,
    fileName,
  };
}

/**
 * Converte o resultado de parseSpreadsheetToGrid em texto legível para o prompt da IA.
 * Inclui a ORIGEM (aba + linha) de cada dado — obrigatório para o Bloco C.
 */
export function gridToPromptText(
  result: SpreadsheetParseResult,
  maxLinesPerSheet = MAX_ROWS_PER_SHEET
): string {
  if (result.needsSheetSelection) {
    return `O arquivo tem ${result.sheetNames.length} abas. O usuário precisa selecionar quais abas analisar: ${result.sheetNames.join(", ")}`;
  }

  let text = `Arquivo: ${result.fileName}\n`;

  for (const sheet of result.sheets) {
    text += `\n\n=== Aba: "${sheet.sheetName}" (${sheet.totalRows} linhas totais) ===\n`;
    if (sheet.truncated) {
      text += `[Mostrando primeiras ${maxLinesPerSheet} linhas de ${sheet.totalRows}]\n`;
    }

    for (const row of sheet.rows.slice(0, maxLinesPerSheet)) {
      const nonNull = row.cells.filter(c => c !== null && c !== "");
      if (nonNull.length === 0) continue; // pular linhas vazias
      const cellsStr = row.cells.map(c => (c === null ? "" : String(c))).join(" | ");
      text += `[Aba:${sheet.sheetName} Linha:${row.rowIndex}] ${cellsStr}\n`;
    }
  }

  return text;
}

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface ParsedProduct {
  rowIndex: number;
  nome: string;
  categoria: string;
  unidade: string;
  curvaABC: "A" | "B" | "C";
  custoUnitario: number;
  errors: string[];
}

export interface ParsedChecklistItem {
  rowIndex: number;
  titulo: string;
  categoria: string;
  turno: "abertura" | "operacao" | "fechamento" | "todos";
  descricao: string | null;
  ordem: number;
  errors: string[];
}

export interface ParseResult<T> {
  rows: T[];
  validCount: number;
  errorCount: number;
  headers: string[];
  sheetName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function cellStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function cellNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      const n = parseNumeroBR(v);
      // Retorna o primeiro campo que produz um número válido (incluindo 0 explícito)
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function loadWorkbook(base64: string): XLSX.WorkBook {
  const buf = Buffer.from(base64, "base64");
  return XLSX.read(buf, { type: "buffer", cellDates: true });
}

// ─── Parser de Produtos ───────────────────────────────────────────────────────
/**
 * Colunas esperadas (case-insensitive, aceita variações com/sem acento):
 *   nome / produto / item           → nome do produto (obrigatório)
 *   categoria / grupo               → categoria (padrão: "Geral")
 *   unidade / un / und              → unidade de medida (padrão: "KG")
 *   curva / abc / curva_abc         → A, B ou C (padrão: "B")
 *   custo / preco / valor / custo_unitario → custo unitário (padrão: 0)
 */
export function parseProductSheet(base64: string): ParseResult<ParsedProduct> {
  const wb = loadWorkbook(base64);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (raw.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, headers: [], sheetName };
  }

  // Mapear headers normalizados → chave original
  const firstRow = raw[0];
  const headerMap: Record<string, string> = {};
  for (const key of Object.keys(firstRow)) {
    headerMap[normalizeHeader(key)] = key;
  }

  const headers = Object.keys(firstRow);

  // Resolver aliases de colunas
  const colNome = headerMap["nome"] || headerMap["produto"] || headerMap["item"] || headerMap["descricao"] || "";
  const colCategoria = headerMap["categoria"] || headerMap["grupo"] || headerMap["family"] || "";
  const colUnidade = headerMap["unidade"] || headerMap["un"] || headerMap["und"] || headerMap["unit"] || "";
  const colCurva = headerMap["curva"] || headerMap["abc"] || headerMap["curvabc"] || headerMap["curvaabc"] || "";
  const colCusto = headerMap["custo"] || headerMap["preco"] || headerMap["valor"] || headerMap["custounitario"] || headerMap["precounitario"] || "";

  const rows: ParsedProduct[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const errors: string[] = [];

    const nome = cellStr(r, colNome);
    if (!nome) {
      errors.push("Nome do produto é obrigatório");
    }

    const categoria = cellStr(r, colCategoria) || "Geral";

    // Validação de unidade: aceita qualquer string não-vazia, padroniza para maiúsculo
    const unidadeRaw = cellStr(r, colUnidade);
    const unidade = unidadeRaw ? unidadeRaw.toUpperCase() : "KG";
    const UNIDADES_VALIDAS = ["KG", "G", "L", "ML", "UN", "CX", "PCT", "SC", "FD", "PC", "DZ", "LT"];
    if (unidadeRaw && !UNIDADES_VALIDAS.includes(unidade)) {
      // Apenas aviso — não bloqueia, pois unidades customizadas são comuns
      // errors.push(`Unidade desconhecida: "${unidadeRaw}" — verifique se está correta`);
    }

    // Validação de custo: deve ser número válido e não-negativo
    const custoRaw = colCusto ? r[colCusto] : undefined;
    const custoUnitario = cellNum(r, colCusto);
    if (custoRaw !== undefined && custoRaw !== null && String(custoRaw).trim() !== "") {
      // Verifica se o valor original era uma string não-numérica
      const custoStr = String(custoRaw).trim();
      const custoTestado = parseNumeroBR(custoStr);
      if (isNaN(custoTestado) || !/^-?[\d.,\s]+$/.test(custoStr.replace(/R\$\s*/g, ""))) {
        errors.push(`Custo inválido na coluna custo: "${custoRaw}" — deve ser um número (ex: 18.50 ou 18,50)`);
      } else if (custoTestado < 0) {
        errors.push(`Custo negativo não permitido: ${custoTestado}`);
      }
    }

    const curvaRaw = cellStr(r, colCurva).toUpperCase();
    let curvaABC: "A" | "B" | "C" = "B";
    if (curvaRaw === "A" || curvaRaw === "B" || curvaRaw === "C") {
      curvaABC = curvaRaw;
    } else if (curvaRaw && curvaRaw !== "") {
      errors.push(`Curva ABC inválida: "${curvaRaw}" (use A, B ou C)`);
    }

    rows.push({
      rowIndex: i + 2, // +2 porque linha 1 é header
      nome,
      categoria,
      unidade,
      curvaABC,
      custoUnitario,
      errors,
    });
  }

  const validCount = rows.filter((r) => r.errors.length === 0 && r.nome).length;
  const errorCount = rows.filter((r) => r.errors.length > 0 || !r.nome).length;

  return { rows, validCount, errorCount, headers, sheetName };
}

// ─── Parser de Checklist ──────────────────────────────────────────────────────
/**
 * Colunas esperadas (case-insensitive, aceita variações com/sem acento):
 *   titulo / item / descricao       → título do item (obrigatório)
 *   categoria / grupo               → categoria (padrão: "Geral")
 *   turno                           → abertura | operacao | fechamento | todos (padrão: "todos")
 *   descricao / observacao / detalhe → descrição detalhada (opcional)
 *   ordem / order / seq             → ordem de exibição (padrão: índice)
 */
export function parseChecklistSheet(base64: string): ParseResult<ParsedChecklistItem> {
  const wb = loadWorkbook(base64);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (raw.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, headers: [], sheetName };
  }

  const firstRow = raw[0];
  const headerMap: Record<string, string> = {};
  for (const key of Object.keys(firstRow)) {
    headerMap[normalizeHeader(key)] = key;
  }

  const headers = Object.keys(firstRow);

  const colTitulo = headerMap["titulo"] || headerMap["item"] || headerMap["nome"] || headerMap["atividade"] || "";
  const colCategoria = headerMap["categoria"] || headerMap["grupo"] || headerMap["area"] || "";
  const colTurno = headerMap["turno"] || headerMap["momento"] || headerMap["periodo"] || "";
  const colDescricao = headerMap["descricao"] || headerMap["observacao"] || headerMap["detalhe"] || headerMap["instrucao"] || "";
  const colOrdem = headerMap["ordem"] || headerMap["order"] || headerMap["seq"] || headerMap["sequencia"] || "";

  const TURNO_MAP: Record<string, "abertura" | "operacao" | "fechamento" | "todos"> = {
    abertura: "abertura",
    abertura_: "abertura",
    abrir: "abertura",
    opening: "abertura",
    operacao: "operacao",
    operação: "operacao",
    operacional: "operacao",
    meio: "operacao",
    operation: "operacao",
    fechamento: "fechamento",
    fechar: "fechamento",
    encerramento: "fechamento",
    closing: "fechamento",
    todos: "todos",
    all: "todos",
    geral: "todos",
  };

  const rows: ParsedChecklistItem[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const errors: string[] = [];

    const titulo = cellStr(r, colTitulo);
    if (!titulo) {
      errors.push("Título do item é obrigatório");
    }

    const categoria = cellStr(r, colCategoria) || "Geral";
    const descricao = cellStr(r, colDescricao) || null;
    const ordemRaw = cellNum(r, colOrdem);
    const ordem = ordemRaw > 0 ? ordemRaw : i + 1;

    const turnoRaw = normalizeHeader(cellStr(r, colTurno));
    let turno: "abertura" | "operacao" | "fechamento" | "todos" = "todos";
    if (turnoRaw) {
      const mapped = TURNO_MAP[turnoRaw];
      if (mapped) {
        turno = mapped;
      } else {
        errors.push(`Turno inválido: "${cellStr(r, colTurno)}" (use: abertura, operacao, fechamento ou todos)`);
      }
    }

    rows.push({
      rowIndex: i + 2,
      titulo,
      categoria,
      turno,
      descricao,
      ordem,
      errors,
    });
  }

  const validCount = rows.filter((r) => r.errors.length === 0 && r.titulo).length;
  const errorCount = rows.filter((r) => r.errors.length > 0 || !r.titulo).length;

  return { rows, validCount, errorCount, headers, sheetName };
}

// ─── Gerador de templates ─────────────────────────────────────────────────────

export function generateProductTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  const data = [
    ["nome", "categoria", "unidade", "curva", "custo"],
    ["Filé Mignon", "Carnes", "KG", "A", "89.90"],
    ["Frango Peito", "Carnes", "KG", "A", "18.50"],
    ["Queijo Mussarela", "Laticínios", "KG", "A", "32.00"],
    ["Tomate", "Hortifruti", "KG", "B", "4.50"],
    ["Alface", "Hortifruti", "UN", "B", "2.00"],
    ["Óleo de Soja", "Secos", "L", "B", "8.90"],
    ["Farinha de Trigo", "Secos", "KG", "C", "3.50"],
    ["Copo Descartável 300ml", "Descartáveis", "UN", "C", "0.15"],
    ["Embalagem Delivery", "Descartáveis", "UN", "B", "0.80"],
    ["Refrigerante Lata", "Bebidas", "UN", "A", "2.50"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  // Largura das colunas
  ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function generateChecklistTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  const data = [
    ["titulo", "categoria", "turno", "descricao", "ordem"],
    ["Todos os funcionários com uniforme completo", "Equipe", "abertura", "Verificar calçado, avental, touca e crachá", 1],
    ["Temperatura dos equipamentos de frio verificada", "Cozinha", "abertura", "Câmara fria, freezer e geladeiras dentro da faixa correta", 2],
    ["Mise en place completo antes da abertura", "Cozinha", "abertura", "Todos os insumos preparados e porcionados", 3],
    ["Banheiros limpos e abastecidos", "Higiene", "abertura", "Papel higiênico, sabonete, papel toalha e lixo vazio", 4],
    ["Mesas limpas e prontas em até 3 min após saída do cliente", "Salão", "operacao", "Monitorar tempo de virada de mesa", 5],
    ["Equipe nas posições corretas", "Equipe", "operacao", "Caixa, recepção, garçons e cozinha com cobertura adequada", 6],
    ["Banheiros verificados a cada hora", "Higiene", "operacao", "Limpeza e abastecimento durante o pico", 7],
    ["Conferência de caixa realizada", "Caixa", "fechamento", "Valores batendo com o sistema", 8],
    ["Cozinha limpa e sanitizada", "Higiene", "fechamento", "Equipamentos, bancadas e piso limpos", 9],
    ["Todos os equipamentos desligados", "Segurança", "fechamento", "Fritadeiras, chapas, fornos e luzes do estoque", 10],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 50 }, { wch: 15 }, { wch: 12 }, { wch: 50 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, "Checklist");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ─── Extrator de DRE para Orçamento IA ───────────────────────────────────────

export interface DreExtractResult {
  dreContexto: string;
  abaSelecionada: string;
  mesBase: string;
  totalLinhas: number;
  needsSheetSelection: boolean;
  sheetNames: string[];
}

// Inclui abreviações pt-BR E inglês ("Jan-26", "Feb-26"...) — ver nota em
// parseMesLabel sobre células de DATA do Excel formatadas em inglês (Task S6).
const MESES_REGEX = /\b(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec)[\w\/\-]*/i;

// ── Serial de data do Excel como cabeçalho de mês (Task S6) ──────────────────
// Alguns arquivos reais (ex.: DRE Ano26 BGP (AZM).xlsb da Bella Gula) trazem o
// cabeçalho de mês como SERIAL de data do Excel (número puro: 46023=2026-01,
// 46054=2026-02...) em vez de texto ("jan/26"). Faixa plausível ~40000–60000
// cobre datas de ~2009 a ~2064 — suficiente pra não colidir com valores de
// DRE (que aparecem nas linhas de dado, nunca no cabeçalho de mês).
const SERIAL_DATA_MIN = 40000;
const SERIAL_DATA_MAX = 60000;

function isSerialDataExcel(cell: string): boolean {
  if (!/^\d{5,6}$/.test(cell)) return false;
  const n = Number(cell);
  return n >= SERIAL_DATA_MIN && n <= SERIAL_DATA_MAX;
}

/** Converte serial de data do Excel (epoch 1899-12-30) para "YYYY-MM". */
function serialDataExcelParaAnoMes(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** true quando a célula (já convertida pra string) parece cabeçalho de mês — texto OU serial de data. */
function isMesHeaderCell(cell: string): boolean {
  return MESES_REGEX.test(cell) || /^\d{1,2}\/\d{2,4}$/.test(cell) || isSerialDataExcel(cell);
}

export function cellToNumberDre(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (s === "-" || s === "—") return 0;
  // Remove símbolo R$ e espaços
  const raw = s.replace(/R\$\s*/g, "").replace(/\s/g, "");
  if (!raw) return null;
  // "R$ -" (zero formatado pelo F360) — o replace acima já removeu o "R$ ",
  // sobrando só o traço.
  if (raw === "-" || raw === "—") return 0;
  // Detectar formato pelo ÚLTIMO separador:
  //   "524,386.78" → último sep é "." e há "," antes → formato US (vírgula=milhar, ponto=decimal)
  //   "524.386,78" → último sep é "," → formato pt-BR (ponto=milhar, vírgula=decimal)
  //   "524386.78"  → só ponto → decimal simples
  //   "524386,78"  → só vírgula → decimal pt-BR simples
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let clean: string;
  if (lastDot > lastComma && lastComma >= 0) {
    // Formato US: "524,386.78" — vírgula é milhar, ponto é decimal
    clean = raw.replace(/,/g, "");
  } else if (lastComma > lastDot) {
    // Formato pt-BR: "524.386,78" — ponto é milhar, vírgula é decimal
    clean = raw.replace(/\./g, "").replace(",", ".");
  } else {
    // Sem separador de milhar, ou só ponto decimal: "524386.78" / "524386,78"
    clean = raw.replace(",", ".");
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function isMainLineDre(desc: string): boolean {
  if (!desc) return false;
  const trimmed = desc.trim();
  return !/^\d+\.\d+\.\d+/.test(trimmed);
}

function detectDreSheetName(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames;
  // Calcular score de cada aba — só abas com >=3 colunas de mês são candidatas
  const candidates: { name: string; score: number }[] = [];
  for (const name of names) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    // Verificar se tem linha de cabeçalho com >=3 colunas de mês (nas primeiras 15 linhas)
    let mesColCount = 0;
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i] as unknown[];
      const meses = row.filter(c => isMesHeaderCell(String(c ?? "").trim()));
      if (meses.length >= 3) { mesColCount = meses.length; break; }
    }
    // Aba sem colunas de mês NÃO é candidata (evita aba de mapeamento DE-PARA)
    if (mesColCount === 0) continue;
    const text = rows.slice(0, 30).flat().map(c => String(c ?? "").toUpperCase()).join(" ");
    const hasReceitaBruta = text.includes("RECEITA BRUTA") ? 10 : 0;
    const hasReceita = text.includes("RECEITA") ? 5 : 0;
    const numericCells = rows.flat().filter(c => {
      const n = cellToNumberDre(c);
      return n !== null && n !== 0;
    }).length;
    // Bônus: aba chamada exatamente "DRE" (case-insensitive)
    const nameBonusDre = name.trim().toUpperCase() === "DRE" ? 20 : 0;
    const score = hasReceitaBruta + hasReceita + mesColCount * 2 + numericCells + nameBonusDre;
    candidates.push({ name, score });
  }
  if (candidates.length > 0) {
    // Ordenar por score decrescente e retornar a melhor
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].name;
  }
  // Fallback: se nenhuma aba tem colunas de mês, retornar a com mais células numéricas
  let bestSheet = names[0];
  let bestScore = 0;
  for (const name of names) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    const numericCells = rows.flat().filter(c => {
      const n = cellToNumberDre(c);
      return n !== null && n !== 0;
    }).length;
    if (numericCells > bestScore) { bestScore = numericCells; bestSheet = name; }
  }
  return bestSheet;
}

export function extractDreContext(
  fileBuffer: Buffer,
  fileName: string,
  selectedSheets?: string[]
): DreExtractResult {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  let workbook: XLSX.WorkBook;

  try {
    if (ext === "csv") {
      let text = fileBuffer.toString("utf-8");
      if (text.includes("\uFFFD")) text = fileBuffer.toString("latin1");
      const firstLine = text.split("\n")[0] ?? "";
      const useSemicolon = firstLine.split(";").length > firstLine.split(",").length;
      if (useSemicolon) {
        // CSV com ";" como separador e "," como decimal (padrão pt-BR)
        // Usar SheetJS FS option para separador correto sem confundir decimal
        workbook = XLSX.read(text, { type: "string", FS: ";" });
      } else {
        workbook = XLSX.read(text, { type: "string" });
      }
    } else {
      workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
    }
  } catch {
    throw new Error("Não foi possível ler o arquivo. Tente salvar como .xlsx ou .csv no Excel.");
  }

  const sheetNames = workbook.SheetNames;

  if (sheetNames.length > 5 && (!selectedSheets || selectedSheets.length === 0)) {
    const autoSheet = detectDreSheetName(workbook);
    const ws = workbook.Sheets[autoSheet];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    const text = rows.slice(0, 30).flat().map(c => String(c ?? "").toUpperCase()).join(" ");
    if (!text.includes("RECEITA")) {
      console.warn(`[extractDreContext] Nenhuma aba com colunas de mês + RECEITA encontrada em "${fileName}" — solicitando seleção manual.`);
      return { dreContexto: "", abaSelecionada: "", mesBase: "", totalLinhas: 0, needsSheetSelection: true, sheetNames };
    }
    selectedSheets = [autoSheet];
}

  const sheetToUse = selectedSheets && selectedSheets.length > 0
    ? selectedSheets[0]
    : detectDreSheetName(workbook);

  const ws = workbook.Sheets[sheetToUse];
  if (!ws) {
    return { dreContexto: "Aba não encontrada.", abaSelecionada: sheetToUse, mesBase: "", totalLinhas: 0, needsSheetSelection: false, sheetNames };
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
  const totalLinhas = rawRows.length;

  let headerRowIdx = -1;
  let mesColIndices: { colIdx: number; label: string }[] = [];

  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i] as unknown[];
    const mesesFound: { colIdx: number; label: string }[] = [];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").trim();
      if (isMesHeaderCell(cell)) {
        mesesFound.push({ colIdx: j, label: cell });
      }
    }
    if (mesesFound.length >= 3) { headerRowIdx = i; mesColIndices = mesesFound; break; }
  }

  let mesBase = "último período disponível";
  let mesBaseColIdx = mesColIndices.length > 0 ? mesColIndices[mesColIndices.length - 1].colIdx : -1;

  if (mesColIndices.length > 0) {
    const mesesReais = mesColIndices.filter(m => {
      const l = m.label.toUpperCase();
      return !l.includes("ANO") && !l.includes("MED") && !l.includes("TOT") && !l.includes("ACUM");
    });
    for (let mi = mesesReais.length - 1; mi >= 0; mi--) {
      const col = mesesReais[mi];
      const dataRows = rawRows.slice(headerRowIdx + 1, headerRowIdx + 60);
      const hasData = dataRows.some(row => {
        const v = cellToNumberDre((row as unknown[])[col.colIdx]);
        return v !== null && v !== 0;
      });
      if (hasData) { mesBase = col.label; mesBaseColIdx = col.colIdx; break; }
    }
  }

  const dataRows = rawRows.slice(headerRowIdx >= 0 ? headerRowIdx + 1 : 0);
  const linhas: string[] = [];

  if (mesColIndices.length > 0) {
    linhas.push(`Colunas: ${mesColIndices.map(m => m.label).join(" | ")}`);
    linhas.push(`Mês-base usado: ${mesBase} (coluna ${mesBaseColIdx + 1})`);
    linhas.push("");
  }

  for (const row of dataRows.slice(0, 300)) {
    const cells = row as unknown[];
    const desc = String(cells[0] ?? "").trim();
    if (!desc) continue;
    if (!isMainLineDre(desc)) continue;

    if (mesBaseColIdx >= 0) {
      const val = cellToNumberDre(cells[mesBaseColIdx]);
      const pctCell = cells[mesBaseColIdx + 1];
      const pct = pctCell !== null && pctCell !== undefined ? cellToNumberDre(pctCell) : null;
      if (val !== null) {
        const valFmt = val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const pctStr = pct !== null ? ` (${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)` : "";
        linhas.push(`${desc}: R$ ${valFmt}${pctStr}`);
      } else {
        linhas.push(desc);
      }
    } else {
      const vals = cells.slice(1).map(c => {
        if (c === null || c === undefined || c === "") return "";
        const n = cellToNumberDre(c);
        return n !== null ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : String(c);
      }).filter(Boolean);
      if (vals.length > 0) linhas.push(`${desc}: ${vals.join(" | ")}`);
      else linhas.push(desc);
    }
  }

  const dreContexto = `DRE histórica da planilha "${fileName}" (aba: "${sheetToUse}", ${totalLinhas} linhas).
Mês-base: ${mesBase} — use APENAS estes valores como histórico real.
IMPORTANTE: Preserve os valores EXATOS. NÃO arredonde. Zeros/"-" = sem dado.

${linhas.join("\n")}`;

  // Bug 3: se não encontrou linha de mês nem valores, acionar seleção manual em vez de retornar contexto vazio
  if (headerRowIdx === -1) {
    const hasAnyValue = rawRows.flat().some(c => {
      const n = cellToNumberDre(c);
      // Considerar apenas valores >= 100 como "dados reais de DRE"
      // (exclui índices de mapeamento como "1", "2", "3.1.1" que são < 100)
      return n !== null && Math.abs(n) >= 100;
    });
    if (!hasAnyValue) {
      console.warn(`[extractDreContext] Aba "${sheetToUse}" não tem linha de mês nem valores numéricos — solicitando seleção manual.`);
      return { dreContexto: "", abaSelecionada: sheetToUse, mesBase: "", totalLinhas, needsSheetSelection: true, sheetNames };
    }
  }

  return { dreContexto, abaSelecionada: sheetToUse, mesBase, totalLinhas, needsSheetSelection: false, sheetNames };
}

// ─── extractDreHistorico ──────────────────────────────────────────────────────
// Mapeamento de linhas nível-1 do DRE para categorias da tabela dre_historico_mensal.
// Cada entrada: [regex para a descrição da linha, categoria]
// Nota: "receita" exige sufixo (bruta|operacional) — SEM incluir "líquida" —
// porque o F360 tem "1 - Receita Bruta" (nível 1, real) E "3 - Receita Líquida"
// (nível 1, mas CALCULADA/derivada). Se "líquida" entrasse aqui, as duas linhas
// seriam somadas na mesma categoria "faturamento", dobrando o valor.
const CATEGORIA_MAP: [RegExp, keyof DreHistoricoMes][] = [
  [/receita\s*(bruta|operacional)\b/i, "faturamento"],
  [/cmv|custo.*mercadoria|custo.*vend/i, "cmv"],
  [/folha|sal[áa]rio|pessoal|colaborador|m[ãa]o.de.obra|encargo|rh\b/i, "folha"],
  [/imposto|tributo|simples\b|iss\b|icms|pis\b|cofins|taxa\s*cart/i, "impostos"],
  [/custo.*fix|despesa.*fix|aluguel|condom[íi]nio|energia|[áa]gua|royalt|marketing|contabilidade|ocupa[çc][ãa]o|franquia|terceiro/i, "custosFixos"],
  [/custo.*var|despesa.*var|embalagem|delivery|comiss|financeir/i, "custosVariaveis"],
  [/ebitda|resultado|lucro\s*operat/i, "ebitda"],
];

export interface DreHistoricoMes {
  anoMes: string; // "YYYY-MM"
  faturamento: number | null;
  cmv: number | null;
  folha: number | null;
  custosFixos: number | null;
  custosVariaveis: number | null;
  impostos: number | null;
  ebitda: number | null;
}

export interface DreHistoricoResult {
  meses: DreHistoricoMes[];
  abaSelecionada: string;
  ignorados: number; // meses zerados descartados
  aviso?: string;
}

/**
 * Extrai o histórico completo de DRE de uma planilha, retornando TODOS os meses
 * com dado real (≠ 0). Reutiliza detectDreSheetName, cellToNumberDre e isMainLineDre.
 * NÃO altera extractDreContext.
 */
export function extractDreHistorico(
  fileBuffer: Buffer,
  fileName: string,
  selectedSheet?: string
): DreHistoricoResult {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  let workbook: XLSX.WorkBook;
  try {
    if (ext === "csv") {
      const str = fileBuffer.toString("utf-8").includes("\ufffd")
        ? fileBuffer.toString("latin1")
        : fileBuffer.toString("utf-8");
      workbook = XLSX.read(str, { type: "string", FS: ";" });
    } else {
      workbook = XLSX.read(fileBuffer, { type: "buffer" });
    }
  } catch (err) {
    return { meses: [], abaSelecionada: "", ignorados: 0, aviso: "Erro ao ler planilha: " + String(err) };
  }

  const sheetName = selectedSheet ?? detectDreSheetName(workbook);
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    return { meses: [], abaSelecionada: sheetName, ignorados: 0, aviso: "Aba não encontrada: " + sheetName };
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });

  // ── Encontrar linha de cabeçalho com colunas de mês ──────────────────────────
  let headerRowIdx = -1;
  let mesColIndices: { colIdx: number; label: string; anoMes: string }[] = [];

  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const row = rawRows[i] as unknown[];
    const found: { colIdx: number; label: string; anoMes: string }[] = [];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").trim();
      if (!isMesHeaderCell(cell)) continue;
      // Ignorar colunas de totais/médias
      const upper = cell.toUpperCase();
      if (upper.includes("ANO") || upper.includes("MED") || upper.includes("TOT") || upper.includes("ACUM")) continue;
      // Derivar anoMes da label: "jan/26" → "2026-01", "jan-26" → "2026-01"
      const anoMes = parseMesLabel(cell);
      if (anoMes) found.push({ colIdx: j, label: cell, anoMes });
    }
    if (found.length >= 3) { headerRowIdx = i; mesColIndices = found; break; }
  }

  if (headerRowIdx === -1 || mesColIndices.length === 0) {
    return { meses: [], abaSelecionada: sheetName, ignorados: 0, aviso: "Não foi possível detectar colunas de mês na aba." };
  }

  // ── Para cada mês, agregar as linhas de nível-1 nas categorias ───────────────
  const dataRows = rawRows.slice(headerRowIdx + 1);
  const resultMap: Record<string, DreHistoricoMes> = {};
  for (const col of mesColIndices) {
    resultMap[col.anoMes] = {
      anoMes: col.anoMes,
      faturamento: null, cmv: null, folha: null,
      custosFixos: null, custosVariaveis: null, impostos: null, ebitda: null,
    };
  }

  for (const rawRow of dataRows.slice(0, 400)) {
    const cells = rawRow as unknown[];
    const desc = String(cells[0] ?? "").trim();
    if (!desc || !isMainLineDre(desc)) continue;

    // Encontrar categoria
    let categoria: keyof DreHistoricoMes | null = null;
    for (const [regex, cat] of CATEGORIA_MAP) {
      if (regex.test(desc)) { categoria = cat; break; }
    }
    if (!categoria || categoria === "anoMes") continue;

    // Somar o valor desta linha em cada mês
    for (const col of mesColIndices) {
      const v = cellToNumberDre(cells[col.colIdx]);
      if (v === null) continue;
      const mes = resultMap[col.anoMes];
      if (!mes) continue;
      const prev = mes[categoria] as number | null;
      (mes as unknown as Record<string, number | null>)[categoria] = (prev ?? 0) + Math.abs(v);
    }
  }

  // ── Filtrar meses com dado real (faturamento > 0) ────────────────────────────
  const todos = Object.values(resultMap).sort((a, b) => a.anoMes.localeCompare(b.anoMes));
  const comDado = todos.filter(m => m.faturamento !== null && m.faturamento > 0);
  const ignorados = todos.length - comDado.length;

  // Calcular EBITDA se não foi encontrado diretamente
  for (const m of comDado) {
    if (m.ebitda === null && m.faturamento !== null) {
      const despesas = (m.cmv ?? 0) + (m.folha ?? 0) + (m.custosFixos ?? 0) + (m.custosVariaveis ?? 0) + (m.impostos ?? 0);
      m.ebitda = m.faturamento - despesas;
    }
  }

  return { meses: comDado, abaSelecionada: sheetName, ignorados };
}

/**
 * Converte label de mês para "YYYY-MM". Retorna null se não conseguir parsear.
 * Aceita:
 *  - Texto pt-BR: "jan/26", "jan-26", "jan 26"
 *  - Texto inglês: "Jan-26", "Feb-26"... (célula de DATA do Excel formatada
 *    em inglês — `.w` devolvido por `raw:false`; só jan/mar/jun/jul/nov
 *    coincidem com pt-BR, os outros 7 precisam do mapa em inglês — Task S6)
 *  - "01/26", "1/26" (mês numérico)
 *  - Serial de data do Excel, número ou string numérica ("46023" → "2026-01",
 *    faixa plausível ~40000-60000 — Task S6)
 */
export function parseMesLabel(label: string | number): string | null {
  // Serial de data do Excel (número puro ou numérico vindo como number):
  // 46023 → "2026-01". Ver isSerialDataExcel/serialDataExcelParaAnoMes (Task S6).
  if (typeof label === "number") {
    if (label >= SERIAL_DATA_MIN && label <= SERIAL_DATA_MAX) {
      return serialDataExcelParaAnoMes(label);
    }
    return null;
  }
  if (isSerialDataExcel(label.trim())) {
    return serialDataExcelParaAnoMes(Number(label.trim()));
  }

  const MESES_MAP: Record<string, string> = {
    jan: "01",
    fev: "02", feb: "02",
    mar: "03",
    abr: "04", apr: "04",
    mai: "05", may: "05",
    jun: "06",
    jul: "07",
    ago: "08", aug: "08",
    set: "09", sep: "09",
    out: "10", oct: "10",
    nov: "11",
    dez: "12", dec: "12",
  };
  const s = label.trim().toLowerCase();
  // "jan/26", "jan-26", "jan 26", "Feb-26"...
  const m1 = s.match(/^(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec)[\s\/\-](\d{2,4})$/i);
  if (m1) {
    const mes = MESES_MAP[m1[1].toLowerCase()];
    const anoRaw = m1[2];
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    return `${ano}-${mes}`;
  }
  // "01/26", "1/26"
  const m2 = s.match(/^(\d{1,2})[\s\/\-](\d{2,4})$/);
  if (m2) {
    const mes = m2[1].padStart(2, "0");
    const anoRaw = m2[2];
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    return `${ano}-${mes}`;
  }
  return null;
}
