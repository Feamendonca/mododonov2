import { getDb } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Review = {
  id: number;
  storeId: number;
  platform: "google" | "tripadvisor" | "ifood" | "manual";
  stars: number;
  clientName: string | null;
  text: string | null;
  originalLink: string | null;
  category: string | null;
  wentToTable: boolean;
  wentToTableAt: Date | null;
  replied: boolean;
  repliedAt: Date | null;
  replyText: string | null;
  actionTaken: string | null;
  linkedActionId: number | null;
  linkedEmployeeId: number | null;
  publishedToCouncil: boolean;
  councilCaseId: number | null;
  tags: string[] | null;
  status: "registrada" | "em-acao" | "respondida" | "fechada" | "ignorada";
  reviewDate: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceStandard = {
  id: number;
  storeId: number | null;
  layer: "base" | "marca" | "loja" | "franqueadora";
  brand: string | null;
  category: "entrada" | "mesa" | "pedido" | "cozinha" | "saida" | "pos-atendimento" | "digital";
  text: string;
  whyText: string | null;
  positiveExample: string | null;
  negativeExample: string | null;
  appliesTo: string[] | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StandardObservation = {
  id: number;
  storeId: number;
  employeeId: number;
  standardId: number | null;
  observationDate: string;
  type: "positivo" | "a-melhorar" | "neutro";
  text: string;
  author: "gestor" | "supervisor" | "lider";
  createdAt: Date;
};

export type TrainingSession = {
  id: number;
  storeId: number;
  sessionDate: string;
  theme: string;
  linkedStandardId: number | null;
  contentLink: string | null;
  contentText: string | null;
  participants: number[] | null;
  status: "planejada" | "realizada" | "cancelada" | "remarcada";
  notes: string | null;
  weekCaseId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CouncilCase = {
  id: number;
  storeId: number;
  authorUserId: number;
  caseDate: string;
  title: string;
  category: "situacao-dificil" | "inspiracao" | "duvida" | "aprendizado" | "outros";
  text: string;
  learning: string | null;
  linkedReviewId: number | null;
  employeeName: string | null;
  shared: boolean;
  passedByStores: number[] | null;
  tookToTeamStores: number[] | null;
  status: "em-discussao" | "encerrado" | "consolidado";
  consolidatedStandardId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExperienceSuggestion = {
  id: string;
  type: "warning" | "alert" | "info";
  title: string;
  description: string;
  category: "experiencia" | "pessoas";
  actionLabel: string;
  reviewId?: number;
  employeeId?: number;
};

// ─── Reviews ──────────────────────────────────────────────────────────────────

export async function getReviews(storeId: number, filters?: {
  platform?: string;
  minStars?: number;
  maxStars?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Review[]> {
  const db = await getDb();
  if (!db) return [];

  let query = `SELECT * FROM reviews WHERE storeId = ?`;
  const params: unknown[] = [storeId];

  if (filters?.platform) { query += ` AND platform = ?`; params.push(filters.platform); }
  if (filters?.minStars !== undefined) { query += ` AND stars >= ?`; params.push(filters.minStars); }
  if (filters?.maxStars !== undefined) { query += ` AND stars <= ?`; params.push(filters.maxStars); }
  if (filters?.status) { query += ` AND status = ?`; params.push(filters.status); }
  if (filters?.startDate) { query += ` AND reviewDate >= ?`; params.push(filters.startDate); }
  if (filters?.endDate) { query += ` AND reviewDate <= ?`; params.push(filters.endDate); }

  // Open complaints first, then most recent
  query += ` ORDER BY CASE WHEN status NOT IN ('fechada','ignorada') AND stars <= 3 THEN 0 ELSE 1 END, reviewDate DESC`;

  const [rows] = await (db as any).$client.promise().execute(query, params);
  return (rows as any[]).map(r => ({
    ...r,
    wentToTable: !!r.wentToTable,
    replied: !!r.replied,
    publishedToCouncil: !!r.publishedToCouncil,
    tags: r.tags ? (typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags) : null,
  }));
}

export async function getReviewById(id: number): Promise<Review | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM reviews WHERE id = ?`, [id]);
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    ...r,
    wentToTable: !!r.wentToTable,
    replied: !!r.replied,
    publishedToCouncil: !!r.publishedToCouncil,
    tags: r.tags ? (typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags) : null,
  };
}

export async function createReview(data: {
  storeId: number;
  platform: string;
  stars: number;
  clientName?: string | null;
  text?: string | null;
  originalLink?: string | null;
  reviewDate: string;
  tags?: string[] | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO reviews (storeId, platform, stars, clientName, text, originalLink, reviewDate, tags, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'registrada')`,
    [data.storeId, data.platform, data.stars, data.clientName ?? null, data.text ?? null,
     data.originalLink ?? null, data.reviewDate, data.tags ? JSON.stringify(data.tags) : null]
  );
  return (result as any).insertId;
}

export async function updateReview(id: number, data: Partial<{
  category: string;
  wentToTable: boolean;
  wentToTableAt: string | null;
  replied: boolean;
  repliedAt: string | null;
  replyText: string | null;
  actionTaken: string | null;
  linkedActionId: number | null;
  linkedEmployeeId: number | null;
  publishedToCouncil: boolean;
  councilCaseId: number | null;
  tags: string[] | null;
  status: string;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === "tags") { sets.push(`tags = ?`); params.push(v ? JSON.stringify(v) : null); }
    else { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return;
  params.push(id);
  await (db as any).$client.promise().execute(`UPDATE reviews SET ${sets.join(", ")} WHERE id = ?`, params);
}

// ─── Monthly indicators ───────────────────────────────────────────────────────

export async function getMonthlyReviewStats(storeId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return { positiveCount: 0, negativeCount: 0, openComplaints: 0, googleAvg: 0, tripAvg: 0, ifoodAvg: 0, trainingsCount: 0, trainingsTarget: 4 };

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const [rows] = await (db as any).$client.promise().execute(
    `SELECT platform, stars, status FROM reviews WHERE storeId = ? AND reviewDate BETWEEN ? AND ?`,
    [storeId, startDate, endDate]
  );

  const reviews = rows as any[];
  const positiveCount = reviews.filter((r: any) => r.stars >= 4).length;
  const negativeCount = reviews.filter((r: any) => r.stars <= 3).length;
  const openComplaints = reviews.filter((r: any) => r.stars <= 3 && !["fechada", "ignorada"].includes(r.status)).length;

  const googleReviews = reviews.filter((r: any) => r.platform === "google");
  const tripReviews = reviews.filter((r: any) => r.platform === "tripadvisor");
  const ifoodReviews = reviews.filter((r: any) => r.platform === "ifood");

  const avg = (arr: any[]) => arr.length ? arr.reduce((s: number, r: any) => s + r.stars, 0) / arr.length : 0;

  // Trainings this month
  const [tRows] = await (db as any).$client.promise().execute(
    `SELECT COUNT(*) as cnt FROM training_sessions WHERE storeId = ? AND status = 'realizada' AND sessionDate BETWEEN ? AND ?`,
    [storeId, startDate, endDate]
  );
  const trainingsCount = (tRows as any[])[0]?.cnt ?? 0;

  // Weeks in month
  const weeksInMonth = Math.ceil(new Date(year, month, 0).getDate() / 7);

  return {
    positiveCount,
    negativeCount,
    openComplaints,
    googleAvg: Math.round(avg(googleReviews) * 10) / 10,
    tripAvg: Math.round(avg(tripReviews) * 10) / 10,
    ifoodAvg: Math.round(avg(ifoodReviews) * 10) / 10,
    trainingsCount,
    trainingsTarget: weeksInMonth,
  };
}

export async function getWeekReviews(storeId: number): Promise<Review[]> {
  const db = await getDb();
  if (!db) return [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString().split("T")[0];
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM reviews WHERE storeId = ? AND reviewDate >= ? ORDER BY reviewDate DESC`,
    [storeId, since]
  );
  return (rows as any[]).map(r => ({
    ...r,
    wentToTable: !!r.wentToTable,
    replied: !!r.replied,
    publishedToCouncil: !!r.publishedToCouncil,
    tags: r.tags ? (typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags) : null,
  }));
}

// ─── Service Standards ────────────────────────────────────────────────────────

export async function getServiceStandardById(id: number): Promise<ServiceStandard | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM service_standards WHERE id = ?`, [id]);
  const r = (rows as any)[0];
  if (!r) return null;
  return { id: r.id, storeId: r.storeId ?? null, layer: r.layer, brand: r.brand ?? null, category: r.category, text: r.text, whyText: r.whyText ?? null, positiveExample: r.positiveExample ?? null, negativeExample: r.negativeExample ?? null, appliesTo: r.appliesTo ? JSON.parse(r.appliesTo) : null, active: Boolean(r.active), createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
}

export async function getTrainingSessionById(id: number): Promise<TrainingSession | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM training_sessions WHERE id = ?`, [id]);
  const r = (rows as any)[0];
  if (!r) return null;
  return { id: r.id, storeId: r.storeId, sessionDate: r.sessionDate, theme: r.theme, linkedStandardId: r.linkedStandardId ?? null, contentLink: r.contentLink ?? null, contentText: r.contentText ?? null, participants: r.participants ? JSON.parse(r.participants) : null, status: r.status, notes: r.notes ?? null, weekCaseId: r.weekCaseId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
}

export async function getCouncilCaseById(id: number): Promise<CouncilCase | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM council_cases WHERE id = ?`, [id]);
  const r = (rows as any)[0];
  if (!r) return null;
  return { id: r.id, storeId: r.storeId, authorUserId: r.authorUserId, caseDate: r.caseDate, title: r.title, category: r.category, text: r.text, learning: r.learning ?? null, linkedReviewId: r.linkedReviewId ?? null, employeeName: r.employeeName ?? null, shared: Boolean(r.shared), passedByStores: r.passedByStores ? JSON.parse(r.passedByStores) : null, tookToTeamStores: r.tookToTeamStores ? JSON.parse(r.tookToTeamStores) : null, status: r.status, consolidatedStandardId: r.consolidatedStandardId ?? null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
}

export async function getServiceStandards(storeId: number, brand?: string): Promise<ServiceStandard[]> {
  const db = await getDb();
  if (!db) return [];
  // Return base + brand-specific + store-specific
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM service_standards WHERE active = 1 AND (
      layer = 'base' OR
      (layer = 'marca' AND brand = ?) OR
      (layer = 'loja' AND storeId = ?)
    ) ORDER BY FIELD(layer,'base','marca','loja'), category`,
    [brand ?? "", storeId]
  );
  return (rows as any[]).map(r => ({
    ...r,
    active: !!r.active,
    appliesTo: r.appliesTo ? (typeof r.appliesTo === "string" ? JSON.parse(r.appliesTo) : r.appliesTo) : null,
  }));
}

export async function createServiceStandard(data: {
  storeId?: number | null;
  layer: string;
  brand?: string | null;
  category: string;
  text: string;
  whyText?: string | null;
  positiveExample?: string | null;
  negativeExample?: string | null;
  appliesTo?: string[] | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO service_standards (storeId, layer, brand, category, text, whyText, positiveExample, negativeExample, appliesTo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.storeId ?? null, data.layer, data.brand ?? null, data.category, data.text,
     data.whyText ?? null, data.positiveExample ?? null, data.negativeExample ?? null,
     data.appliesTo ? JSON.stringify(data.appliesTo) : null]
  );
  return (result as any).insertId;
}

export async function updateServiceStandard(id: number, data: Partial<{
  text: string; whyText: string | null; positiveExample: string | null;
  negativeExample: string | null; appliesTo: string[] | null; active: boolean;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === "appliesTo") { sets.push(`appliesTo = ?`); params.push(v ? JSON.stringify(v) : null); }
    else { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return;
  params.push(id);
  await (db as any).$client.promise().execute(`UPDATE service_standards SET ${sets.join(", ")} WHERE id = ?`, params);
}

// ─── Standard Observations ────────────────────────────────────────────────────

export async function getStandardObservations(storeId: number, filters?: {
  employeeId?: number;
  startDate?: string;
  endDate?: string;
}): Promise<StandardObservation[]> {
  const db = await getDb();
  if (!db) return [];
  let query = `SELECT * FROM standard_observations WHERE storeId = ?`;
  const params: unknown[] = [storeId];
  if (filters?.employeeId) { query += ` AND employeeId = ?`; params.push(filters.employeeId); }
  if (filters?.startDate) { query += ` AND observationDate >= ?`; params.push(filters.startDate); }
  if (filters?.endDate) { query += ` AND observationDate <= ?`; params.push(filters.endDate); }
  query += ` ORDER BY observationDate DESC`;
  const [rows] = await (db as any).$client.promise().execute(query, params);
  return rows as StandardObservation[];
}

export async function createStandardObservation(data: {
  storeId: number;
  employeeId: number;
  standardId?: number | null;
  observationDate: string;
  type: string;
  text: string;
  author?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO standard_observations (storeId, employeeId, standardId, observationDate, type, text, author)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.storeId, data.employeeId, data.standardId ?? null, data.observationDate,
     data.type, data.text, data.author ?? "gestor"]
  );
  return (result as any).insertId;
}

export async function getEmployeeObsSummary(storeId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT employeeId,
       SUM(CASE WHEN type='positivo' THEN 1 ELSE 0 END) as positiveCount,
       SUM(CASE WHEN type='a-melhorar' THEN 1 ELSE 0 END) as negativeCount,
       SUM(CASE WHEN type='neutro' THEN 1 ELSE 0 END) as neutralCount
     FROM standard_observations WHERE storeId = ? AND observationDate BETWEEN ? AND ?
     GROUP BY employeeId`,
    [storeId, startDate, endDate]
  );
  return rows as { employeeId: number; positiveCount: number; negativeCount: number; neutralCount: number }[];
}

// ─── Training Sessions ────────────────────────────────────────────────────────

export async function getTrainingSessions(storeId: number, filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<TrainingSession[]> {
  const db = await getDb();
  if (!db) return [];
  let query = `SELECT * FROM training_sessions WHERE storeId = ?`;
  const params: unknown[] = [storeId];
  if (filters?.startDate) { query += ` AND sessionDate >= ?`; params.push(filters.startDate); }
  if (filters?.endDate) { query += ` AND sessionDate <= ?`; params.push(filters.endDate); }
  if (filters?.status) { query += ` AND status = ?`; params.push(filters.status); }
  query += ` ORDER BY sessionDate DESC`;
  const [rows] = await (db as any).$client.promise().execute(query, params);
  return (rows as any[]).map(r => ({
    ...r,
    participants: r.participants ? (typeof r.participants === "string" ? JSON.parse(r.participants) : r.participants) : null,
  }));
}

export async function createTrainingSession(data: {
  storeId: number;
  sessionDate: string;
  theme: string;
  linkedStandardId?: number | null;
  contentLink?: string | null;
  contentText?: string | null;
  participants?: number[] | null;
  status?: string;
  notes?: string | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO training_sessions (storeId, sessionDate, theme, linkedStandardId, contentLink, contentText, participants, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.storeId, data.sessionDate, data.theme, data.linkedStandardId ?? null,
     data.contentLink ?? null, data.contentText ?? null,
     data.participants ? JSON.stringify(data.participants) : null,
     data.status ?? "planejada", data.notes ?? null]
  );
  return (result as any).insertId;
}

export async function updateTrainingSession(id: number, data: Partial<{
  theme: string; sessionDate: string; status: string; notes: string | null;
  participants: number[] | null; linkedStandardId: number | null;
  contentLink: string | null; contentText: string | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === "participants") { sets.push(`participants = ?`); params.push(v ? JSON.stringify(v) : null); }
    else { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return;
  params.push(id);
  await (db as any).$client.promise().execute(`UPDATE training_sessions SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function getWeekTrainingCount(storeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT COUNT(*) as cnt FROM training_sessions WHERE storeId = ? AND status = 'realizada' AND sessionDate BETWEEN ? AND ?`,
    [storeId, monday.toISOString().split("T")[0], sunday.toISOString().split("T")[0]]
  );
  return (rows as any[])[0]?.cnt ?? 0;
}

// ─── Council Cases ────────────────────────────────────────────────────────────

export async function getCouncilCases(storeId: number, onlyShared = false): Promise<CouncilCase[]> {
  const db = await getDb();
  if (!db) return [];
  let query = onlyShared
    ? `SELECT * FROM council_cases WHERE (shared = 1 OR storeId = ?) ORDER BY caseDate DESC`
    : `SELECT * FROM council_cases WHERE storeId = ? ORDER BY caseDate DESC`;
  const [rows] = await (db as any).$client.promise().execute(query, [storeId]);
  return (rows as any[]).map(r => ({
    ...r,
    shared: !!r.shared,
    passedByStores: r.passedByStores ? (typeof r.passedByStores === "string" ? JSON.parse(r.passedByStores) : r.passedByStores) : [],
    tookToTeamStores: r.tookToTeamStores ? (typeof r.tookToTeamStores === "string" ? JSON.parse(r.tookToTeamStores) : r.tookToTeamStores) : [],
  }));
}

export async function createCouncilCase(data: {
  storeId: number;
  authorUserId: number;
  caseDate: string;
  title: string;
  category: string;
  text: string;
  learning?: string | null;
  linkedReviewId?: number | null;
  employeeName?: string | null;
  shared?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO council_cases (storeId, authorUserId, caseDate, title, category, text, learning, linkedReviewId, employeeName, shared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.storeId, data.authorUserId, data.caseDate, data.title, data.category,
     data.text, data.learning ?? null, data.linkedReviewId ?? null,
     data.employeeName ?? null, data.shared !== false ? 1 : 0]
  );
  return (result as any).insertId;
}

export async function updateCouncilCase(id: number, data: Partial<{
  status: string;
  passedByStores: number[];
  tookToTeamStores: number[];
  consolidatedStandardId: number | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === "passedByStores" || k === "tookToTeamStores") {
      sets.push(`${k} = ?`); params.push(JSON.stringify(v));
    } else { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return;
  params.push(id);
  await (db as any).$client.promise().execute(`UPDATE council_cases SET ${sets.join(", ")} WHERE id = ?`, params);
}

// ─── Suggestions Engine ───────────────────────────────────────────────────────

export async function generateExperienceSuggestions(
  storeId: number,
  config: { metaAvaliacoesPositivas: number; prazoMesa: number; prazoResposta: number }
): Promise<ExperienceSuggestion[]> {
  const db = await getDb();
  if (!db) return [];

  const suggestions: ExperienceSuggestion[] = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();

  // Get open reviews
  const [openRows] = await (db as any).$client.promise().execute(
    `SELECT * FROM reviews WHERE storeId = ? AND status NOT IN ('fechada','ignorada')`,
    [storeId]
  );
  const openReviews = openRows as any[];

  // Trigger 1: Avaliação aberta vencendo prazo (70% do prazo)
  for (const rev of openReviews) {
    if (rev.stars <= 3) {
      const hoursOpen = (now.getTime() - new Date(rev.createdAt).getTime()) / 3600000;
      const threshold = config.prazoMesa * 0.7;
      if (hoursOpen >= threshold && hoursOpen < config.prazoMesa) {
        suggestions.push({
          id: `review-warning-${rev.id}`,
          type: "warning",
          title: "Avaliação negativa próxima do prazo",
          description: `"${(rev.text ?? "").slice(0, 60)}..." · ${rev.platform} ${rev.stars}★ · ${Math.round(hoursOpen)}h aberta. Prazo: ${config.prazoMesa}h.`,
          category: "experiencia",
          actionLabel: "Tratar agora",
          reviewId: rev.id,
        });
      }
      // Trigger 2: Avaliação vencida
      if (hoursOpen >= config.prazoMesa) {
        suggestions.push({
          id: `review-overdue-${rev.id}`,
          type: "alert",
          title: "Avaliação negativa vencida",
          description: `"${(rev.text ?? "").slice(0, 60)}..." · ${rev.platform} ${rev.stars}★ · ${Math.round(hoursOpen)}h sem ação. Meta: ${config.prazoMesa}h.`,
          category: "experiencia",
          actionLabel: "Resolver urgente",
          reviewId: rev.id,
        });
      }
    }
  }

  // Trigger 3: Volume baixo de avaliações positivas (dia > 20 && < 80% da meta)
  const stats = await getMonthlyReviewStats(storeId, year, month);
  if (dayOfMonth > 20 && stats.positiveCount < config.metaAvaliacoesPositivas * 0.8) {
    const daysLeft = new Date(year, month, 0).getDate() - dayOfMonth;
    suggestions.push({
      id: "low-volume",
      type: "warning",
      title: "Volume baixo de avaliações positivas",
      description: `Você está em ${stats.positiveCount}/${config.metaAvaliacoesPositivas}. Faltam ${daysLeft} dias úteis no mês. Peça avaliação ao final dos atendimentos.`,
      category: "experiencia",
      actionLabel: "Criar ação no Plano",
    });
  }

  // Trigger 4: Padrão recorrente em reclamações (mesma categoria 3+ vezes)
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];
  const [catRows] = await (db as any).$client.promise().execute(
    `SELECT category, COUNT(*) as cnt FROM reviews WHERE storeId = ? AND stars <= 3 AND reviewDate BETWEEN ? AND ? AND category IS NOT NULL GROUP BY category HAVING cnt >= 3`,
    [storeId, startDate, endDate]
  );
  for (const row of catRows as any[]) {
    suggestions.push({
      id: `pattern-${row.category}`,
      type: "warning",
      title: `Padrão recorrente: "${row.category}"`,
      description: `${row.cnt} reclamações esse mês citaram "${row.category}". Revise o processo relacionado.`,
      category: "experiencia",
      actionLabel: "Criar ação investigativa",
    });
  }

  // Trigger 5: Sem treinamento essa semana (sexta-feira)
  const weekTrainings = await getWeekTrainingCount(storeId);
  if (now.getDay() >= 4 && weekTrainings === 0) { // Thu or later
    suggestions.push({
      id: "no-training-week",
      type: "warning",
      title: "Você não treinou a equipe essa semana",
      description: `Hoje é ${["dom","seg","ter","qua","qui","sex","sáb"][now.getDay()]}. Nenhuma sessão realizada essa semana. Meta: 1 por semana.`,
      category: "experiencia",
      actionLabel: "Agendar sessão",
    });
  }

  // Trigger 6: Funcionário com 3+ observações negativas no mês
  const obsSummary = await getEmployeeObsSummary(storeId, year, month);
  for (const emp of obsSummary) {
    if (emp.negativeCount >= 3) {
      suggestions.push({
        id: `emp-feedback-${emp.employeeId}`,
        type: "info",
        title: `Funcionário com ${emp.negativeCount} observações "a melhorar" no mês`,
        description: `Sugestão: conversa de feedback estruturada com esse colaborador.`,
        category: "pessoas",
        actionLabel: "Criar ação no Plano",
        employeeId: emp.employeeId,
      });
    }
  }

  // Trigger 7: Avaliação positiva sem resposta há 48h
  const [unrespondedRows] = await (db as any).$client.promise().execute(
    `SELECT COUNT(*) as cnt FROM reviews WHERE storeId = ? AND stars >= 4 AND replied = 0 AND TIMESTAMPDIFF(HOUR, createdAt, NOW()) > 48`,
    [storeId]
  );
  const unrespondedCount = (unrespondedRows as any[])[0]?.cnt ?? 0;
  if (unrespondedCount > 0) {
    suggestions.push({
      id: "unresponded-positive",
      type: "info",
      title: `${unrespondedCount} avaliação(ões) positiva(s) sem resposta`,
      description: `Responder avaliações positivas aumenta o engajamento e a nota da loja nas plataformas.`,
      category: "experiencia",
      actionLabel: "Ver avaliações",
    });
  }

  // Trigger 8: Não publicou no conselho esse mês (dia > 25)
  if (dayOfMonth > 25) {
    const [councilRows] = await (db as any).$client.promise().execute(
      `SELECT COUNT(*) as cnt FROM council_cases WHERE storeId = ? AND caseDate BETWEEN ? AND ?`,
      [storeId, startDate, endDate]
    );
    const councilCount = (councilRows as any[])[0]?.cnt ?? 0;
    if (councilCount === 0) {
      suggestions.push({
        id: "no-council-case",
        type: "info",
        title: "Você não publicou nenhum caso no Conselho esse mês",
        description: "Compartilhar experiências fortalece a comunidade de gestores. Publique um caso antes do fechamento do mês.",
        category: "experiencia",
        actionLabel: "Publicar caso",
      });
    }
  }

  return suggestions;
}
