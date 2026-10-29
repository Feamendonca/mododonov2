/**
 * orcamento-proposta.ts
 * Proposta determinística de orçamento (Task 3, Fase B) + motor puro de cálculo
 * de DRE. SEM IA. SEM gravar no banco. SEM aplicar migration.
 *
 * Decisão de projeto (ver task-3-brief.md): NÃO usa `DreHistoricoMes.ebitda`
 * (soma dupla) nem os baldes agregados `custosFixos/custosVariaveis`
 * (sheet-parser.ts CATEGORIA_MAP) — grossos demais. Em vez disso, lê os
 * TOTAIS DOS GRUPOS NÍVEL-1 por mês (linhas "N - Nome", ver
 * docs/superpowers/specs/2026-10-27-dre-f360-formato-referencia.md) e
 * classifica cada grupo numa CATEGORIA CANÔNICA derivada do NOME da linha
 * (Task S8 — NUNCA pelo número "N": a numeração difere por template de DRE,
 * ex. "folha" é o grupo 7 no Agrobar mas o grupo 8 na Bella Gula). EBITDA é
 * CALCULADO pelos componentes (calcularDre), nunca lido pronto da planilha.
 *
 * Regra dura: campo sem base no histórico = `null`. NUNCA `?? default` nem
 * benchmark de mercado. Isso é testado explicitamente em orcamento-proposta.test.ts.
 */

import { parseSpreadsheetToGrid, cellToNumberDre, parseMesLabel, type SheetGrid } from "./sheet-parser";

// ─── classificação por CATEGORIA (Task S8) ─────────────────────────────────────
//
// O achado-chave (ver task-s8-brief.md): a NUMERAÇÃO dos grupos nível-1 difere
// por template de DRE — ex.: "folha" é o grupo 7 no Agrobar, mas o grupo 8 na
// Bella Gula (onde o grupo 7 é "MARGEM BRUTA", um SUBTOTAL). Chavear por
// número pega a linha errada em arquivos com numeração diferente da
// referência. O fix: classificar cada linha nível-1 por uma CATEGORIA
// CANÔNICA derivada do NOME (regex tolerante a acento/caixa), nunca pelo
// número da linha.

export type CategoriaDre =
  | "receitaBruta"
  | "redutores"
  | "cmv"
  | "impostos"
  | "franquias" // royalties + fundo de promoção
  | "folha" // colaboradores/pessoal
  | "despesasOperacionais"
  | "terceiros" // serviços de terceiros + terceiros eventuais
  | "ocupacao" // ocupação + utilidades
  | "financeiras"
  | "outras"
  | "proLabore";

/**
 * Linhas DERIVADAS (subtotais calculados pela própria planilha) — NUNCA
 * entram numa categoria, independente do número que carregam. Ex.: no
 * Agrobar o grupo 12 é "Lucro Operacional"; na Bella Gula o grupo 7 é
 * "MARGEM BRUTA" (também um subtotal, só que numerado como se fosse um
 * grupo normal). Testada ANTES das categorias — "Lucro Operacional" não
 * pode cair em nenhuma categoria por acidente.
 */
// Ancorada no INÍCIO do rótulo (tolerando prefixos "(=)", "=", "-", espaços)
// pra NÃO engolir custos reais que só CONTÊM "resultado"/"lucro" no meio —
// ex.: "Participação nos Lucros e Resultados" (PLR) é custo de folha, não subtotal.
export const REGEX_DERIVADA = /^[\s=().\-]*(receita\s+l[íi]quida|margem\s+bruta|resultado|lucro|ebitda)/i;

// Ordem importa só por clareza — nenhuma das regex abaixo colide com outra
// (cada uma exige um termo específico que não aparece nas demais linhas).
const CATEGORIA_REGEX: [CategoriaDre, RegExp][] = [
  ["receitaBruta", /receita\s+bruta|receita\s+loja/i],
  ["redutores", /redutor|taxa\s+de\s+servi/i],
  ["cmv", /custo.*mercadoria|cmv/i],
  ["impostos", /imposto|tributo/i],
  ["franquias", /franquia|royalt/i],
  ["folha", /colaborador|folha|pessoal|m[ãa]o.de.obra/i],
  ["despesasOperacionais", /despesa.*operac/i],
  ["terceiros", /terceiro/i],
  ["ocupacao", /ocupa[çc][ãa]o|utilidade/i],
  ["financeiras", /financeir/i],
  ["outras", /outras\s+despesas/i],
  ["proLabore", /pr[óo].?labore/i],
];

/**
 * Classifica a descrição de uma linha nível-1 ("N - Nome") numa categoria
 * canônica pelo NOME. Devolve `null` para linhas derivadas (subtotais) ou
 * sem categoria reconhecida — nesse caso a linha é IGNORADA (nunca entra
 * em nenhum campo por acidente).
 */
export function classificarCategoriaDre(desc: string): CategoriaDre | null {
  if (REGEX_DERIVADA.test(desc)) return null;
  for (const [categoria, regex] of CATEGORIA_REGEX) {
    if (regex.test(desc)) return categoria;
  }
  return null;
}

// ─── extrairGruposPorMes ──────────────────────────────────────────────────────

export interface GrupoDreMes {
  anoMes: string; // "YYYY-MM"
  /**
   * Chaveado pela CATEGORIA canônica (derivada do NOME da linha, não do
   * número — Task S8) → total R$ do mês (negativo = despesa). Quando a
   * mesma categoria aparece em mais de uma linha nível-1 no mesmo mês (ex.:
   * "Serviços de Terceiros" + "Terceiros Eventuais" → ambas "terceiros"),
   * os valores são SOMADOS.
   */
  cats: Partial<Record<CategoriaDre, number>>;
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
export function escolherAbaDre(sheets: SheetGrid[]): SheetGrid | null {
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
export function detectarColunasDeMes(sheet: SheetGrid): { headerRowIdx: number; colunas: { colIdx: number; anoMes: string }[] } {
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
  // rawNumbers:true — usa o valor CRU da célula (cell.v) em vez do texto
  // formatado (cell.w). Corrige DREs com células formatadas em padrão US
  // (".w"=" 599,814.61 "): sem isto, normalizePtBR assume pt-BR e devolve um
  // valor ~1000x menor (Task S7).
  let parsed = parseSpreadsheetToGrid(fileBuffer, fileName, selectedSheet ? [selectedSheet] : undefined, { rawNumbers: true });

  // Arquivos reais de DRE costumam ter 1 aba por mês (JAN26, FEV26...) além
  // da aba "DRE" — isso facilmente passa de MAX_AUTO_SHEETS (5), e
  // parseSpreadsheetToGrid devolve needsSheetSelection=true sem ler nada. O
  // caller (server/routers/orcamento.ts) nunca passa `selectedSheet`, então
  // sem isto o arquivo real nunca seria lido. Resolve a aba "DRE" pelo nome
  // (match exato, case-insensitive) e tenta de novo antes de desistir —
  // mesmo sinal forte de nome já usado em detectDreSheetName (Task S6).
  if (parsed.needsSheetSelection) {
    const abaPorNome = parsed.sheetNames.find(n => n.trim().toUpperCase() === "DRE");
    if (!abaPorNome) return [];
    parsed = parseSpreadsheetToGrid(fileBuffer, fileName, [abaPorNome], { rawNumbers: true });
    if (parsed.needsSheetSelection) return [];
  }

  const sheet = escolherAbaDre(parsed.sheets);
  if (!sheet) return [];

  const { headerRowIdx, colunas } = detectarColunasDeMes(sheet);
  if (headerRowIdx === -1 || colunas.length === 0) return [];

  const porMes: Record<string, Partial<Record<CategoriaDre, number>>> = {};
  for (const col of colunas) porMes[col.anoMes] = {};

  for (let i = headerRowIdx + 1; i < sheet.rows.length; i++) {
    const cells = sheet.rows[i].cells;
    const desc = String(cells[0] ?? "").trim();
    if (!desc) continue;
    const match = desc.match(REGEX_GRUPO_NIVEL1);
    if (!match) continue; // sub-linha (N.M) ou ruído — ignora

    // Task S8: classifica pela CATEGORIA derivada do NOME, nunca pelo
    // número — o número de cada grupo nível-1 difere por template (ver
    // comentário de CATEGORIA_REGEX). Linha derivada (subtotal) ou sem
    // categoria reconhecida → ignora a linha inteira.
    const categoria = classificarCategoriaDre(desc);
    if (!categoria) continue;

    for (const col of colunas) {
      const valor = cellToNumberDre(cells[col.colIdx]);
      if (valor === null) continue;
      const mes = porMes[col.anoMes];
      // SOMA quando a mesma categoria já apareceu noutra linha nível-1 do
      // mesmo mês (ex.: "Serviços de Terceiros" + "Terceiros Eventuais").
      mes[categoria] = (mes[categoria] ?? 0) + valor;
    }
  }

  let todos: GrupoDreMes[] = Object.entries(porMes)
    .map(([anoMes, cats]) => ({ anoMes, cats }))
    .sort((a, b) => a.anoMes.localeCompare(b.anoMes));

  // DRE orçamentário real (ex.: "DRE Ano26") tem coluna pra TODOS os 12
  // meses do ano, mas os meses futuros (ainda sem execução) vêm com todos
  // os grupos zerados — "últimos N meses" tem que pular essa cauda zerada,
  // senão a "foto" devolvida é zero em vez do último histórico real
  // (mesmo princípio do mês-base em extractDreContext). Só corta do FIM pra
  // trás — nunca remove um mês real no meio da série (Task S6).
  while (todos.length > 0 && !temGrupoComDadoReal(todos[todos.length - 1].cats)) {
    todos = todos.slice(0, -1);
  }

  return todos.slice(-meses);
}

/** true quando ALGUMA categoria do mês tem valor ≠ 0 (mês com execução real, não só orçado/zerado). */
function temGrupoComDadoReal(cats: Partial<Record<CategoriaDre, number>>): boolean {
  return Object.values(cats).some(v => v !== 0);
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
 * Categorias de despesa que entram no RESULTADO OPERACIONAL (ver
 * `emAtencao`). `proLabore` fica de fora — igual à referência F360, onde o
 * grupo de pró-labore vem DEPOIS da linha de "Lucro Operacional".
 */
const CATEGORIAS_CUSTO: CategoriaDre[] = [
  "cmv",
  "impostos",
  "franquias",
  "folha",
  "despesasOperacionais",
  "terceiros",
  "ocupacao",
  "financeiras",
  "outras",
];

/**
 * Monta um RASCUNHO de orçamento por média/tendência dos últimos meses,
 * mapeando as CATEGORIAS canônicas da DRE (Task S8 — derivadas do NOME da
 * linha, nunca do número) para os campos de `orcamentos` conforme
 * docs/superpowers/specs/2026-10-27-dre-f360-formato-referencia.md.
 *
 * Decisões de mapeamento (categorias sem sub-linha nível 2 disponível em
 * `GrupoDreMes`, logo impossível separar sem chutar):
 *   - `franquias` (Royalties + Fundo de Promoção) → o total vai inteiro pra
 *     `royaltiesPct`; `fundoMarketingPct` fica `null` (não há base pra saber
 *     quanto é royalty e quanto é fundo).
 *   - `ocupacao` (Aluguel+Condomínio+IPTU+Seguro+Gás+Energia+Água+
 *     Utilidades) → o total vai inteiro pra `aluguel` (maior componente
 *     nomeado); `condominio/energia/gas/agua/outrosOcupacao` ficam `null`.
 *   - `terceiros` (Serviços de Terceiros + Terceiros Eventuais, já SOMADOS
 *     na mesma categoria por `extrairGruposPorMes`) → `outrosServicos`;
 *     `contabilidade`/`sistemas` ficam `null` (sem sub-linha pra separar).
 *   - `despesasOperacionais` + `outras` (buckets genéricos sem campo
 *     dedicado) → somados em `outrasDespesas`; `marketing` fica `null`.
 *   - `financeiras` (dominada por taxas de cartão) → % da receita em
 *     `taxaCartaoPct`; `juros`/`tarifasBancarias` ficam `null`.
 *   - `proLabore` → `proLabore` (R$ médio).
 *   - `redutores` não é lido como campo (fora do escopo desta proposta; só
 *     entra no cálculo de receita líquida pro `emAtencao`). EBITDA é
 *     recalculado pelos componentes, nunca lido pronto de uma linha derivada.
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
    const receita = mes.cats.receitaBruta;
    const temReceita = typeof receita === "number" && receita !== 0;
    if (typeof receita === "number") receitaBrutaPorMes.push(receita);

    if (temReceita && typeof mes.cats.cmv === "number") {
      cmvPctPorMes.push(Math.abs(mes.cats.cmv) / receita);
    }
    if (temReceita && typeof mes.cats.impostos === "number") {
      impostosPctPorMes.push(Math.abs(mes.cats.impostos) / receita);
    }
    if (temReceita && typeof mes.cats.franquias === "number") {
      royaltiesPctPorMes.push(Math.abs(mes.cats.franquias) / receita);
    }
    if (typeof mes.cats.folha === "number") {
      folhaPorMes.push(Math.abs(mes.cats.folha));
    }
    if (typeof mes.cats.terceiros === "number") {
      outrosServicosPorMes.push(Math.abs(mes.cats.terceiros));
    }
    if (typeof mes.cats.despesasOperacionais === "number" || typeof mes.cats.outras === "number") {
      outrasDespesasPorMes.push(Math.abs(mes.cats.despesasOperacionais ?? 0) + Math.abs(mes.cats.outras ?? 0));
    }
    if (typeof mes.cats.ocupacao === "number") {
      aluguelPorMes.push(Math.abs(mes.cats.ocupacao));
    }
    if (temReceita && typeof mes.cats.financeiras === "number") {
      taxaCartaoPctPorMes.push(Math.abs(mes.cats.financeiras) / receita);
    }
    if (typeof mes.cats.proLabore === "number") {
      proLaborePorMes.push(Math.abs(mes.cats.proLabore));
    }
  }

  const receitaBruta = media(receitaBrutaPorMes);
  const cmvPct = media(cmvPctPorMes);
  const folha = media(folhaPorMes);

  // Resultado operacional de CADA mês = Receita Líquida + custos
  // (categorias de CATEGORIAS_CUSTO, que já vêm negativas). Receita Líquida
  // é SEMPRE reconstruída por receitaBruta + redutores — a linha "Receita
  // Líquida" da planilha é DERIVADA (subtotal) e por isso NUNCA entra em
  // `cats` (ver REGEX_DERIVADA): usá-la causaria dupla contagem de receita.
  // Categoria ausente contribui 0 — nunca chuta valor pro faltante. Mês sem
  // NENHUM dado some do resultado (0), um mês "neutro".
  const resultadosOperacionaisPorMes = gruposPorMes.map((mes) => {
    const receitaLiq = (mes.cats.receitaBruta ?? 0) + (mes.cats.redutores ?? 0);
    let soma = receitaLiq;
    for (const categoria of CATEGORIAS_CUSTO) {
      const v = mes.cats[categoria];
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
    fundoMarketingPct: null, // categoria "franquias" agrega royalties+fundo — sem sub-linha, sem split possível
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
