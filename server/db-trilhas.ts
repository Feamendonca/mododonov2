import { getDb } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrilhaStatus = "rascunho" | "publicada" | "arquivada";
export type AulaStatus = "rascunho" | "publicada";
export type ProgressoStatus = "nao_iniciada" | "em_andamento" | "concluida";

export interface QuizQuestao {
  pergunta: string;
  opcoes: string[];
  correta: number;
  explicacao?: string;
}

export interface ConteudoBloco {
  tipo: "texto" | "tabela" | "destaque" | "lista" | "caso";
  titulo?: string;
  conteudo?: string;
  colunas?: string[];
  linhas?: string[][];
}

export interface Trilha {
  id: number;
  slug: string;
  titulo: string;
  descricao: string | null;
  publico: "gestor" | "admin" | "todos";
  status: TrilhaStatus;
  ordem: number;
  created_at: number;
  updated_at: number;
}

export interface TrilhaModulo {
  id: number;
  trilha_id: number;
  titulo: string;
  descricao: string | null;
  ordem: number;
  mes_label: string | null;
  created_at: number;
}

export interface TrilhaAula {
  id: number;
  modulo_id: number;
  trilha_id: number;
  numero_semana: number | null;
  titulo: string;
  subtitulo: string | null;
  objetivo: string | null;
  por_que: string | null;
  duracao_min: number;
  conteudo: ConteudoBloco[] | null;
  quiz: QuizQuestao[] | null;
  indicador_foco: string | null;
  compromisso_texto: string | null;
  material_apoio: string[] | null;
  nota_facilitador: string | null;
  status: AulaStatus;
  ordem: number;
  created_at: number;
  updated_at: number;
}

export interface TrilhaProgresso {
  id: number;
  user_id: number;
  store_id: number;
  aula_id: number;
  trilha_id: number;
  status: ProgressoStatus;
  iniciada_em: number | null;
  concluida_em: number | null;
}

export interface TrilhaCompromisso {
  id: number;
  user_id: number;
  store_id: number;
  aula_id: number;
  trilha_id: number;
  feito: boolean;
  resultado: string | null;
  resultado_numerico: number | null;
  registrado_em: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(val: unknown): T | null {
  if (!val) return null;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return val as T;
}

// ─── Trilhas ──────────────────────────────────────────────────────────────────

export async function listTrilhas(onlyPublished = true): Promise<Trilha[]> {
  const db = await getDb();
  const where = onlyPublished ? "WHERE status = 'publicada'" : "";
  const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM trilhas ${where} ORDER BY ordem ASC`);
  return rows as Trilha[];
}

export async function getTrilha(id: number): Promise<Trilha | null> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute("SELECT * FROM trilhas WHERE id = ?", [id]) as [Trilha[], unknown];
  return rows[0] ?? null;
}

export async function getTrilhaBySlug(slug: string): Promise<Trilha | null> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute("SELECT * FROM trilhas WHERE slug = ?", [slug]) as [Trilha[], unknown];
  return rows[0] ?? null;
}

export async function createTrilha(data: {
  slug: string;
  titulo: string;
  descricao?: string;
  publico?: "gestor" | "admin" | "todos";
  status?: TrilhaStatus;
  ordem?: number;
}): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO trilhas (slug, titulo, descricao, publico, status, ordem, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.slug, data.titulo, data.descricao ?? null, data.publico ?? "gestor",
     data.status ?? "rascunho", data.ordem ?? 0, now, now]
  ) as [{ insertId: number }, unknown];
  return result.insertId;
}

export async function updateTrilha(id: number, data: Partial<{
  titulo: string;
  descricao: string;
  publico: "gestor" | "admin" | "todos";
  status: TrilhaStatus;
  ordem: number;
}>): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.titulo !== undefined) { fields.push("titulo = ?"); values.push(data.titulo); }
  if (data.descricao !== undefined) { fields.push("descricao = ?"); values.push(data.descricao); }
  if (data.publico !== undefined) { fields.push("publico = ?"); values.push(data.publico); }
  if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status); }
  if (data.ordem !== undefined) { fields.push("ordem = ?"); values.push(data.ordem); }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(Date.now(), id);
  await (db as any).$client.promise().execute(`UPDATE trilhas SET ${fields.join(", ")} WHERE id = ?`, values);
}

// ─── Módulos ──────────────────────────────────────────────────────────────────

export async function listModulos(trilhaId: number): Promise<TrilhaModulo[]> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM trilha_modulos WHERE trilha_id = ? ORDER BY ordem ASC",
    [trilhaId]
  );
  return rows as TrilhaModulo[];
}

export async function createModulo(data: {
  trilha_id: number;
  titulo: string;
  descricao?: string;
  ordem?: number;
  mes_label?: string;
}): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO trilha_modulos (trilha_id, titulo, descricao, ordem, mes_label, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.trilha_id, data.titulo, data.descricao ?? null, data.ordem ?? 0, data.mes_label ?? null, now]
  ) as [{ insertId: number }, unknown];
  return result.insertId;
}

// ─── Aulas ────────────────────────────────────────────────────────────────────

export async function listAulas(moduloId: number, onlyPublished = true): Promise<TrilhaAula[]> {
  const db = await getDb();
  const statusClause = onlyPublished ? "AND status = 'publicada'" : "";
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM trilha_aulas WHERE modulo_id = ? ${statusClause} ORDER BY ordem ASC`,
    [moduloId]
  );
  return (rows as TrilhaAula[]).map(r => ({
    ...r,
    conteudo: parseJson<ConteudoBloco[]>(r.conteudo),
    quiz: parseJson<QuizQuestao[]>(r.quiz),
    material_apoio: parseJson<string[]>(r.material_apoio),
  }));
}

export async function listAulasByTrilha(trilhaId: number, onlyPublished = true): Promise<TrilhaAula[]> {
  const db = await getDb();
  const statusClause = onlyPublished ? "AND status = 'publicada'" : "";
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM trilha_aulas WHERE trilha_id = ? ${statusClause} ORDER BY ordem ASC`,
    [trilhaId]
  );
  return (rows as TrilhaAula[]).map(r => ({
    ...r,
    conteudo: parseJson<ConteudoBloco[]>(r.conteudo),
    quiz: parseJson<QuizQuestao[]>(r.quiz),
    material_apoio: parseJson<string[]>(r.material_apoio),
  }));
}

export async function getAula(id: number): Promise<TrilhaAula | null> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute("SELECT * FROM trilha_aulas WHERE id = ?", [id]) as [TrilhaAula[], unknown];
  if (!rows[0]) return null;
  return {
    ...rows[0],
    conteudo: parseJson<ConteudoBloco[]>(rows[0].conteudo),
    quiz: parseJson<QuizQuestao[]>(rows[0].quiz),
    material_apoio: parseJson<string[]>(rows[0].material_apoio),
  };
}

export async function createAula(data: {
  modulo_id: number;
  trilha_id: number;
  numero_semana?: number;
  titulo: string;
  subtitulo?: string;
  objetivo?: string;
  por_que?: string;
  duracao_min?: number;
  conteudo?: ConteudoBloco[];
  indicador_foco?: string;
  compromisso_texto?: string;
  material_apoio?: string[];
  nota_facilitador?: string;
  status?: AulaStatus;
  ordem?: number;
}): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO trilha_aulas
     (modulo_id, trilha_id, numero_semana, titulo, subtitulo, objetivo, por_que, duracao_min,
      conteudo, indicador_foco, compromisso_texto, material_apoio, nota_facilitador, status, ordem, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.modulo_id, data.trilha_id, data.numero_semana ?? null,
      data.titulo, data.subtitulo ?? null, data.objetivo ?? null, data.por_que ?? null,
      data.duracao_min ?? 30,
      data.conteudo ? JSON.stringify(data.conteudo) : null,
      data.indicador_foco ?? null, data.compromisso_texto ?? null,
      data.material_apoio ? JSON.stringify(data.material_apoio) : null,
      data.nota_facilitador ?? null,
      data.status ?? "rascunho", data.ordem ?? 0, now, now,
    ]
  ) as [{ insertId: number }, unknown];
  return result.insertId;
}

export async function updateAula(id: number, data: Partial<{
  titulo: string;
  subtitulo: string;
  objetivo: string;
  por_que: string;
  duracao_min: number;
  conteudo: ConteudoBloco[];
  indicador_foco: string;
  compromisso_texto: string;
  material_apoio: string[];
  nota_facilitador: string;
  status: AulaStatus;
  ordem: number;
}>): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.titulo !== undefined) { fields.push("titulo = ?"); values.push(data.titulo); }
  if (data.subtitulo !== undefined) { fields.push("subtitulo = ?"); values.push(data.subtitulo); }
  if (data.objetivo !== undefined) { fields.push("objetivo = ?"); values.push(data.objetivo); }
  if (data.por_que !== undefined) { fields.push("por_que = ?"); values.push(data.por_que); }
  if (data.duracao_min !== undefined) { fields.push("duracao_min = ?"); values.push(data.duracao_min); }
  if (data.conteudo !== undefined) { fields.push("conteudo = ?"); values.push(JSON.stringify(data.conteudo)); }
  if (data.indicador_foco !== undefined) { fields.push("indicador_foco = ?"); values.push(data.indicador_foco); }
  if (data.compromisso_texto !== undefined) { fields.push("compromisso_texto = ?"); values.push(data.compromisso_texto); }
  if (data.material_apoio !== undefined) { fields.push("material_apoio = ?"); values.push(JSON.stringify(data.material_apoio)); }
  if (data.nota_facilitador !== undefined) { fields.push("nota_facilitador = ?"); values.push(data.nota_facilitador); }
  if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status); }
  if (data.ordem !== undefined) { fields.push("ordem = ?"); values.push(data.ordem); }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(Date.now(), id);
  await (db as any).$client.promise().execute(`UPDATE trilha_aulas SET ${fields.join(", ")} WHERE id = ?`, values);
}

// ─── Progresso ────────────────────────────────────────────────────────────────

export async function getProgresso(userId: number, trilhaId: number): Promise<TrilhaProgresso[]> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM trilha_progresso WHERE user_id = ? AND trilha_id = ?",
    [userId, trilhaId]
  );
  return rows as TrilhaProgresso[];
}

export async function getProgressoAula(userId: number, aulaId: number): Promise<TrilhaProgresso | null> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM trilha_progresso WHERE user_id = ? AND aula_id = ?",
    [userId, aulaId]
  ) as [TrilhaProgresso[], unknown];
  return rows[0] ?? null;
}

export async function upsertProgresso(data: {
  user_id: number;
  store_id: number;
  aula_id: number;
  trilha_id: number;
  status: ProgressoStatus;
  pontuacao_quiz?: number;
  total_questoes?: number;
}): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const iniciada_em = data.status === "em_andamento" ? now : null;
  const concluida_em = data.status === "concluida" ? now : null;
  await (db as any).$client.promise().execute(
    `INSERT INTO trilha_progresso (user_id, store_id, aula_id, trilha_id, status, iniciada_em, concluida_em, pontuacao_quiz, total_questoes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       iniciada_em = COALESCE(iniciada_em, VALUES(iniciada_em)),
       concluida_em = COALESCE(VALUES(concluida_em), concluida_em),
       pontuacao_quiz = COALESCE(VALUES(pontuacao_quiz), pontuacao_quiz),
       total_questoes = COALESCE(VALUES(total_questoes), total_questoes)`,
    [data.user_id, data.store_id, data.aula_id, data.trilha_id, data.status, iniciada_em, concluida_em,
     data.pontuacao_quiz ?? null, data.total_questoes ?? null]
  );
}

// ─── Compromissos ─────────────────────────────────────────────────────────────

export async function getCompromisso(userId: number, aulaId: number): Promise<TrilhaCompromisso | null> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM trilha_compromissos WHERE user_id = ? AND aula_id = ?",
    [userId, aulaId]
  ) as [TrilhaCompromisso[], unknown];
  if (!rows[0]) return null;
  return { ...rows[0], feito: Boolean(rows[0].feito) };
}

export async function upsertCompromisso(data: {
  user_id: number;
  store_id: number;
  aula_id: number;
  trilha_id: number;
  feito: boolean;
  resultado?: string;
  resultado_numerico?: number;
}): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await (db as any).$client.promise().execute(
    `INSERT INTO trilha_compromissos (user_id, store_id, aula_id, trilha_id, feito, resultado, resultado_numerico, registrado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       feito = VALUES(feito),
       resultado = VALUES(resultado),
       resultado_numerico = VALUES(resultado_numerico),
       registrado_em = VALUES(registrado_em)`,
    [data.user_id, data.store_id, data.aula_id, data.trilha_id,
     data.feito ? 1 : 0, data.resultado ?? null, data.resultado_numerico ?? null, now]
  );
}

export async function listCompromissosPendentes(userId: number): Promise<Array<{
  aula_id: number;
  aula_titulo: string;
  trilha_titulo: string;
  numero_semana: number | null;
  compromisso_texto: string | null;
}>> {
  const db = await getDb();
  // Aulas concluídas mas sem compromisso registrado (ou feito=0)
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT a.id as aula_id, a.titulo as aula_titulo, t.titulo as trilha_titulo,
            a.numero_semana, a.compromisso_texto
     FROM trilha_progresso p
     JOIN trilha_aulas a ON a.id = p.aula_id
     JOIN trilhas t ON t.id = p.trilha_id
     LEFT JOIN trilha_compromissos c ON c.user_id = p.user_id AND c.aula_id = p.aula_id
     WHERE p.user_id = ? AND p.status = 'concluida'
       AND a.compromisso_texto IS NOT NULL
       AND (c.id IS NULL OR c.feito = 0)
     ORDER BY a.numero_semana ASC`,
    [userId]
  );
  return rows as Array<{
    aula_id: number;
    aula_titulo: string;
    trilha_titulo: string;
    numero_semana: number | null;
    compromisso_texto: string | null;
  }>;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getTrilhaStats(userId: number, trilhaId: number): Promise<{
  totalAulas: number;
  concluidas: number;
  emAndamento: number;
  compromissosPendentes: number;
  percentual: number;
}> {
  const db = await getDb();
  const [aulaRows] = await (db as any).$client.promise().execute(
    "SELECT COUNT(*) as total FROM trilha_aulas WHERE trilha_id = ? AND status = 'publicada'",
    [trilhaId]
  ) as [Array<{ total: number }>, unknown];
  const total = aulaRows[0]?.total ?? 0;

  const [progRows] = await (db as any).$client.promise().execute(
    `SELECT status, COUNT(*) as cnt FROM trilha_progresso
     WHERE user_id = ? AND trilha_id = ? GROUP BY status`,
    [userId, trilhaId]
  ) as [Array<{ status: string; cnt: number }>, unknown];

  let concluidas = 0;
  let emAndamento = 0;
  for (const r of progRows) {
    if (r.status === "concluida") concluidas = r.cnt;
    if (r.status === "em_andamento") emAndamento = r.cnt;
  }

  const [compRows] = await (db as any).$client.promise().execute(
    `SELECT COUNT(*) as cnt FROM trilha_aulas a
     JOIN trilha_progresso p ON p.aula_id = a.id AND p.user_id = ? AND p.status = 'concluida'
     LEFT JOIN trilha_compromissos c ON c.aula_id = a.id AND c.user_id = ?
     WHERE a.trilha_id = ? AND a.compromisso_texto IS NOT NULL AND (c.id IS NULL OR c.feito = 0)`,
    [userId, userId, trilhaId]
  ) as [Array<{ cnt: number }>, unknown];
  const compromissosPendentes = compRows[0]?.cnt ?? 0;

  return {
    totalAulas: total,
    concluidas,
    emAndamento,
    compromissosPendentes,
    percentual: total > 0 ? Math.round((concluidas / total) * 100) : 0,
  };
}


/** Retorna o percentual de aulas concluídas pela equipe de uma loja específica.
 * Fonte viva: trilha_progresso (gravada pelo trilhasRouter / TrilhasPage).
 * Normalização: aulas concluídas / total de aulas publicadas em trilhas publicadas.
 * Retorna 0 se não houver aulas publicadas ou nenhum progresso registrado.
 */
export async function getTrailProgressByStore(storeId: number): Promise<{
  concluidas: number;
  total: number;
  percentual: number;
}> {
  const db = await getDb();
  const [[row]] = await (db as any).$client.promise().execute(
    `SELECT
       SUM(CASE WHEN p.status = 'concluida' AND p.store_id = ? THEN 1 ELSE 0 END) as concluidas,
       COUNT(DISTINCT a.id) as total
     FROM trilha_aulas a
     JOIN trilhas t ON t.id = a.trilha_id AND t.status = 'publicada'
     WHERE a.status = 'publicada'`,
    [storeId]
  ) as [[{ concluidas: number; total: number }], unknown];
  const concluidas = Number(row?.concluidas ?? 0);
  const total = Number(row?.total ?? 0);
  return {
    concluidas,
    total,
    percentual: total > 0 ? Math.round((concluidas / total) * 100) : 0,
  };
}
export async function getNetworkTrilhaStats(): Promise<Array<{
  store_id: number;
  concluidas: number;
  total: number;
  percentual: number;
}>> {
  const db = await getDb();
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT p.store_id,
            SUM(CASE WHEN p.status = 'concluida' THEN 1 ELSE 0 END) as concluidas,
            COUNT(DISTINCT a.id) as total
     FROM trilha_aulas a
     JOIN trilhas t ON t.id = a.trilha_id AND t.status = 'publicada'
     LEFT JOIN trilha_progresso p ON p.aula_id = a.id AND a.status = 'publicada'
     WHERE a.status = 'publicada'
     GROUP BY p.store_id`
  ) as [Array<{ store_id: number; concluidas: number; total: number }>, unknown];
  return rows.map(r => ({
    ...r,
    percentual: r.total > 0 ? Math.round((r.concluidas / r.total) * 100) : 0,
  }));
}
