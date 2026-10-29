/**
 * orcamento-arvore.ts
 * Parser da ÁRVORE COMPLETA da DRE (Task L1, reforma "orçamento linha a
 * linha" — ver docs/superpowers/specs/2026-10-29-orcamento-linha-a-linha.md).
 *
 * Diferença pra `extrairGruposPorMes` (orcamento-proposta.ts): aquela função
 * COLAPSA a DRE em ~12 categorias canônicas (perde sub-linhas). Esta extrai
 * TODAS as linhas — grupos nível-1 ("N - Nome") E sub-linhas nível-2
 * ("N.M - Nome") — preservando ORDEM e HIERARQUIA. NÃO substitui
 * `extrairGruposPorMes` (ainda usado por `proporOrcamento`); fica ao lado.
 *
 * REUSA a infra que já funciona em orcamento-proposta.ts: detecção de aba DRE
 * (`escolherAbaDre`), detecção de colunas de mês — serial/inglês/pt-BR —
 * (`detectarColunasDeMes`), e a regex de linha DERIVADA (`REGEX_DERIVADA`).
 * E de sheet-parser.ts: `parseSpreadsheetToGrid` (com `rawNumbers:true` —
 * Task S7) e `cellToNumberDre`.
 *
 * Regra dura (igual ao resto do orçamento): campo sem base no histórico =
 * `null`. NUNCA `?? 0` nem benchmark de mercado.
 */

import { parseSpreadsheetToGrid, cellToNumberDre } from "./sheet-parser";
import { escolherAbaDre, detectarColunasDeMes, REGEX_DERIVADA } from "./orcamento-proposta";

const DEFAULT_MESES = 3;

// Linha de nível 1 ("N - Nome") OU nível 2 ("N.M - Nome"). Sub-linhas mais
// profundas ("N.M.K - Nome") NÃO batem: o grupo opcional só aceita UM nível
// de ponto, e depois dele exige "-" imediatamente — "N.M.K" tem um "." extra
// antes do "-", o que quebra o match (começamos ignorando essas; ver brief).
const REGEX_LINHA_DRE = /^\s*(\d+)(?:\.(\d+))?\s*-\s*(.+)$/;

export interface LinhaDre {
  codigo: string; // "N" (nível 1) ou "N.M" (nível 2)
  label: string;
  nivel: 1 | 2;
  valor: number | null;
}

export interface MesArvore {
  anoMes: string; // "YYYY-MM"
  linhas: LinhaDre[]; // na ORDEM da DRE
}

/** true quando ALGUMA linha do mês tem valor ≠ null e ≠ 0 (mês com execução real). */
function temLinhaComDadoReal(linhas: LinhaDre[]): boolean {
  return linhas.some((l) => l.valor !== null && l.valor !== 0);
}

/**
 * Extrai, de uma planilha de DRE no formato F360 multi-mês, a ÁRVORE
 * COMPLETA (grupos nível-1 + sub-linhas nível-2), preservando ordem e
 * hierarquia. Devolve os últimos `meses` (default 3) meses encontrados, em
 * ordem cronológica crescente — mesmo contrato de `extrairGruposPorMes`.
 *
 * 100% determinístico: usa parseSpreadsheetToGrid + cellToNumberDre.
 * Nenhuma IA envolvida. NÃO grava banco.
 */
export function extrairArvoreDre(
  fileBuffer: Buffer,
  fileName: string,
  selectedSheet?: string,
  meses: number = DEFAULT_MESES,
): MesArvore[] {
  // rawNumbers:true — mesmo motivo de extrairGruposPorMes (Task S7): DREs com
  // células formatadas em padrão US quebrariam a escala sem isso.
  let parsed = parseSpreadsheetToGrid(fileBuffer, fileName, selectedSheet ? [selectedSheet] : undefined, { rawNumbers: true });

  // Mesma resolução por nome de aba "DRE" de extrairGruposPorMes (Task S6) —
  // arquivos reais costumam ter >5 abas (1 por mês + a aba "DRE").
  if (parsed.needsSheetSelection) {
    const abaPorNome = parsed.sheetNames.find((n) => n.trim().toUpperCase() === "DRE");
    if (!abaPorNome) return [];
    parsed = parseSpreadsheetToGrid(fileBuffer, fileName, [abaPorNome], { rawNumbers: true });
    if (parsed.needsSheetSelection) return [];
  }

  const sheet = escolherAbaDre(parsed.sheets);
  if (!sheet) return [];

  const { headerRowIdx, colunas } = detectarColunasDeMes(sheet);
  if (headerRowIdx === -1 || colunas.length === 0) return [];

  const porMes: Record<string, LinhaDre[]> = {};
  for (const col of colunas) porMes[col.anoMes] = [];

  for (let i = headerRowIdx + 1; i < sheet.rows.length; i++) {
    const cells = sheet.rows[i].cells;
    const desc = String(cells[0] ?? "").trim();
    if (!desc) continue;
    const match = desc.match(REGEX_LINHA_DRE);
    if (!match) continue; // sub-linha N.M.K ou ruído — ignora (ver comentário da regex)

    const n = match[1];
    const m = match[2];
    const label = match[3].trim();
    const nivel: 1 | 2 = m ? 2 : 1;
    const codigo = m ? `${n}.${m}` : n;

    for (const col of colunas) {
      const valor = cellToNumberDre(cells[col.colIdx]);
      porMes[col.anoMes].push({ codigo, label, nivel, valor });
    }
  }

  let todos: MesArvore[] = Object.entries(porMes)
    .map(([anoMes, linhas]) => ({ anoMes, linhas }))
    .sort((a, b) => a.anoMes.localeCompare(b.anoMes));

  // Mesmo princípio de extrairGruposPorMes (Task S6): DRE orçamentário anual
  // tem coluna pra todos os 12 meses, mas a cauda futura (sem execução) vem
  // zerada — corta do FIM pra trás até achar um mês com dado real.
  while (todos.length > 0 && !temLinhaComDadoReal(todos[todos.length - 1].linhas)) {
    todos = todos.slice(0, -1);
  }

  return todos.slice(-meses);
}

// ─── proporLinhas ───────────────────────────────────────────────────────────

export interface LinhaProposta {
  codigo: string;
  label: string;
  nivel: 1 | 2;
  derivada: boolean;
  temFilhos: boolean;
  natureza: "receita" | "custo" | "subtotal";
  histMedia: number | null;
  proposto: number | null;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

/**
 * Une os meses pela chave `codigo`, na ORDEM da DRE (primeira ocorrência de
 * cada código, varrendo os meses na ordem em que chegam). Para cada código:
 *   - `histMedia`/`proposto` = média dos valores NÃO-NULOS entre os meses.
 *     Nenhum mês com valor → `null` (NUNCA chuta).
 *   - `derivada` = label casa a mesma regex de linha DERIVADA usada em
 *     extrairGruposPorMes (Receita Líquida, Margem Bruta, Resultado, Lucro,
 *     EBITDA).
 *   - `temFilhos` = existe alguma linha nível-2 cujo código começa com
 *     "<codigo>." (ex.: "10" tem filho "10.1").
 *   - `natureza`: `subtotal` se `derivada` OU `temFilhos` (tem prioridade —
 *     mesmo um grupo nível-1 chamado "Receita Bruta" com sub-linhas é
 *     subtotal, nunca folha); senão `receita` se o label casa /receita/i E
 *     `histMedia` não é null e ≥ 0; senão `custo`.
 */
export function proporLinhas(meses: MesArvore[]): LinhaProposta[] {
  const ordem: string[] = [];
  const infoPorCodigo: Record<string, { label: string; nivel: 1 | 2 }> = {};
  const valoresPorCodigo: Record<string, number[]> = {};

  for (const mes of meses) {
    for (const linha of mes.linhas) {
      if (!(linha.codigo in infoPorCodigo)) {
        infoPorCodigo[linha.codigo] = { label: linha.label, nivel: linha.nivel };
        valoresPorCodigo[linha.codigo] = [];
        ordem.push(linha.codigo);
      }
      if (linha.valor !== null) valoresPorCodigo[linha.codigo].push(linha.valor);
    }
  }

  const codigosNivel2 = ordem.filter((c) => infoPorCodigo[c].nivel === 2);

  return ordem.map((codigo) => {
    const { label, nivel } = infoPorCodigo[codigo];
    const derivada = REGEX_DERIVADA.test(label);
    const temFilhos = codigosNivel2.some((c2) => c2.startsWith(`${codigo}.`));
    const histMedia = media(valoresPorCodigo[codigo]);
    const proposto = histMedia;

    let natureza: "receita" | "custo" | "subtotal";
    if (derivada || temFilhos) {
      natureza = "subtotal";
    } else if (/receita/i.test(label) && histMedia !== null && histMedia >= 0) {
      natureza = "receita";
    } else {
      natureza = "custo";
    }

    return { codigo, label, nivel, derivada, temFilhos, natureza, histMedia, proposto };
  });
}
