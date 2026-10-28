/**
 * orcamento-proposta.ts
 * Proposta determinística de orçamento (Task 3, Fase B) + motor puro de cálculo
 * de DRE. SEM IA. SEM gravar no banco. SEM aplicar migration.
 *
 * Decisão de projeto (ver task-3-brief.md): NÃO usa `DreHistoricoMes.ebitda`
 * (soma dupla) nem os baldes agregados `custosFixos/custosVariaveis`
 * (sheet-parser.ts CATEGORIA_MAP) — grossos demais. Em vez disso, lê os
 * TOTAIS DOS GRUPOS NÍVEL-1 por mês (linhas "N - Nome", N=1..15, ver
 * docs/superpowers/specs/2026-10-27-dre-f360-formato-referencia.md) e mapeia
 * cada grupo pro campo de `orcamentos` conforme a referência. EBITDA é
 * CALCULADO pelos componentes (calcularDre), nunca lido pronto da planilha.
 *
 * Regra dura: campo sem base no histórico = `null`. NUNCA `?? default` nem
 * benchmark de mercado. Isso é testado explicitamente em orcamento-proposta.test.ts.
 */

import { parseSpreadsheetToGrid, cellToNumberDre, parseMesLabel, type SheetGrid } from "./sheet-parser";

// ─── extrairGruposPorMes ──────────────────────────────────────────────────────

export interface GrupoDreMes {
  anoMes: string; // "YYYY-MM"
  /** Chaveado pelo código nível-1 ("1".."15") → total R$ do mês (negativo = despesa). */
  grupos: Record<string, number>;
}

const DEFAULT_MESES = 3;

// Linha de nível 1: "N - Nome" (N com 1-2 dígitos, sem ponto). Sub-linhas
// como "4.1 - Mat.Limpeza" ou "10.1 - Aluguel" NÃO batem porque o primeiro
// "." depois do número quebra o `\s*-\s*` esperado logo após os dígitos.
const REGEX_GRUPO_NIVEL1 = /^\s*(\d{1,2})\s*-\s*.+$/;

/** Ignora rótulos de coluna que não são mês real (ANO, MÉDIA, TOTAL, ACUMULADO). */
function ehRotuloDeMesReal(label: string): boolean {
  const upper = label.toUpperCase();
  return !upper.includes("ANO") && !upper.includes("MED") && !upper.includes("TOT") && !upper.includes("ACUM");
}

/** Conta, nas primeiras 15 linhas de uma aba, quantas células são rótulo de mês real. */
function contarColunasDeMes(sheet: SheetGrid): number {
  let melhor = 0;
  for (let i = 0; i < Math.min(15, sheet.rows.length); i++) {
    let count = 0;
    for (const cell of sheet.rows[i].cells) {
      if (cell === null) continue;
      const s = String(cell).trim();
      if (!ehRotuloDeMesReal(s)) continue;
      if (parseMesLabel(s)) count++;
    }
    if (count > melhor) melhor = count;
  }
  return melhor;
}

/** Escolhe, entre as abas lidas, a que tem blocos de coluna de mês (>=3). */
function escolherAbaDre(sheets: SheetGrid[]): SheetGrid | null {
  if (sheets.length === 0) return null;
  let melhor: SheetGrid | null = null;
  let melhorScore = 0;
  for (const sheet of sheets) {
    const score = contarColunasDeMes(sheet);
    if (score > melhorScore) { melhorScore = score; melhor = sheet; }
  }
  if (melhor) return melhor;
  return sheets[0];
}

/** Detecta a linha de cabeçalho e as colunas de mês ("MM/AAAA" → "YYYY-MM") de uma aba. */
function detectarColunasDeMes(sheet: SheetGrid): { headerRowIdx: number; colunas: { colIdx: number; anoMes: string }[] } {
  for (let i = 0; i < Math.min(15, sheet.rows.length); i++) {
    const row = sheet.rows[i];
    const encontradas: { colIdx: number; anoMes: string }[] = [];
    for (let j = 0; j < row.cells.length; j++) {
      const cell = row.cells[j];
      if (cell === null) continue;
      const s = String(cell).trim();
      if (!ehRotuloDeMesReal(s)) continue;
      const anoMes = parseMesLabel(s);
      if (anoMes) encontradas.push({ colIdx: j, anoMes });
    }
    if (encontradas.length >= 3) return { headerRowIdx: i, colunas: encontradas };
  }
  return { headerRowIdx: -1, colunas: [] };
}

/**
 * Extrai, de uma planilha de DRE no formato F360 multi-mês, os totais dos
 * grupos nível 1 (linhas "N - Nome") por mês. Devolve os últimos `meses`
 * (default 3) meses encontrados, em ordem cronológica crescente.
 *
 * 100% determinístico: usa parseSpreadsheetToGrid + cellToNumberDre +
 * parseMesLabel. Nenhuma IA envolvida.
 */
export function extrairGruposPorMes(
  fileBuffer: Buffer,
  fileName: string,
  selectedSheet?: string,
  meses: number = DEFAULT_MESES,
): GrupoDreMes[] {
  const parsed = parseSpreadsheetToGrid(fileBuffer, fileName, selectedSheet ? [selectedSheet] : undefined);
  if (parsed.needsSheetSelection) return [];

  const sheet = escolherAbaDre(parsed.sheets);
  if (!sheet) return [];

  const { headerRowIdx, colunas } = detectarColunasDeMes(sheet);
  if (headerRowIdx === -1 || colunas.length === 0) return [];

  const porMes: Record<string, Record<string, number>> = {};
  for (const col of colunas) porMes[col.anoMes] = {};

  for (let i = headerRowIdx + 1; i < sheet.rows.length; i++) {
    const cells = sheet.rows[i].cells;
    const desc = String(cells[0] ?? "").trim();
    if (!desc) continue;
    const match = desc.match(REGEX_GRUPO_NIVEL1);
    if (!match) continue; // sub-linha (N.M) ou ruído — ignora

    const codigo = match[1];
    for (const col of colunas) {
      const valor = cellToNumberDre(cells[col.colIdx]);
      if (valor === null) continue;
      porMes[col.anoMes][codigo] = valor;
    }
  }

  const todos: GrupoDreMes[] = Object.entries(porMes)
    .map(([anoMes, grupos]) => ({ anoMes, grupos }))
    .sort((a, b) => a.anoMes.localeCompare(b.anoMes));

  return todos.slice(-meses);
}

// ─── proporOrcamento ──────────────────────────────────────────────────────────

export interface RascunhoOrcamento {
  receitaBruta: number | null;
  cmvPct: number | null;
  impostosPct: number | null;
  royaltiesPct: number | null;
  fundoMarketingPct: number | null;
  folha: number | null;
  aluguel: number | null;
  condominio: number | null;
  energia: number | null;
  gas: number | null;
  agua: number | null;
  outrosOcupacao: number | null;
  contabilidade: number | null;
  sistemas: number | null;
  outrosServicos: number | null;
  taxaCartaoPct: number | null;
  juros: number | null;
  tarifasBancarias: number | null;
  marketing: number | null;
  outrasDespesas: number | null;
  proLabore: number | null;
  /**
   * true quando o RESULTADO OPERACIONAL médio do histórico (soma dos grupos
   * nível-1 "1".."11", que já vêm com sinal — receita positiva, despesas
   * negativas; equivale ao grupo 12 "Lucro Operacional", mas CALCULADO pelos
   * componentes, nunca lido pronto da linha 12) é negativo. Loja "em
   * atenção" entra em rampa de recuperação (ver `rampaMeses`).
   */
  emAtencao: boolean;
  /** Meses de rampa até a decisão seguir/encerrar. `3` quando `emAtencao`; senão `null`. */
  rampaMeses: number | null;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

/**
 * Monta um RASCUNHO de orçamento por média/tendência dos últimos meses,
 * mapeando os grupos nível-1 da DRE para os campos de `orcamentos` conforme
 * docs/superpowers/specs/2026-10-27-dre-f360-formato-referencia.md.
 *
 * Decisões de mapeamento (grupos sem sub-linha nível 2 disponível em
 * `GrupoDreMes`, logo impossível separar sem chutar):
 *   - Grupo 6 "Taxa Mensal Franquias" (Royalties + Fundo de Promoção) → o
 *     total vai inteiro pra `royaltiesPct`; `fundoMarketingPct` fica `null`
 *     (não há base pra saber quanto é royalty e quanto é fundo).
 *   - Grupo 10 "Custo de Ocupação" (Aluguel+Condomínio+IPTU+Seguro+Gás+
 *     Energia+Água) → o total vai inteiro pra `aluguel` (maior componente
 *     nomeado do grupo); `condominio/energia/gas/agua/outrosOcupacao` ficam
 *     `null`.
 *   - Grupo 8 "Serviços de Terceiros" → `outrosServicos`; `contabilidade` e
 *     `sistemas` ficam `null` (sem sub-linha pra separar).
 *   - Grupo 9 "Terceiros Eventuais" → `outrasDespesas`; `marketing` fica
 *     `null`.
 *   - Grupo 11 "Despesas Financeiras" (dominado por taxas de cartão) → % da
 *     receita em `taxaCartaoPct`; `juros`/`tarifasBancarias` ficam `null`.
 *   - Grupo 13 "Pró-labore/Distribuição" → `proLabore` (R$ médio).
 *   - Grupos 2/3/12/14/15 não são lidos (redutor/derivados/não-operacional —
 *     fora do escopo desta proposta; EBITDA é recalculado pelos componentes).
 *
 * Todo campo sem NENHUM mês com dado vira `null` — nunca 0, nunca benchmark.
 */
export function proporOrcamento(gruposPorMes: GrupoDreMes[]): RascunhoOrcamento {
  const receitaBrutaPorMes: number[] = [];
  const cmvPctPorMes: number[] = [];
  const impostosPctPorMes: number[] = [];
  const royaltiesPctPorMes: number[] = [];
  const folhaPorMes: number[] = [];
  const outrosServicosPorMes: number[] = [];
  const outrasDespesasPorMes: number[] = [];
  const aluguelPorMes: number[] = [];
  const taxaCartaoPctPorMes: number[] = [];
  const proLaborePorMes: number[] = [];

  for (const mes of gruposPorMes) {
    const receita = mes.grupos["1"];
    const temReceita = typeof receita === "number" && receita !== 0;
    if (typeof receita === "number") receitaBrutaPorMes.push(receita);

    if (temReceita && typeof mes.grupos["4"] === "number") {
      cmvPctPorMes.push(Math.abs(mes.grupos["4"]) / receita);
    }
    if (temReceita && typeof mes.grupos["5"] === "number") {
      impostosPctPorMes.push(Math.abs(mes.grupos["5"]) / receita);
    }
    if (temReceita && typeof mes.grupos["6"] === "number") {
      royaltiesPctPorMes.push(Math.abs(mes.grupos["6"]) / receita);
    }
    if (typeof mes.grupos["7"] === "number") {
      folhaPorMes.push(Math.abs(mes.grupos["7"]));
    }
    if (typeof mes.grupos["8"] === "number") {
      outrosServicosPorMes.push(Math.abs(mes.grupos["8"]));
    }
    if (typeof mes.grupos["9"] === "number") {
      outrasDespesasPorMes.push(Math.abs(mes.grupos["9"]));
    }
    if (typeof mes.grupos["10"] === "number") {
      aluguelPorMes.push(Math.abs(mes.grupos["10"]));
    }
    if (temReceita && typeof mes.grupos["11"] === "number") {
      taxaCartaoPctPorMes.push(Math.abs(mes.grupos["11"]) / receita);
    }
    if (typeof mes.grupos["13"] === "number") {
      proLaborePorMes.push(Math.abs(mes.grupos["13"]));
    }
  }

  const receitaBruta = media(receitaBrutaPorMes);
  const cmvPct = media(cmvPctPorMes);
  const folha = media(folhaPorMes);

  // Resultado operacional de CADA mês = Receita Líquida + custos (grupos
  // "4".."11", que já vêm negativos). Na DRE F360 real, grupo 3 "Receita
  // Líquida" é DERIVADO (= grupo 1 Receita Bruta + grupo 2 Redutores) e vem
  // preenchido no arquivo — então NUNCA somar o grupo 1 junto do 3 (dupla
  // contagem da receita). Usa o grupo 3 quando presente; senão reconstrói por
  // 1+2. Grupos 12/14 (Lucro Operacional / Resultado) são derivados e NUNCA
  // entram. Grupo ausente contribui 0 — nunca chuta valor pro faltante. Mês
  // sem NENHUM dado some do resultado (0), um mês "neutro".
  const resultadosOperacionaisPorMes = gruposPorMes.map((mes) => {
    const g3 = mes.grupos["3"];
    const receitaLiq = typeof g3 === "number"
      ? g3
      : (mes.grupos["1"] ?? 0) + (mes.grupos["2"] ?? 0);
    let soma = receitaLiq;
    for (let codigo = 4; codigo <= 11; codigo++) {
      const v = mes.grupos[String(codigo)];
      if (typeof v === "number") soma += v;
    }
    return soma;
  });
  const resultadoOperacionalMedio = media(resultadosOperacionaisPorMes);

  // Sem NENHUM mês de histórico não há base pra afirmar que a loja está no
  // vermelho — `emAtencao=false` (nunca assume o pior sem dado).
  const emAtencao = resultadoOperacionalMedio !== null && resultadoOperacionalMedio < 0;
  const rampaMeses = emAtencao ? 3 : null;

  return {
    receitaBruta,
    cmvPct,
    impostosPct: media(impostosPctPorMes),
    royaltiesPct: media(royaltiesPctPorMes),
    fundoMarketingPct: null, // grupo 6 agrega royalties+fundo — sem sub-linha, sem split possível
    folha,
    aluguel: media(aluguelPorMes),
    condominio: null,
    energia: null,
    gas: null,
    agua: null,
    outrosOcupacao: null,
    contabilidade: null,
    sistemas: null,
    outrosServicos: media(outrosServicosPorMes),
    taxaCartaoPct: media(taxaCartaoPctPorMes),
    juros: null,
    tarifasBancarias: null,
    marketing: null,
    outrasDespesas: media(outrasDespesasPorMes),
    proLabore: media(proLaborePorMes),
    emAtencao,
    rampaMeses,
  };
}

// ─── calcularPrazoDecisao ─────────────────────────────────────────────────────

/**
 * Prazo (YYYY-MM-DD) pra decisão seguir/encerrar de uma loja "em atenção":
 * `periodoInicio` + `rampaMeses` meses. PURA — não depende de "hoje", só de
 * aritmética de data em UTC (evita bug de fuso-horário em torno da meia-noite).
 * Normaliza troca de ano automaticamente (ex.: nov/2026 + 3 meses → fev/2027).
 */
export function calcularPrazoDecisao(periodoInicio: string, rampaMeses: number): string {
  const [anoStr, mesStr, diaStr] = periodoInicio.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr); // 1-12
  const dia = Number(diaStr);

  const d = new Date(Date.UTC(ano, mes - 1 + rampaMeses, dia));

  const anoOut = d.getUTCFullYear();
  const mesOut = String(d.getUTCMonth() + 1).padStart(2, "0");
  const diaOut = String(d.getUTCDate()).padStart(2, "0");
  return `${anoOut}-${mesOut}-${diaOut}`;
}

// ─── calcularDre ──────────────────────────────────────────────────────────────

export interface DreCalculada {
  receitaLiquida: number;
  cmvRs: number;
  ebitda: number;
  ebitdaPct: number;
  pontoEquilibrio: number;
  metaDiaria: number;
  /** true quando algum componente do rascunho era `null` (estimativa incompleta). */
  parcial: boolean;
}

/**
 * Porta pura de `calcularOrcamento`/`resolveValor` (~/Documents/modo-dono-app/server/db-orcamento.ts),
 * adaptada ao formato de `RascunhoOrcamento` desta task. Componentes `null`
 * são tratados como 0 no cálculo (nunca viram NaN/Infinity) MAS marcam
 * `parcial=true` — o resultado é só uma ESTIMATIVA, nunca se finge completo.
 *
 * EBITDA = receitaLíquida − cmv − impostos − royalties − fundo − folha −
 * ocupação − serviços − financeiras − marketing − outrasDespesas
 * (grupos 3 a 11 da DRE; pró-labore (13) e não-operacionais (15) ficam de
 * fora, igual à referência F360).
 *
 * pontoEquilibrio = custosFixos / (1 − %variáveis).
 * metaDiaria = receitaBruta / diasOperacao.
 */
export function calcularDre(rascunho: RascunhoOrcamento, diasOperacao: number): DreCalculada {
  const camposCriticos: (number | null)[] = [
    rascunho.receitaBruta,
    rascunho.cmvPct,
    rascunho.impostosPct,
    rascunho.royaltiesPct,
    rascunho.fundoMarketingPct,
    rascunho.folha,
    rascunho.aluguel,
    rascunho.condominio,
    rascunho.energia,
    rascunho.gas,
    rascunho.agua,
    rascunho.outrosOcupacao,
    rascunho.contabilidade,
    rascunho.sistemas,
    rascunho.outrosServicos,
    rascunho.taxaCartaoPct,
    rascunho.juros,
    rascunho.tarifasBancarias,
    rascunho.marketing,
    rascunho.outrasDespesas,
    rascunho.proLabore,
  ];
  const parcial = camposCriticos.some(c => c === null);

  const rb = rascunho.receitaBruta ?? 0;

  // Redutor de venda (grupo 2) fora do escopo desta task — receitaLiquida = rb.
  const receitaLiquida = rb;

  const cmvRs = rb * (rascunho.cmvPct ?? 0);
  const impostosRs = rb * (rascunho.impostosPct ?? 0);
  const royaltiesRs = rb * (rascunho.royaltiesPct ?? 0);
  const fundoMarketingRs = rb * (rascunho.fundoMarketingPct ?? 0);
  const taxaCartaoRs = rb * (rascunho.taxaCartaoPct ?? 0);

  const folhaRs = rascunho.folha ?? 0;
  const ocupacaoRs =
    (rascunho.aluguel ?? 0) +
    (rascunho.condominio ?? 0) +
    (rascunho.energia ?? 0) +
    (rascunho.gas ?? 0) +
    (rascunho.agua ?? 0) +
    (rascunho.outrosOcupacao ?? 0);
  const servicosRs = (rascunho.contabilidade ?? 0) + (rascunho.sistemas ?? 0) + (rascunho.outrosServicos ?? 0);
  const financeirasRs = (rascunho.juros ?? 0) + (rascunho.tarifasBancarias ?? 0) + taxaCartaoRs;
  const outrasRs = (rascunho.marketing ?? 0) + (rascunho.outrasDespesas ?? 0);

  const totalCustos =
    cmvRs + impostosRs + royaltiesRs + fundoMarketingRs +
    folhaRs + ocupacaoRs + servicosRs + financeirasRs + outrasRs;

  const ebitda = receitaLiquida - totalCustos;
  const ebitdaPct = rb > 0 ? ebitda / rb : 0;

  // Ponto de equilíbrio: custosFixos / (1 - %variáveis). Variáveis = tudo que é % da receita.
  const pctVariaveis =
    (rascunho.cmvPct ?? 0) +
    (rascunho.impostosPct ?? 0) +
    (rascunho.royaltiesPct ?? 0) +
    (rascunho.fundoMarketingPct ?? 0) +
    (rascunho.taxaCartaoPct ?? 0);
  const custosFixos =
    folhaRs + ocupacaoRs + servicosRs + (rascunho.juros ?? 0) + (rascunho.tarifasBancarias ?? 0) + outrasRs;
  const pontoEquilibrio = pctVariaveis < 1 ? custosFixos / (1 - pctVariaveis) : 0;

  const metaDiaria = diasOperacao > 0 ? rb / diasOperacao : 0;

  return { receitaLiquida, cmvRs, ebitda, ebitdaPct, pontoEquilibrio, metaDiaria, parcial };
}
