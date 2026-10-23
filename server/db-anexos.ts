import { getDb } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlanoAcaoAnexo {
  id: number;
  acaoId: number;
  lojaId: number;
  nome: string;
  fileKey: string;
  url: string;
  mimeType: string;
  tamanho: number;
  criadoPor: string;
  criadoEm: number;
}

// ─── Internal helper ──────────────────────────────────────────────────────────
async function exec(sql: string, params: unknown[] = []) {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

function rowToAnexo(row: Record<string, unknown>): PlanoAcaoAnexo {
  return {
    id: row.id as number,
    acaoId: row.acao_id as number,
    lojaId: row.loja_id as number,
    nome: row.nome as string,
    fileKey: row.file_key as string,
    url: row.url as string,
    mimeType: (row.mime_type as string) ?? "application/octet-stream",
    tamanho: Number(row.tamanho ?? 0),
    criadoPor: (row.criado_por as string) ?? "",
    criadoEm: Number(row.criado_em),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listAnexos(acaoId: number): Promise<PlanoAcaoAnexo[]> {
  const rows = await exec(
    `SELECT * FROM plano_acao_anexos WHERE acao_id = ? ORDER BY criado_em ASC`,
    [acaoId],
  );
  return rows.map(rowToAnexo);
}

export async function createAnexo(input: {
  acaoId: number;
  lojaId: number;
  nome: string;
  fileKey: string;
  url: string;
  mimeType: string;
  tamanho: number;
  criadoPor: string;
}): Promise<number> {
  const now = Date.now();
  const rows = await exec(
    `INSERT INTO plano_acao_anexos (acao_id, loja_id, nome, file_key, url, mime_type, tamanho, criado_por, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.acaoId,
      input.lojaId,
      input.nome,
      input.fileKey,
      input.url,
      input.mimeType,
      input.tamanho,
      input.criadoPor,
      now,
    ],
  );
  return (rows as any).insertId as number;
}

export async function deleteAnexo(id: number): Promise<void> {
  await exec(`DELETE FROM plano_acao_anexos WHERE id = ?`, [id]);
}

export async function getAnexoById(id: number): Promise<PlanoAcaoAnexo | null> {
  const rows = await exec(`SELECT * FROM plano_acao_anexos WHERE id = ?`, [id]);
  if (!rows.length) return null;
  return rowToAnexo(rows[0]);
}
