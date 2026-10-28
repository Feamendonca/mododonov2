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
 */
export async function aprovarOrcamento(
  orcamentoId: number,
  aprovadoPor: number
): Promise<{ id: number; status: string }> {
  const now = Date.now();
  const rows = await rawQuery(
    `UPDATE orcamentos SET status = 'aprovado', aprovado_por = ?, aprovado_em = ? ` +
      `WHERE id = ? RETURNING id, status`,
    [aprovadoPor, now, orcamentoId]
  );
  const row = rows[0] as { id: number; status: string } | undefined;
  if (!row) {
    throw new Error(`aprovarOrcamento: orçamento ${orcamentoId} não encontrado`);
  }
  return { id: row.id, status: row.status };
}
