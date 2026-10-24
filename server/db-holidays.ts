/**
 * db-holidays.ts — Helpers de banco para calendário de feriados e regras por loja
 */
import { getDb } from "./db";

export type HolidayEvent = {
  id: number;
  holidayDate: string; // YYYY-MM-DD
  name: string;
  eventType: "feriado" | "vespera" | "ponto_facultativo";
  scope: "nacional" | "estadual" | "municipal";
  uf: string | null;
  municipio: string | null;
};

export type StoreHolidayRule = {
  id: number;
  storeId: number;
  ruleDate: string; // YYYY-MM-DD
  eventType: "feriado" | "vespera" | "ponto_facultativo";
  multiplier: number;
  source: "ia" | "manual";
  notes: string | null;
};

/** Lista todos os feriados de um ano */
export async function listHolidaysByYear(year: number): Promise<HolidayEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await (db as any).$client.promise().execute(
    `SELECT id, holiday_date as holidayDate, name, event_type as eventType, scope, uf, municipio
     FROM holiday_calendars
     WHERE holiday_date LIKE ?
     ORDER BY holiday_date ASC`,
    [`${year}-%`]
  );
  return (rows.rows ?? []) as HolidayEvent[];
}

/** Lista feriados de um período (YYYY-MM-DD a YYYY-MM-DD) */
export async function listHolidaysByRange(startDate: string, endDate: string): Promise<HolidayEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await (db as any).$client.promise().execute(
    `SELECT id, holiday_date as holidayDate, name, event_type as eventType, scope, uf, municipio
     FROM holiday_calendars
     WHERE holiday_date >= ? AND holiday_date <= ?
     ORDER BY holiday_date ASC`,
    [startDate, endDate]
  );
  return (rows.rows ?? []) as HolidayEvent[];
}

/** Lista regras de multiplicador de uma loja para um período */
export async function listStoreHolidayRules(storeId: number, startDate: string, endDate: string): Promise<StoreHolidayRule[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await (db as any).$client.promise().execute(
    `SELECT id, store_id as storeId, rule_date as ruleDate, event_type as eventType,
            CAST(multiplier AS DECIMAL(5,3)) as multiplier, source, notes
     FROM store_holiday_rules
     WHERE store_id = ? AND rule_date >= ? AND rule_date <= ?
     ORDER BY rule_date ASC`,
    [storeId, startDate, endDate]
  );
  return (rows.rows ?? []).map((r: any) => ({
    ...r,
    multiplier: Number(r.multiplier),
  })) as StoreHolidayRule[];
}

/** Salva ou atualiza uma regra de multiplicador para uma loja/data */
export async function upsertStoreHolidayRule(
  storeId: number,
  ruleDate: string,
  eventType: "feriado" | "vespera" | "ponto_facultativo",
  multiplier: number,
  source: "ia" | "manual",
  notes?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await (db as any).$client.promise().execute(
    `INSERT INTO store_holiday_rules (store_id, rule_date, event_type, multiplier, source, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (store_id, rule_date) DO UPDATE SET
       event_type = VALUES(event_type),
       multiplier = VALUES(multiplier),
       source = VALUES(source),
       notes = VALUES(notes),
       updatedAt = NOW()`,
    [storeId, ruleDate, eventType, multiplier, source, notes ?? null]
  );
}

/** Salva múltiplas regras em lote (usado pela IA) */
export async function bulkUpsertStoreHolidayRules(
  storeId: number,
  rules: Array<{
    ruleDate: string;
    eventType: "feriado" | "vespera" | "ponto_facultativo";
    multiplier: number;
    source: "ia" | "manual";
    notes?: string;
  }>
): Promise<void> {
  for (const rule of rules) {
    await upsertStoreHolidayRule(
      storeId,
      rule.ruleDate,
      rule.eventType,
      rule.multiplier,
      rule.source,
      rule.notes
    );
  }
}

/** Insere feriados nacionais brasileiros de um ano (seed) */
export async function seedBrazilianHolidays(year: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Feriados nacionais fixos
  const fixedHolidays = [
    { date: `${year}-01-01`, name: "Confraternização Universal", type: "feriado" },
    { date: `${year}-04-21`, name: "Tiradentes", type: "feriado" },
    { date: `${year}-05-01`, name: "Dia do Trabalho", type: "feriado" },
    { date: `${year}-09-07`, name: "Independência do Brasil", type: "feriado" },
    { date: `${year}-10-12`, name: "Nossa Senhora Aparecida", type: "feriado" },
    { date: `${year}-11-02`, name: "Finados", type: "feriado" },
    { date: `${year}-11-15`, name: "Proclamação da República", type: "feriado" },
    { date: `${year}-11-20`, name: "Consciência Negra", type: "feriado" },
    { date: `${year}-12-25`, name: "Natal", type: "feriado" },
  ];

  // Feriados móveis (Páscoa e derivados) — cálculo do algoritmo de Gauss
  const easterDate = calcEaster(year);
  const easter = new Date(easterDate);
  const mobileHolidays = [
    { date: fmtDate(addDays(easter, -48)), name: "Segunda-feira de Carnaval", type: "vespera" },
    { date: fmtDate(addDays(easter, -47)), name: "Terça-feira de Carnaval", type: "feriado" },
    { date: fmtDate(addDays(easter, -46)), name: "Quarta-feira de Cinzas (meio-dia)", type: "ponto_facultativo" },
    { date: fmtDate(addDays(easter, -2)), name: "Sexta-feira Santa", type: "feriado" },
    { date: fmtDate(easter), name: "Páscoa", type: "feriado" },
    { date: fmtDate(addDays(easter, 60)), name: "Corpus Christi", type: "feriado" },
  ];

  // Vésperas dos feriados fixos mais relevantes
  const eves = [
    { date: `${year}-12-24`, name: "Véspera de Natal", type: "vespera" },
    { date: `${year}-12-31`, name: "Véspera de Ano Novo", type: "vespera" },
    { date: `${year}-04-30`, name: "Véspera de Tiradentes (se 30/04 for pré-feriado)", type: "vespera" },
  ];

  const all = [...fixedHolidays, ...mobileHolidays, ...eves];
  let inserted = 0;

  for (const h of all) {
    try {
      await (db as any).$client.promise().execute(
        `INSERT IGNORE INTO holiday_calendars (holiday_date, name, event_type, scope)
         VALUES (?, ?, ?, 'nacional')`,
        [h.date, h.name, h.type]
      );
      inserted++;
    } catch {
      // ignora duplicatas
    }
  }

  return inserted;
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Algoritmo de Gauss para calcular a Páscoa */
function calcEaster(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
