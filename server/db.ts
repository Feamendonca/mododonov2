import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../drizzle/schema";
import {
  ActionPlan,
  Commitment,
  CustomerOccurrence,
  DailyEntry,
  InsertActionPlan,
  InsertCommitment,
  InsertCustomerOccurrence,
  InsertDailyEntry,
  InsertStore,
  InsertStockCount,
  InsertUser,
  MonthlyQuality,
  Store,
  StockCount,
  StockItem,
  TrailCompletion,
  User,
  actionPlans,
  commitments,
  customerOccurrences,
  dailyEntries,
  monthlyQuality,
  stockCounts,
  stockItems,
  stores,
  trailCompletions,
  userStores,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pool: Pool | null = null;

/**
 * Traduz SQL cru do dialeto MySQL para Postgres.
 * Port MySQL → Postgres (Supabase). Aplicado a TODAS as queries cruas que passam
 * pelo shim de `$client.promise().execute()` / `.query()` e por `rawQuery`.
 *
 * Faz, fora de literais de string:
 *  - placeholders `?` → `$1, $2, ...` (posicionais do Postgres);
 *  - identificadores em crase MySQL (`col`) → aspas duplas Postgres ("col");
 *  - identificadores camelCase nus (storeId, entryDate, ...) → "storeId" (no
 *    Postgres identificadores sem aspas viram minúsculas; as colunas foram
 *    criadas em camelCase pelo drizzle, logo PRECISAM de aspas);
 *  - funções MySQL sem equivalente direto: IFNULL→COALESCE, CURDATE()→CURRENT_DATE,
 *    UNIX_TIMESTAMP()→extract(epoch...).
 */
export function translateMySqlToPg(input: string): string {
  let out = "";
  let placeholder = 0;
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    // Literal de string com aspas simples — copiar verbatim (trata '' escapado)
    if (ch === "'") {
      out += ch;
      i++;
      while (i < n) {
        out += input[i];
        if (input[i] === "'") {
          if (input[i + 1] === "'") { out += input[i + 1]; i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // Identificador já com aspas duplas — copiar verbatim
    if (ch === '"') {
      out += ch;
      i++;
      while (i < n) {
        out += input[i];
        if (input[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }
    // Identificador em crase (MySQL) → aspas duplas (Postgres)
    if (ch === "`") {
      i++;
      let ident = "";
      while (i < n && input[i] !== "`") { ident += input[i]; i++; }
      if (input[i] === "`") i++;
      out += `"${ident}"`;
      continue;
    }
    // Placeholder posicional
    if (ch === "?") {
      placeholder++;
      out += `$${placeholder}`;
      i++;
      continue;
    }
    // Palavra (identificador ou keyword/função)
    if (/[A-Za-z_]/.test(ch)) {
      let word = "";
      while (i < n && /[A-Za-z0-9_]/.test(input[i])) { word += input[i]; i++; }
      // camelCase (tem minúscula E maiúscula) → é uma coluna/identificador e
      // precisa de aspas no Postgres. ALL_CAPS (keywords/funcs) e all_lower
      // (tabelas snake_case, keywords) ficam intactos.
      if (/[a-z]/.test(word) && /[A-Z]/.test(word)) {
        out += `"${word}"`;
      } else {
        out += word;
      }
      continue;
    }
    out += ch;
    i++;
  }
  // Funções MySQL → Postgres (seguras, aplicadas após o scan de literais acima
  // seria ideal; aqui são all-caps e não colidem com valores camelCase).
  out = out.replace(/\bIFNULL\s*\(/gi, "COALESCE(");
  out = out.replace(/\bCURDATE\s*\(\s*\)/gi, "CURRENT_DATE");
  out = out.replace(/\bUNIX_TIMESTAMP\s*\(\s*\)/gi, "extract(epoch from now())");
  return out;
}

/** Executa SQL cru no pool pg aplicando a tradução de dialeto. Retorna no formato
 * mysql2 `[rows, fields]` para compatibilidade com o código existente. Para INSERT
 * com `RETURNING id`, anexa `insertId`/`affectedRows` ao array de linhas. */
async function runRaw(poolClient: Pool, rawSql: string, params: unknown[] = []): Promise<[any[], unknown]> {
  const text = translateMySqlToPg(rawSql);
  const res = await poolClient.query(text, params);
  const rows = res.rows as any[];
  // Compat mysql2 ResultSetHeader: insertId / affectedRows
  (rows as any).insertId = rows.length > 0 && rows[0] && "id" in rows[0] ? rows[0].id : 0;
  (rows as any).affectedRows = res.rowCount ?? rows.length;
  return [rows, res.fields];
}

/** Shim que reproduz a API `$client.promise().execute()/query()` do mysql2 sobre
 * o pool do pg. Mantém o contrato que o código (e os mocks de teste) esperam. */
function makeClientShim(poolClient: Pool) {
  const api = {
    execute: (rawSql: string, params: unknown[] = []) => runRaw(poolClient, rawSql, params),
    query: (rawSql: string, params: unknown[] = []) => runRaw(poolClient, rawSql, params),
  };
  return {
    promise: () => api,
    // Compat: alguns callsites podem acessar execute/query direto no $client
    ...api,
  };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(_pool, { schema });
      // Substitui o $client (que seria o Pool pg) pelo shim compatível com mysql2.
      (_db as any).$client = makeClientShim(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

/** Acesso direto ao pool pg (quando necessário o padrão nativo pool.query). */
export async function getPool(): Promise<Pool | null> {
  await getDb();
  return _pool;
}

/**
 * Helper centralizado para queries raw SQL parametrizadas.
 * Traduz MySQL→Postgres e executa via pool.query, retornando result.rows.
 * TODOS os arquivos devem usar este helper ou replicar o mesmo padrão.
 */
export async function rawQuery(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [rows] = await (db as any).$client.promise().execute(sql, params);
  return rows as Record<string, unknown>[];
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach((f) => {
    if (user[f] !== undefined) { values[f] = user[f] ?? null; updateSet[f] = user[f] ?? null; }
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  updateSet.updatedAt = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Stores ───────────────────────────────────────────────────────────────────
export async function getAllStores(): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stores).where(eq(stores.active, true));
}

export async function getStoreById(id: number): Promise<Store | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return result[0];
}

export async function getStoreBySlug(slug: string): Promise<Store | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return result[0];
}

export async function createStore(data: InsertStore): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(stores).values(data).returning({ id: stores.id });
  return result[0].id;
}

export async function updateStore(id: number, data: Partial<InsertStore>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(stores).set(data).where(eq(stores.id, id));
}

export async function getStoresByUserId(userId: number): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];
  const links = await db.select().from(userStores).where(eq(userStores.userId, userId));
  if (!links.length) return [];
  const storeIds = links.map((l) => l.storeId);
  return db.select().from(stores).where(sql`${stores.id} IN (${sql.join(storeIds.map(id => sql`${id}`), sql`, `)})`);
}

export async function linkUserToStore(userId: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userStores).values({ userId, storeId }).onConflictDoNothing({ target: [userStores.userId, userStores.storeId] });
}

// ─── Daily Entries ────────────────────────────────────────────────────────────
export async function getDailyEntries(storeId: number, from: string, to: string): Promise<DailyEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dailyEntries).where(
    and(eq(dailyEntries.storeId, storeId), gte(dailyEntries.entryDate, from), lte(dailyEntries.entryDate, to))
  ).orderBy(dailyEntries.entryDate);
}

export async function getDailyEntry(storeId: number, date: string): Promise<DailyEntry | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dailyEntries).where(
    and(eq(dailyEntries.storeId, storeId), eq(dailyEntries.entryDate, date))
  ).limit(1);
  return result[0];
}

export async function upsertDailyEntry(data: InsertDailyEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(dailyEntries).values(data).onConflictDoUpdate({
    target: [dailyEntries.storeId, dailyEntries.entryDate],
    set: { revenue: data.revenue, invoices: data.invoices, extraLabor: data.extraLabor, atendimentos: data.atendimentos, notes: data.notes, updatedAt: new Date() },
  });
}

/**
 * Upsert parcial: grava SOMENTE os campos presentes em `fields`.
 * Nunca sobrescreve revenue/invoices/extraLabor/atendimentos que não foram passados.
 */
export async function upsertDailyEntryFields(
  storeId: number,
  entryDate: string,
  fields: Partial<{ revenue: string; invoices: string; extraLabor: string; atendimentos: number; notes: string }>
): Promise<void> {
  const setCols: string[] = [];
  const params: unknown[] = [storeId, entryDate];
  const insertCols = ["storeId", "entryDate"];
  const insertPlaceholders = ["?", "?"];

  // Campos opcionais — só incluir se presentes
  const allFields: Array<{ key: keyof typeof fields; col: string; defaultVal: string | number }> = [
    { key: "revenue", col: "revenue", defaultVal: "0" },
    { key: "invoices", col: "invoices", defaultVal: "0" },
    { key: "extraLabor", col: "extraLabor", defaultVal: "0" },
    { key: "atendimentos", col: "atendimentos", defaultVal: 0 },
    { key: "notes", col: "notes", defaultVal: "" },
  ];

  for (const f of allFields) {
    if (f.key in fields && fields[f.key] !== undefined) {
      insertCols.push(f.col);
      insertPlaceholders.push("?");
      params.push(fields[f.key]);
      setCols.push(`${f.col} = VALUES(${f.col})`);
    } else {
      // Para o INSERT, usar default; para UPDATE, não tocar
      insertCols.push(f.col);
      insertPlaceholders.push("?");
      params.push(f.defaultVal);
    }
  }

  if (setCols.length === 0) return; // nada a atualizar

  const sql = `INSERT INTO daily_entries (${insertCols.join(", ")}) VALUES (${insertPlaceholders.join(", ")}) ON DUPLICATE KEY UPDATE ${setCols.join(", ")}`;
  await rawQuery(sql, params);
}

/**
 * Recalcula daily_entries.invoices a partir da soma de purchase_entries para um dia.
 * Fonte única: purchase_entries → daily_entries.invoices.
 */
export async function recomputeInvoicesForDate(storeId: number, data: string): Promise<void> {
  const rows = await rawQuery(
    `SELECT COALESCE(SUM(totalValue), 0) AS s FROM purchase_entries WHERE storeId = ? AND invoiceDate = ?`,
    [storeId, data]
  );
  const total = String(Number(rows[0]?.s ?? 0));
  await upsertDailyEntryFields(storeId, data, { invoices: total });
}

// ─── Stock Items ──────────────────────────────────────────────────────────────
export async function getStockItems(storeId: number): Promise<StockItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stockItems).where(and(eq(stockItems.storeId, storeId), eq(stockItems.active, true)));
}

export async function createStockItem(data: { storeId: number; name: string; unit: string; curve: "A" | "B" | "C"; avgCost: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(stockItems).values(data).returning({ id: stockItems.id });
  return result[0].id;
}

// ─── Stock Counts ─────────────────────────────────────────────────────────────
export async function getStockCounts(storeId: number, from?: string, to?: string): Promise<StockCount[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(stockCounts.storeId, storeId)];
  if (from) conditions.push(gte(stockCounts.countDate, from));
  if (to) conditions.push(lte(stockCounts.countDate, to));
  return db.select().from(stockCounts).where(and(...conditions)).orderBy(stockCounts.countDate);
}

export async function createStockCount(data: InsertStockCount): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Proteção de duplicata: se já existe contagem para loja+data, atualiza em vez de inserir
  const existing = await db
    .select({ id: stockCounts.id })
    .from(stockCounts)
    .where(and(eq(stockCounts.storeId, data.storeId), eq(stockCounts.countDate, data.countDate)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(stockCounts)
      .set({ totalValue: data.totalValue, countType: data.countType, items: data.items, notes: data.notes })
      .where(eq(stockCounts.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(stockCounts).values(data).returning({ id: stockCounts.id });
  return result[0].id;
}

// ─── Action Plans ─────────────────────────────────────────────────────────────
export async function getActionPlans(storeId: number): Promise<ActionPlan[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(actionPlans).where(eq(actionPlans.storeId, storeId)).orderBy(desc(actionPlans.createdAt));
}

export async function createActionPlan(data: InsertActionPlan): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(actionPlans).values(data).returning({ id: actionPlans.id });
  return result[0].id;
}

export async function updateActionPlan(id: number, data: Partial<InsertActionPlan>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(actionPlans).set(data).where(eq(actionPlans.id, id));
}

export async function deleteActionPlan(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(actionPlans).where(eq(actionPlans.id, id));
}

// ─── Commitments ──────────────────────────────────────────────────────────────
export async function getCommitment(storeId: number, period: string): Promise<Commitment | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(commitments).where(
    and(eq(commitments.storeId, storeId), eq(commitments.period, period))
  ).limit(1);
  return result[0];
}

export async function upsertCommitment(data: InsertCommitment): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { storeId, period, ...rest } = data;
  await db.insert(commitments).values(data).onConflictDoUpdate({
    target: [commitments.storeId, commitments.period],
    set: { ...rest, updatedAt: new Date() },
  });
}
// ─── Monthly Quality ──────────────────────────────────────────────────────────
export async function getMonthlyQuality(storeId: number, period: string): Promise<MonthlyQuality | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(monthlyQuality).where(
    and(eq(monthlyQuality.storeId, storeId), eq(monthlyQuality.period, period))
  ).limit(1);
  return result[0];
}

export interface UpsertMonthlyQualityData {
  storeId: number;
  period: string;
  qualityGoogle?: string | null;
  qualityAudit?: string | null;
  qualityChecklist?: string | null;
  sanitaryGate?: boolean;
  // Proveniência (Bloco C)
  googleFonte?: "calculado" | "manual";
  googleUpdatedBy?: string;
  googleUpdatedAt?: Date;
  auditFonte?: "calculado" | "manual";
  auditUpdatedBy?: string;
  auditUpdatedAt?: Date;
  checklistFonte?: "calculado" | "manual";
  checklistUpdatedBy?: string;
  checklistUpdatedAt?: Date;
}

export async function upsertMonthlyQuality(data: UpsertMonthlyQualityData): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const insertData = {
    storeId: data.storeId,
    period: data.period,
    qualityGoogle: data.qualityGoogle ?? null,
    qualityAudit: data.qualityAudit ?? null,
    qualityChecklist: data.qualityChecklist ?? null,
    sanitaryGate: data.sanitaryGate ?? true,
    googleFonte: data.googleFonte ?? null,
    googleUpdatedBy: data.googleUpdatedBy ?? null,
    googleUpdatedAt: data.googleUpdatedAt ?? null,
    auditFonte: data.auditFonte ?? null,
    auditUpdatedBy: data.auditUpdatedBy ?? null,
    auditUpdatedAt: data.auditUpdatedAt ?? null,
    checklistFonte: data.checklistFonte ?? null,
    checklistUpdatedBy: data.checklistUpdatedBy ?? null,
    checklistUpdatedAt: data.checklistUpdatedAt ?? null,
  };
  await db.insert(monthlyQuality).values(insertData).onConflictDoUpdate({
    target: [monthlyQuality.storeId, monthlyQuality.period],
    set: {
      updatedAt: new Date(),
      ...(data.qualityGoogle !== undefined && { qualityGoogle: data.qualityGoogle }),
      ...(data.qualityAudit !== undefined && { qualityAudit: data.qualityAudit }),
      ...(data.qualityChecklist !== undefined && { qualityChecklist: data.qualityChecklist }),
      ...(data.sanitaryGate !== undefined && { sanitaryGate: data.sanitaryGate }),
      ...(data.googleFonte !== undefined && { googleFonte: data.googleFonte }),
      ...(data.googleUpdatedBy !== undefined && { googleUpdatedBy: data.googleUpdatedBy }),
      ...(data.googleUpdatedAt !== undefined && { googleUpdatedAt: data.googleUpdatedAt }),
      ...(data.auditFonte !== undefined && { auditFonte: data.auditFonte }),
      ...(data.auditUpdatedBy !== undefined && { auditUpdatedBy: data.auditUpdatedBy }),
      ...(data.auditUpdatedAt !== undefined && { auditUpdatedAt: data.auditUpdatedAt }),
      ...(data.checklistFonte !== undefined && { checklistFonte: data.checklistFonte }),
      ...(data.checklistUpdatedBy !== undefined && { checklistUpdatedBy: data.checklistUpdatedBy }),
      ...(data.checklistUpdatedAt !== undefined && { checklistUpdatedAt: data.checklistUpdatedAt }),
    },
  });
}

// ─── Quality Recalculation (Bloco B) ────────────────────────────────────────

export interface QualidadeGoogleExtrato {
  reviews: number;          // quantidade de google_reviews no mês
  mediaNota: number;        // média das notas (1–5)
  notaBase: number;         // mediaNota × 20 (0–100)
  reclamacoesNaoPenalizadas: number; // reclamações resolvidas ou < 7 dias
  reclamacoesPenalizadas: number;    // reclamações não resolvidas em > 7 dias
  penalidade: number;       // reclamacoesPenalizadas × 5
  notaFinal: number;        // max(0, notaBase − penalidade)
  fonte: "calculado";       // sempre calculado por esta função
}

/** Recalcula a qualidade Google com PRECEDÊNCIA:
 * 1. Se a loja tem googlePlaceId → usa o snapshot mais recente de google_ratings (Places API, rating × 20 puro)
 * 2. Sem googlePlaceId → usa a tabela reviews (manual, com penalidade de reclamações)
 *
 * FÓRMULA Places: nota = rating × 20 (sem penalidade — Places é fonte agregada)
 * FÓRMULA Reviews: média de stars × 20 − penalidade (reclamações abertas >7 dias)
 * Sem dados no mês = NULL (nunca nota neutra inventada).
 * Apurações já APROVADAS não são recalculadas (extrato_json congelado no upsertApuracao).
 */
export async function recalcularQualidadeGoogle(
  storeId: number,
  period: string // YYYY-MM
): Promise<QualidadeGoogleExtrato | null> {
  const db = await getDb();
  if (!db) return null;
  // PRECEDÊNCIA 1: verificar se a loja tem googlePlaceId
  const [storeRows] = await (db as any).$client.promise().execute(
    "SELECT googlePlaceId FROM stores WHERE id = ?",
    [storeId]
  );
  const store = (storeRows as Array<{ googlePlaceId: string | null }>)[0];
  if (store?.googlePlaceId) {
    // Buscar snapshot do período em google_ratings
    const [ratingRows] = await (db as any).$client.promise().execute(
      "SELECT rating, totalRatings, nota FROM google_ratings WHERE storeId = ? AND period = ?",
      [storeId, period]
    );
    const snap = (ratingRows as Array<{ rating: string; totalRatings: number; nota: string }>)[0];
    if (snap) {
      const rating = parseFloat(snap.rating);
      const nota = parseFloat(snap.nota);
      return {
        reviews: snap.totalRatings,
        mediaNota: rating,
        notaBase: nota,
        reclamacoesNaoPenalizadas: 0,
        reclamacoesPenalizadas: 0,
        penalidade: 0,
        notaFinal: nota,
        fonte: "calculado", // compatibilidade de tipo — fonte real é Places API
      };
    }
    // Sem snapshot do período ainda → retorna null (não inventar nota)
    return null;
  }
  // PRECEDÊNCIA 2: caminho manual via reviews
  const [year, month] = period.split("-").map(Number);
  const startDate = `${period}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
  // Buscar reviews do mês na tabela reviews (fonte viva — platform='google')
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT stars, status, reviewDate FROM reviews WHERE storeId = ? AND platform = 'google' AND reviewDate BETWEEN ? AND ?`,
    [storeId, startDate, endDate]
  );
  const allReviews = rows as Array<{ stars: number; status: string; reviewDate: string }>;
  // Sem reviews no mês = NULL (nunca nota neutra inventada)
  if (allReviews.length === 0) return null;
  const mediaNota = allReviews.reduce((s, r) => s + r.stars, 0) / allReviews.length;
  const notaBase = mediaNota * 20;
  // Penalidade: reviews com stars<=3, status aberto (não 'fechada' nem 'ignorada'), há mais de 7 dias
  const now = Date.now();
  const complaints = allReviews.filter((r) => r.stars <= 3);
  const reclamacoesPenalizadas = complaints.filter((r) => {
    if (["fechada", "ignorada"].includes(r.status)) return false;
    const age = (now - new Date(r.reviewDate).getTime()) / (1000 * 60 * 60 * 24);
    return age > 7;
  }).length;
  const reclamacoesNaoPenalizadas = complaints.length - reclamacoesPenalizadas;
  const penalidade = reclamacoesPenalizadas * 5;
  const notaFinal = Math.max(0, notaBase - penalidade);
  return {
    reviews: allReviews.length,
    mediaNota: Math.round(mediaNota * 10) / 10,
    notaBase: Math.round(notaBase * 10) / 10,
    reclamacoesNaoPenalizadas,
    reclamacoesPenalizadas,
    penalidade,
    notaFinal: Math.round(notaFinal * 10) / 10,
    fonte: "calculado",
  };
}

// ─── User Role Management ─────────────────────────────────────────────────────
export async function promoteUserToAdmin(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role: "admin" }).where(eq(users.openId, openId));
}

export async function setUserRole(openId: string, role: "admin" | "supervisor" | "user"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.openId, openId));
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}
