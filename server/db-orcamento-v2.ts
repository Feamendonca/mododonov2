/**
 * db-orcamento-v2.ts
 * Gravação LIMPA do rascunho de orçamento (Task 4, Fase B).
 *
 * Contrato duro: grava SOMENTE as chaves presentes em `campos` — nunca
 * preenche com 0/default o que não veio. Isso é o que garante que
 * "a IA nunca grava sozinha" (a proposta em orcamento-proposta.ts é pura e
 * não grava nada; só esta função grava, e só o que o gerente confirmou).
 *
 * Usa `ON CONFLICT (store_id, periodo_inicio) DO UPDATE SET` — índice único
 * `uq_orcamento_store_periodo` (drizzle/schema.ts). O shim de SQL cru
 * (server/db.ts, rawQuery) NÃO traduz `ON DUPLICATE KEY UPDATE` (MySQL) —
 * em SQL cru aqui é obrigatório usar a sintaxe Postgres diretamente.
 */

import { rawQuery } from "./db";

/**
 * Whitelist explícita das chaves que o rascunho pode gravar → nome real da
 * coluna em `orcamentos` (drizzle/schema.ts). Qualquer chave fora deste mapa é
 * rejeitada ANTES de montar o SQL (nunca vira erro cru do Postgres por coluna
 * inexistente). Cobre os campos de `RascunhoOrcamento` + ticketMedio/diasOperacao
 * (editáveis pelo gerente na tela de confirmação).
 *
 * `folha` (grupo 7 — Colaboradores) é coluna própria e distinta de `pro_labore`
 * (grupo 13). `sanitarismo` e `*_tipo` não entram no rascunho determinístico;
 * campos derivados/não-operacionais (grupos 2/3/12/14/15) também não.
 */
const CAMPO_PARA_COLUNA: Record<string, string> = {
  receitaBruta: "receita_bruta",
  ticketMedio: "ticket_medio",
  diasOperacao: "dias_operacao",
  cmvPct: "cmv_pct",
  impostosPct: "impostos_pct",
  royaltiesPct: "royalties_pct",
  fundoMarketingPct: "fundo_marketing_pct",
  taxaCartaoPct: "taxa_cartao_pct",
  folha: "folha",
  aluguel: "aluguel",
  condominio: "condominio",
  energia: "energia",
  gas: "gas",
  agua: "agua",
  outrosOcupacao: "outros_ocupacao",
  contabilidade: "contabilidade",
  sistemas: "sistemas",
  outrosServicos: "outros_servicos",
  juros: "juros",
  tarifasBancarias: "tarifas_bancarias",
  marketing: "marketing",
  outrasDespesas: "outras_despesas",
  proLabore: "pro_labore",
};

export interface UpsertOrcamentoRascunhoInput {
  storeId: number;
  periodoInicio: string; // YYYY-MM-DD
  /** Somente as chaves presentes aqui são gravadas/atualizadas. */
  campos: Partial<Record<string, number | string | null>>;
}

/**
 * INSERT/UPDATE em `orcamentos` com `status='rascunho'`, gravando SOMENTE as
 * chaves presentes em `campos` (chave ausente não vira 0 nem é tocada no
 * UPDATE; no INSERT, coluna ausente fica NULL — comportamento nativo do
 * Postgres para coluna fora da lista do INSERT).
 */
export async function upsertOrcamentoRascunho(
  input: UpsertOrcamentoRascunhoInput
): Promise<{ id: number }> {
  const chaves = Object.keys(input.campos);

  // Valida TODAS as chaves contra o whitelist ANTES de montar qualquer SQL —
  // chave desconhecida falha claro aqui, nunca vira erro cru do Postgres.
  for (const chave of chaves) {
    if (!(chave in CAMPO_PARA_COLUNA)) {
      throw new Error(`Campo de orçamento desconhecido: ${chave}`);
    }
  }

  const now = Date.now();

  const insertCols = ["store_id", "periodo_inicio", "status", "created_at", "updated_at"];
  const insertPlaceholders = ["?", "?", "'rascunho'", "?", "?"];
  const insertParams: unknown[] = [input.storeId, input.periodoInicio, now, now];

  const setClauses = ["status = 'rascunho'", "updated_at = ?"];
  const setParams: unknown[] = [now];

  for (const chave of chaves) {
    const coluna = CAMPO_PARA_COLUNA[chave];
    insertCols.push(coluna);
    insertPlaceholders.push("?");
    insertParams.push(input.campos[chave] ?? null);

    setClauses.push(`${coluna} = ?`);
    setParams.push(input.campos[chave] ?? null);
  }

  const sql =
    `INSERT INTO orcamentos (${insertCols.join(", ")}) ` +
    `VALUES (${insertPlaceholders.join(", ")}) ` +
    `ON CONFLICT (store_id, periodo_inicio) DO UPDATE SET ${setClauses.join(", ")} ` +
    `RETURNING id`;

  const rows = await rawQuery(sql, [...insertParams, ...setParams]);
  const id = rows[0]?.id as number | undefined;
  if (id === undefined) throw new Error("upsertOrcamentoRascunho: RETURNING id vazio");
  return { id };
}

/**
 * Aprovação (Task 5, Fase B): promove o orçamento de 'rascunho' para
 * 'aprovado', registrando quem aprovou e quando.
 *
 * Contrato duro: NÃO recalcula nem sobrescreve nenhum valor financeiro — só
 * muda `status`/`aprovado_por`/`aprovado_em`. Os valores já foram gravados
 * pelo gerente via `upsertOrcamentoRascunho`. A checagem de papel (quem PODE
 * aprovar) é feita no router (`server/routers/orcamento.ts`), não aqui.
 *
 * Task 6, Fase B: depois de aprovar, a própria UPDATE já retorna
 * `receita_bruta`/`periodo_inicio`/`store_id` (evita um SELECT extra). Se
 * `receita_bruta` não for null, quebra o orçamento mensal em metas diárias
 * uniformes via `gerarMetasDiarias`. Se for null, NÃO gera — orçamento
 * aprovado sem receita definida simplesmente fica sem metas diárias (não
 * quebra o fluxo de aprovação).
 */
export async function aprovarOrcamento(
  orcamentoId: number,
  aprovadoPor: number
): Promise<{ id: number; status: string }> {
  const now = Date.now();
  const rows = await rawQuery(
    `UPDATE orcamentos SET status = 'aprovado', aprovado_por = ?, aprovado_em = ? ` +
      `WHERE id = ? RETURNING id, status, receita_bruta, periodo_inicio, store_id`,
    [aprovadoPor, now, orcamentoId]
  );
  const row = rows[0] as
    | {
        id: number;
        status: string;
        receita_bruta: number | string | null;
        periodo_inicio: string;
        store_id: number;
      }
    | undefined;
  if (!row) {
    throw new Error(`aprovarOrcamento: orçamento ${orcamentoId} não encontrado`);
  }

  if (row.receita_bruta !== null && row.receita_bruta !== undefined) {
    const receitaMensal = Number(row.receita_bruta);
    await gerarMetasDiarias(row.id, row.store_id, row.periodo_inicio, receitaMensal);
  }

  return { id: row.id, status: row.status };
}

/**
 * Quebra de orçamento mensal em metas diárias (Task 6, Fase B) — uniforme
 * por ora (sem ajuste de dia-da-semana/sazonalidade, isso fica pra depois).
 *
 * `metaDia = receitaMensal / diasNoMes`; 1 linha por dia do mês derivado de
 * `periodoInicio` (YYYY-MM-DD), via UPSERT em `orcamento_metas_diarias`
 * (`ON CONFLICT (store_id, data) DO UPDATE SET ... = EXCLUDED....` — único em
 * store_id+data). Retorna o nº de linhas geradas (= diasNoMes).
 */
export async function gerarMetasDiarias(
  orcamentoId: number,
  storeId: number,
  periodoInicio: string,
  receitaMensal: number
): Promise<number> {
  const anoStr = periodoInicio.slice(0, 4);
  const mesStr = periodoInicio.slice(5, 7);
  const ano = Number(anoStr);
  const mes = Number(mesStr); // 1-12

  // new Date(ano, mes, 0) = dia 0 do mês seguinte (mes é índice 0-based do
  // mês seguinte, já que `mes` aqui é 1-based) = último dia do mês atual.
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const metaDia = receitaMensal / diasNoMes;

  const valuesClauses: string[] = [];
  const params: unknown[] = [];
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const diaStr = String(dia).padStart(2, "0");
    const data = `${anoStr}-${mesStr}-${diaStr}`;
    valuesClauses.push("(?, ?, ?, ?, ?)");
    params.push(orcamentoId, storeId, data, metaDia, 1);
  }

  const sql =
    `INSERT INTO orcamento_metas_diarias (orcamento_id, store_id, data, meta_receita, peso_dia) ` +
    `VALUES ${valuesClauses.join(", ")} ` +
    `ON CONFLICT (store_id, data) DO UPDATE SET ` +
    `orcamento_id = EXCLUDED.orcamento_id, meta_receita = EXCLUDED.meta_receita, peso_dia = EXCLUDED.peso_dia`;

  await rawQuery(sql, params);
  return diasNoMes;
}

export interface MetaDiariaRow {
  id: number;
  orcamentoId: number;
  storeId: number;
  data: string;
  metaReceita: number | null;
  metaAtendimentos: number | null;
  pesoDia: number | null;
}

/**
 * Leitura das metas diárias de uma loja/mês (Task 6, Fase B). Sem dados →
 * `[]` (loja sem orçamento aprovado não quebra a tela que consome isso).
 */
export async function getMetasDiarias(storeId: number, anoMes: string): Promise<MetaDiariaRow[]> {
  const rows = await rawQuery(
    `SELECT id, orcamento_id, store_id, data, meta_receita, meta_atendimentos, peso_dia ` +
      `FROM orcamento_metas_diarias WHERE store_id = ? AND data LIKE ? || '%' ORDER BY data`,
    [storeId, anoMes]
  );
  return rows.map((r) => ({
    id: r.id as number,
    orcamentoId: r.orcamento_id as number,
    storeId: r.store_id as number,
    data: r.data as string,
    metaReceita: r.meta_receita != null ? Number(r.meta_receita) : null,
    metaAtendimentos: r.meta_atendimentos != null ? Number(r.meta_atendimentos) : null,
    pesoDia: r.peso_dia != null ? Number(r.peso_dia) : null,
  }));
}
