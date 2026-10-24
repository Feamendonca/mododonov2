import { getDb } from "./db";

export interface Meta {
  id: number;
  lojaId: number;
  mes: number;
  ano: number;
  titulo: string;
  valorMeta: number | null;
  unidade: string;
  descricao: string | null;
  status: "ativa" | "arquivada";
  createdAt: number;
  updatedAt: number;
  medidas?: MedidaDirecao[];
}

export interface MedidaDirecao {
  id: number;
  metaId: number;
  lojaId: number;
  titulo: string;
  descricao: string | null;
  indicador: string;
  metaValor: number | null;
  metaOperador: "gte" | "lte" | "eq";
  unidade: string;
  pesoRemuneracaoPct: number;
  ordem: number;
  ativa: boolean;
  createdAt: number;
  progresso?: MedidaProgresso | null;
}

export interface MedidaProgresso {
  id: number;
  medidaId: number;
  mes: number;
  ano: number;
  valorAtual: number | null;
  atingida: boolean;
  observacao: string | null;
  updatedAt: number;
}

function mapMeta(row: Record<string, unknown>): Meta {
  return {
    id: Number(row.id),
    lojaId: Number(row.loja_id),
    mes: Number(row.mes),
    ano: Number(row.ano),
    titulo: String(row.titulo),
    valorMeta: row.valor_meta != null ? Number(row.valor_meta) : null,
    unidade: String(row.unidade ?? "R$"),
    descricao: row.descricao ? String(row.descricao) : null,
    status: (row.status as "ativa" | "arquivada") ?? "ativa",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapMedida(row: Record<string, unknown>): MedidaDirecao {
  return {
    id: Number(row.id),
    metaId: Number(row.meta_id),
    lojaId: Number(row.loja_id),
    titulo: String(row.titulo),
    descricao: row.descricao ? String(row.descricao) : null,
    indicador: String(row.indicador ?? "custom"),
    metaValor: row.meta_valor != null ? Number(row.meta_valor) : null,
    metaOperador: (row.meta_operador as "gte" | "lte" | "eq") ?? "gte",
    unidade: String(row.unidade ?? "%"),
    pesoRemuneracaoPct: Number(row.peso_remuneracao_pct ?? 0),
    ordem: Number(row.ordem ?? 0),
    ativa: Boolean(row.ativa),
    createdAt: Number(row.created_at),
  };
}

function mapProgresso(row: Record<string, unknown>): MedidaProgresso {
  return {
    id: Number(row.id),
    medidaId: Number(row.medida_id),
    mes: Number(row.mes),
    ano: Number(row.ano),
    valorAtual: row.valor_atual != null ? Number(row.valor_atual) : null,
    atingida: Boolean(row.atingida),
    observacao: row.observacao ? String(row.observacao) : null,
    updatedAt: Number(row.updated_at),
  };
}

async function exec(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

// ─── Metas ────────────────────────────────────────────────────────────────────

export async function listMetas(lojaId: number, mes?: number, ano?: number): Promise<Meta[]> {
  let sql = "SELECT * FROM metas WHERE loja_id = ?";
  const params: unknown[] = [lojaId];
  if (mes !== undefined && ano !== undefined) {
    sql += " AND mes = ? AND ano = ?";
    params.push(mes, ano);
  }
  sql += " ORDER BY ano DESC, mes DESC";
  const rows = await exec(sql, params);
  return rows.map(mapMeta);
}

export async function getMeta(id: number): Promise<Meta | null> {
  const rows = await exec("SELECT * FROM metas WHERE id = ?", [id]);
  return rows.length > 0 ? mapMeta(rows[0]) : null;
}

export async function createMeta(data: {
  lojaId: number;
  mes: number;
  ano: number;
  titulo: string;
  valorMeta?: number | null;
  unidade?: string;
  descricao?: string | null;
}): Promise<number> {
  const now = Date.now();
  const rows = await exec(
    "INSERT INTO metas (loja_id, mes, ano, titulo, valor_meta, unidade, descricao, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'ativa',?,?)",
    [data.lojaId, data.mes, data.ano, data.titulo, data.valorMeta ?? null, data.unidade ?? "R$", data.descricao ?? null, now, now]
  );
  return Number((rows as any).insertId);
}

export async function updateMeta(id: number, data: {
  titulo?: string;
  valorMeta?: number | null;
  unidade?: string;
  descricao?: string | null;
  status?: "ativa" | "arquivada";
}): Promise<void> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if (data.titulo !== undefined) { sets.push("titulo = ?"); params.push(data.titulo); }
  if (data.valorMeta !== undefined) { sets.push("valor_meta = ?"); params.push(data.valorMeta); }
  if (data.unidade !== undefined) { sets.push("unidade = ?"); params.push(data.unidade); }
  if (data.descricao !== undefined) { sets.push("descricao = ?"); params.push(data.descricao); }
  if (data.status !== undefined) { sets.push("status = ?"); params.push(data.status); }
  params.push(id);
  await exec(`UPDATE metas SET ${sets.join(", ")} WHERE id = ?`, params);
}

// ─── Medidas de Direção ───────────────────────────────────────────────────────

export async function listMedidas(metaId: number, mes?: number, ano?: number): Promise<MedidaDirecao[]> {
  const rows = await exec(
    "SELECT * FROM medidas_direcao WHERE meta_id = ? AND ativa = 1 ORDER BY ordem ASC",
    [metaId]
  );
  const medidas = rows.map(mapMedida);

  if (mes !== undefined && ano !== undefined) {
    const ids = medidas.map((m) => m.id);
    if (ids.length > 0) {
      const progressoRows = await exec(
        `SELECT * FROM medidas_progresso WHERE medida_id IN (${ids.map(() => "?").join(",")}) AND mes = ? AND ano = ?`,
        [...ids, mes, ano]
      );
      const progressoMap = new Map(progressoRows.map((r) => [Number(r.medida_id), mapProgresso(r)]));
      medidas.forEach((m) => { m.progresso = progressoMap.get(m.id) ?? null; });
    }
  }
  return medidas;
}

export async function createMedida(data: {
  metaId: number;
  lojaId: number;
  titulo: string;
  descricao?: string | null;
  indicador?: string;
  metaValor?: number | null;
  metaOperador?: "gte" | "lte" | "eq";
  unidade?: string;
  pesoRemuneracaoPct?: number;
  ordem?: number;
}): Promise<number> {
  const now = Date.now();
  const rows = await exec(
    "INSERT INTO medidas_direcao (meta_id, loja_id, titulo, descricao, indicador, meta_valor, meta_operador, unidade, peso_remuneracao_pct, ordem, ativa, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)",
    [data.metaId, data.lojaId, data.titulo, data.descricao ?? null, data.indicador ?? "custom", data.metaValor ?? null, data.metaOperador ?? "gte", data.unidade ?? "%", data.pesoRemuneracaoPct ?? 0, data.ordem ?? 0, now]
  );
  return Number((rows as any).insertId);
}

export async function updateMedida(id: number, data: {
  titulo?: string;
  descricao?: string | null;
  indicador?: string;
  metaValor?: number | null;
  metaOperador?: "gte" | "lte" | "eq";
  unidade?: string;
  pesoRemuneracaoPct?: number;
  ordem?: number;
  ativa?: boolean;
}): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.titulo !== undefined) { sets.push("titulo = ?"); params.push(data.titulo); }
  if (data.descricao !== undefined) { sets.push("descricao = ?"); params.push(data.descricao); }
  if (data.indicador !== undefined) { sets.push("indicador = ?"); params.push(data.indicador); }
  if (data.metaValor !== undefined) { sets.push("meta_valor = ?"); params.push(data.metaValor); }
  if (data.metaOperador !== undefined) { sets.push("meta_operador = ?"); params.push(data.metaOperador); }
  if (data.unidade !== undefined) { sets.push("unidade = ?"); params.push(data.unidade); }
  if (data.pesoRemuneracaoPct !== undefined) { sets.push("peso_remuneracao_pct = ?"); params.push(data.pesoRemuneracaoPct); }
  if (data.ordem !== undefined) { sets.push("ordem = ?"); params.push(data.ordem); }
  if (data.ativa !== undefined) { sets.push("ativa = ?"); params.push(data.ativa ? 1 : 0); }
  if (sets.length === 0) return;
  params.push(id);
  await exec(`UPDATE medidas_direcao SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteMedida(id: number): Promise<void> {
  await exec("UPDATE medidas_direcao SET ativa = 0 WHERE id = ?", [id]);
}

export async function upsertProgresso(data: {
  medidaId: number;
  mes: number;
  ano: number;
  valorAtual: number | null;
  atingida: boolean;
  observacao?: string | null;
}): Promise<void> {
  const now = Date.now();
  await exec(
    `INSERT INTO medidas_progresso (medida_id, mes, ano, valor_atual, atingida, observacao, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (medida_id, mes, ano) DO UPDATE SET valor_atual=VALUES(valor_atual), atingida=VALUES(atingida), observacao=VALUES(observacao), updated_at=VALUES(updated_at)`,
    [data.medidaId, data.mes, data.ano, data.valorAtual, data.atingida ? 1 : 0, data.observacao ?? null, now]
  );
}
