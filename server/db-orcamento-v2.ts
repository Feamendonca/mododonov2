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

/** "receitaBruta" → "receita_bruta". Mapeia 1:1 para os nomes de coluna
 * snake_case de `orcamentos` (drizzle/schema.ts) — todas as colunas de
 * campos de orçamento seguem essa convenção. */
function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

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
  const now = Date.now();

  const insertCols = ["store_id", "periodo_inicio", "status", "created_at", "updated_at"];
  const insertPlaceholders = ["?", "?", "'rascunho'", "?", "?"];
  const insertParams: unknown[] = [input.storeId, input.periodoInicio, now, now];

  const setClauses = ["status = 'rascunho'", "updated_at = ?"];
  const setParams: unknown[] = [now];

  for (const chave of chaves) {
    const coluna = camelToSnake(chave);
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
