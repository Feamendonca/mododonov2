import { getDb } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TipoManutencao = "preventiva" | "corretiva";
export type StatusManutencao = "aberta" | "em_andamento" | "concluida" | "cancelada";
export type PrioridadeManutencao = "baixa" | "media" | "alta" | "urgente";

export interface Manutencao {
  id: number;
  lojaId: number;
  tipo: TipoManutencao;
  status: StatusManutencao;
  titulo: string;
  descricao: string | null;
  localEquipamento: string | null;
  prioridade: PrioridadeManutencao;
  custo: number;
  fornecedor: string | null;
  dataAbertura: number;
  dataPrevista: number | null;
  dataConclusao: number | null;
  executadoPor: string | null;
  descritivoExecucao: string | null;
  criadoPor: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateManutencaoInput {
  lojaId: number;
  tipo: TipoManutencao;
  titulo: string;
  descricao?: string | null;
  localEquipamento?: string | null;
  prioridade: PrioridadeManutencao;
  custo?: number;
  fornecedor?: string | null;
  dataAbertura: number;
  dataPrevista?: number | null;
  criadoPor?: string | null;
}

export interface UpdateManutencaoInput {
  id: number;
  tipo?: TipoManutencao;
  status?: StatusManutencao;
  titulo?: string;
  descricao?: string | null;
  localEquipamento?: string | null;
  prioridade?: PrioridadeManutencao;
  custo?: number;
  fornecedor?: string | null;
  dataPrevista?: number | null;
  dataConclusao?: number | null;
  executadoPor?: string | null;
  descritivoExecucao?: string | null;
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function exec(sql: string, params: unknown[] = []) {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

function rowToManutencao(row: Record<string, unknown>): Manutencao {
  return {
    id: row.id as number,
    lojaId: row.loja_id as number,
    tipo: row.tipo as TipoManutencao,
    status: row.status as StatusManutencao,
    titulo: row.titulo as string,
    descricao: (row.descricao as string) ?? null,
    localEquipamento: (row.local_equipamento as string) ?? null,
    prioridade: row.prioridade as PrioridadeManutencao,
    custo: parseFloat(String(row.custo ?? "0")),
    fornecedor: (row.fornecedor as string) ?? null,
    dataAbertura: Number(row.data_abertura),
    dataPrevista: row.data_prevista != null ? Number(row.data_prevista) : null,
    dataConclusao: row.data_conclusao != null ? Number(row.data_conclusao) : null,
    executadoPor: (row.executado_por as string) ?? null,
    descritivoExecucao: (row.descritivo_execucao as string) ?? null,
    criadoPor: (row.criado_por as string) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listManutencoes(
  lojaId: number,
  opts?: { tipo?: TipoManutencao; status?: StatusManutencao; limit?: number }
): Promise<Manutencao[]> {
  let sql = "SELECT * FROM manutencoes WHERE loja_id = ?";
  const params: unknown[] = [lojaId];
  if (opts?.tipo) { sql += " AND tipo = ?"; params.push(opts.tipo); }
  if (opts?.status) { sql += " AND status = ?"; params.push(opts.status); }
  sql += " ORDER BY data_abertura DESC LIMIT ?";
  params.push(opts?.limit ?? 100);
  const rows = await exec(sql, params);
  return rows.map(rowToManutencao);
}

export async function getManutencaoById(id: number): Promise<Manutencao | null> {
  const rows = await exec("SELECT * FROM manutencoes WHERE id = ?", [id]);
  return rows.length > 0 ? rowToManutencao(rows[0]) : null;
}

export async function createManutencao(input: CreateManutencaoInput): Promise<number> {
  const now = Date.now();
  const db = await getDb();
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO manutencoes
      (loja_id, tipo, status, titulo, descricao, local_equipamento, prioridade,
       custo, fornecedor, data_abertura, data_prevista, criado_por, created_at, updated_at)
     VALUES (?, ?, 'aberta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.lojaId, input.tipo, input.titulo,
      input.descricao ?? null, input.localEquipamento ?? null,
      input.prioridade, input.custo ?? 0, input.fornecedor ?? null,
      input.dataAbertura, input.dataPrevista ?? null,
      input.criadoPor ?? null, now, now,
    ]
  );
  return (result as any).insertId;
}

export async function updateManutencao(input: UpdateManutencaoInput): Promise<void> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (input.tipo !== undefined) { sets.push("tipo = ?"); params.push(input.tipo); }
  if (input.status !== undefined) { sets.push("status = ?"); params.push(input.status); }
  if (input.titulo !== undefined) { sets.push("titulo = ?"); params.push(input.titulo); }
  if (input.descricao !== undefined) { sets.push("descricao = ?"); params.push(input.descricao); }
  if (input.localEquipamento !== undefined) { sets.push("local_equipamento = ?"); params.push(input.localEquipamento); }
  if (input.prioridade !== undefined) { sets.push("prioridade = ?"); params.push(input.prioridade); }
  if (input.custo !== undefined) { sets.push("custo = ?"); params.push(input.custo); }
  if (input.fornecedor !== undefined) { sets.push("fornecedor = ?"); params.push(input.fornecedor); }
  if (input.dataPrevista !== undefined) { sets.push("data_prevista = ?"); params.push(input.dataPrevista); }
  if (input.dataConclusao !== undefined) { sets.push("data_conclusao = ?"); params.push(input.dataConclusao); }
  if (input.executadoPor !== undefined) { sets.push("executado_por = ?"); params.push(input.executadoPor); }
  if (input.descritivoExecucao !== undefined) { sets.push("descritivo_execucao = ?"); params.push(input.descritivoExecucao); }

  params.push(input.id);
  await exec(`UPDATE manutencoes SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteManutencao(id: number): Promise<void> {
  await exec("DELETE FROM manutencoes WHERE id = ?", [id]);
}

export async function getResumoManutencoes(lojaId: number): Promise<{
  totalAberta: number;
  totalEmAndamento: number;
  totalConcluida: number;
  custoTotal: number;
  custoMesAtual: number;
}> {
  const rows = await exec(
    `SELECT
      SUM(status = 'aberta') as total_aberta,
      SUM(status = 'em_andamento') as total_em_andamento,
      SUM(status = 'concluida') as total_concluida,
      SUM(custo) as custo_total,
      SUM(CASE WHEN FROM_UNIXTIME(data_abertura/1000, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN custo ELSE 0 END) as custo_mes
     FROM manutencoes WHERE loja_id = ?`,
    [lojaId]
  );
  const r = rows[0] ?? {};
  return {
    totalAberta: Number(r.total_aberta ?? 0),
    totalEmAndamento: Number(r.total_em_andamento ?? 0),
    totalConcluida: Number(r.total_concluida ?? 0),
    custoTotal: parseFloat(String(r.custo_total ?? "0")),
    custoMesAtual: parseFloat(String(r.custo_mes ?? "0")),
  };
}
