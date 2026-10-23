/**
 * db-pessoas.ts — Query helpers for the Pessoas (People Management) module
 * Handles employees, shift blocks, schedules, hourly revenue, movements, and config.
 */
import { getDb } from "./db";
import { getDailyEntries } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmployeeStatus = "active" | "probation" | "inactive";
export type MovementType = "hire" | "termination" | "role_change" | "salary_change";

export type PapelRemuneravel = "nenhum" | "gestor" | "lider";

export type Employee = {
  id: number;
  storeId: number;
  name: string;
  role: string;
  salaryBase: number;
  transportAllowance: number;
  mealAllowance: number;
  otherBenefits: number;
  hoursPerMonth: number;
  hireDate: string;
  status: EmployeeStatus;
  papelRemuneravel: PapelRemuneravel;
  userId: number | null; // vínculo com o login (users.id)
  createdAt: Date;
  updatedAt: Date;
};

export type ShiftBlock = {
  id: number;
  storeId: number;
  name: string;
  startHour: number;
  endHour: number;
  sortOrder: number;
  startMinute: number; // minutos desde meia-noite (0..1439)
  endMinute: number;   // 0 = meia-noite (virada permitida quando endMinute <= startMinute)
};

// ─── Helpers de turno noturno ─────────────────────────────────────────────────
/** Duração em horas (suporta virada de meia-noite: endMinute <= startMinute) */
export function blockDurationHours(b: { startMinute: number; endMinute: number }): number {
  const endM = b.endMinute <= b.startMinute ? b.endMinute + 1440 : b.endMinute;
  return (endM - b.startMinute) / 60;
}

/** Horas inteiras (0-23) cobertas pelo bloco, com wrap de meia-noite */
export function blockHours(b: { startMinute: number; endMinute: number }): number[] {
  const endM = b.endMinute <= b.startMinute ? b.endMinute + 1440 : b.endMinute;
  const hours: number[] = [];
  for (let m = b.startMinute; m < endM; m += 60) {
    hours.push(Math.floor(m / 60) % 24);
  }
  return hours;
}

/** Formata minutos desde meia-noite como "HH:MM" */
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type ScheduleEntry = {
  id: number;
  storeId: number;
  shiftBlockId: number;
  employeeId: number;
  workDate: string;
};

export type HourlyRevenue = {
  id: number;
  storeId: number;
  revenueDate: string;
  hour: number;
  revenue: number;
};

export type StaffMovement = {
  id: number;
  storeId: number;
  employeeId: number;
  movementType: MovementType;
  movementDate: string;
  reason: string | null;
  previousValue: string | null;
  newValue: string | null;
  createdAt: Date;
};

export type StorePeopleConfig = {
  id: number;
  storeId: number;
  chargesPercent: number;
  productivityTarget: number;
  payrollTargetPercent: number;
  hiringCost: number;
  operationStartHour: number;
  operationEndHour: number;
};

// ─── Cost Calculation ─────────────────────────────────────────────────────────

export function calcEmployeeCosts(emp: Pick<Employee, "salaryBase" | "transportAllowance" | "mealAllowance" | "otherBenefits" | "hoursPerMonth">, chargesPercent: number) {
  const monthlyCost =
    emp.salaryBase * (1 + chargesPercent / 100) +
    emp.transportAllowance +
    emp.mealAllowance +
    emp.otherBenefits;
  const hourlyRate = emp.hoursPerMonth > 0 ? monthlyCost / emp.hoursPerMonth : 0;
  return { monthlyCost, hourlyRate };
}

// ─── Store People Config ──────────────────────────────────────────────────────

export async function getStorePeopleConfig(storeId: number): Promise<StorePeopleConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM store_people_config WHERE storeId = ? LIMIT 1",
    [storeId]
  );
  return (rows as any[])[0] ?? null;
}

export async function upsertStorePeopleConfig(
  storeId: number,
  data: Partial<Omit<StorePeopleConfig, "id" | "storeId">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const fields = Object.keys(data);
  if (fields.length === 0) return;
  const setClause = fields.map(f => `${f} = ?`).join(", ");
  const values = Object.values(data);
  await (db as any).$client.promise().execute(
    `INSERT INTO store_people_config (storeId, ${fields.join(", ")})
     VALUES (?, ${fields.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE ${setClause}`,
    [storeId, ...values, ...values]
  );
}

// ─── Shift Blocks ─────────────────────────────────────────────────────────────

export async function getShiftBlocks(storeId: number): Promise<ShiftBlock[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM shift_blocks WHERE storeId = ? ORDER BY sortOrder, startHour",
    [storeId]
  );
  return rows as ShiftBlock[];
}

export async function createShiftBlock(
  storeId: number,
  data: { name: string; startHour: number; endHour: number; startMinute?: number; endMinute?: number; sortOrder?: number }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const sm = data.startMinute ?? data.startHour * 60;
  const em = data.endMinute ?? data.endHour * 60;
  const [result] = await (db as any).$client.promise().execute(
    "INSERT INTO shift_blocks (storeId, name, startHour, endHour, startMinute, endMinute, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [storeId, data.name, data.startHour, data.endHour, sm, em, data.sortOrder ?? 0]
  );
  return (result as any).insertId;
}

export async function updateShiftBlock(
  id: number,
  storeId: number,
  data: { name?: string; startHour?: number; endHour?: number; startMinute?: number; endMinute?: number; sortOrder?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const fields = Object.keys(data);
  if (fields.length === 0) return;
  const setClause = fields.map(f => `${f} = ?`).join(", ");
  await (db as any).$client.promise().execute(
    `UPDATE shift_blocks SET ${setClause} WHERE id = ? AND storeId = ?`,
    [...Object.values(data), id, storeId]
  );
}

export async function deleteShiftBlock(id: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await (db as any).$client.promise().execute(
    "DELETE FROM shift_blocks WHERE id = ? AND storeId = ?",
    [id, storeId]
  );
}

// ─── Employees ────────────────────────────────────────────────────────────────

export async function getEmployees(storeId: number, includeInactive = false): Promise<Employee[]> {
  const db = await getDb();
  if (!db) return [];
  const whereStatus = includeInactive ? "" : "AND status != 'inactive'";
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM employees WHERE storeId = ? ${whereStatus} ORDER BY name`,
    [storeId]
  );
  return (rows as any[]).map(r => ({
    ...r,
    salaryBase: Number(r.salaryBase),
    transportAllowance: Number(r.transportAllowance),
    mealAllowance: Number(r.mealAllowance),
    otherBenefits: Number(r.otherBenefits),
    papelRemuneravel: (r.papelRemuneravel ?? "nenhum") as PapelRemuneravel,
    userId: r.userId ? Number(r.userId) : null,
  }));
}

export async function createEmployee(
  storeId: number,
  data: Omit<Employee, "id" | "storeId" | "createdAt" | "updatedAt" | "userId"> & { papelRemuneravel?: PapelRemuneravel; userId?: number | null | undefined }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO employees (storeId, name, role, salaryBase, transportAllowance, mealAllowance, otherBenefits, hoursPerMonth, hireDate, status, papelRemuneravel, userId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [storeId, data.name, data.role, data.salaryBase, data.transportAllowance, data.mealAllowance, data.otherBenefits, data.hoursPerMonth, data.hireDate, data.status, data.papelRemuneravel ?? "nenhum", data.userId ?? null]
  );
  return (result as any).insertId;
}

export async function updateEmployee(
  id: number,
  storeId: number,
  data: Partial<Omit<Employee, "id" | "storeId" | "createdAt" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const fields = Object.keys(data);
  if (fields.length === 0) return;
  const setClause = fields.map(f => `${f} = ?`).join(", ");
  await (db as any).$client.promise().execute(
    `UPDATE employees SET ${setClause} WHERE id = ? AND storeId = ?`,
    [...Object.values(data), id, storeId]
  );
}


/** Busca um funcionário por id e storeId */
export async function getEmployeeById(id: number, storeId: number): Promise<Employee | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM employees WHERE id = ? AND storeId = ? LIMIT 1`,
    [id, storeId]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    ...r,
    salaryBase: Number(r.salaryBase),
    transportAllowance: Number(r.transportAllowance),
    mealAllowance: Number(r.mealAllowance),
    otherBenefits: Number(r.otherBenefits),
    papelRemuneravel: (r.papelRemuneravel ?? "nenhum") as PapelRemuneravel,
    userId: r.userId ? Number(r.userId) : null,
  };
}

export async function deleteEmployee(id: number, storeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Soft delete — set to inactive
  await (db as any).$client.promise().execute(
    "UPDATE employees SET status = 'inactive' WHERE id = ? AND storeId = ?",
    [id, storeId]
  );
}

/** Busca o employee vinculado a um usuário (userId) em uma loja específica */
export async function getEmployeeByUserId(userId: number, storeId: number): Promise<Employee | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT * FROM employees WHERE userId = ? AND storeId = ? AND status != 'inactive' LIMIT 1`,
    [userId, storeId]
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    ...r,
    salaryBase: Number(r.salaryBase),
    transportAllowance: Number(r.transportAllowance),
    mealAllowance: Number(r.mealAllowance),
    otherBenefits: Number(r.otherBenefits),
    papelRemuneravel: (r.papelRemuneravel ?? "nenhum") as PapelRemuneravel,
    userId: r.userId ? Number(r.userId) : null,
  };
}

// ─── Schedules ────────────────────────────────────────────────────────────────

export async function getScheduleForWeek(
  storeId: number,
  startDate: string,
  endDate: string
): Promise<ScheduleEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM schedules WHERE storeId = ? AND workDate BETWEEN ? AND ? ORDER BY workDate, shiftBlockId",
    [storeId, startDate, endDate]
  );
  return rows as ScheduleEntry[];
}

export async function setScheduleForBlock(
  storeId: number,
  shiftBlockId: number,
  workDate: string,
  employeeIds: number[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove existing entries for this block/date
  await (db as any).$client.promise().execute(
    "DELETE FROM schedules WHERE storeId = ? AND shiftBlockId = ? AND workDate = ?",
    [storeId, shiftBlockId, workDate]
  );
  // Insert new entries
  if (employeeIds.length > 0) {
    const placeholders = employeeIds.map(() => "(?, ?, ?, ?)").join(", ");
    const values = employeeIds.flatMap(eid => [storeId, shiftBlockId, eid, workDate]);
    await (db as any).$client.promise().execute(
      `INSERT INTO schedules (storeId, shiftBlockId, employeeId, workDate) VALUES ${placeholders}`,
      values
    );
  }
}

export async function copyScheduleFromPreviousWeek(
  storeId: number,
  targetStartDate: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Get previous week start (7 days before)
  const target = new Date(targetStartDate);
  const prevStart = new Date(target);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(prevStart);
  prevEnd.setDate(prevEnd.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const prevEntries = await getScheduleForWeek(storeId, fmt(prevStart), fmt(prevEnd));

  if (prevEntries.length === 0) return 0;

  // Map prev dates to target dates (shift by 7 days)
  const toInsert = prevEntries.map(e => {
    const prevDate = new Date(e.workDate);
    const newDate = new Date(prevDate);
    newDate.setDate(newDate.getDate() + 7);
    return { ...e, workDate: fmt(newDate) };
  });

  // Clear target week first
  const targetEnd = new Date(target);
  targetEnd.setDate(targetEnd.getDate() + 6);
  await (db as any).$client.promise().execute(
    "DELETE FROM schedules WHERE storeId = ? AND workDate BETWEEN ? AND ?",
    [storeId, targetStartDate, fmt(targetEnd)]
  );

  // Insert copied entries
  const placeholders = toInsert.map(() => "(?, ?, ?, ?)").join(", ");
  const values = toInsert.flatMap(e => [storeId, e.shiftBlockId, e.employeeId, e.workDate]);
  await (db as any).$client.promise().execute(
    `INSERT INTO schedules (storeId, shiftBlockId, employeeId, workDate) VALUES ${placeholders}`,
    values
  );
  return toInsert.length;
}

// ─── Hourly Revenue ───────────────────────────────────────────────────────────

export async function getHourlyRevenue(
  storeId: number,
  date: string
): Promise<HourlyRevenue[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM hourly_revenue WHERE storeId = ? AND revenueDate = ? ORDER BY hour",
    [storeId, date]
  );
  return (rows as any[]).map(r => ({ ...r, revenue: Number(r.revenue) }));
}

export async function getHourlyRevenueForWeek(
  storeId: number,
  startDate: string,
  endDate: string
): Promise<HourlyRevenue[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    "SELECT * FROM hourly_revenue WHERE storeId = ? AND revenueDate BETWEEN ? AND ? ORDER BY revenueDate, hour",
    [storeId, startDate, endDate]
  );
  return (rows as any[]).map(r => ({ ...r, revenue: Number(r.revenue) }));
}

export async function upsertHourlyRevenue(
  storeId: number,
  date: string,
  entries: { hour: number; revenue: number }[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (entries.length === 0) return;
  const placeholders = entries.map(() => "(?, ?, ?, ?)").join(", ");
  const values = entries.flatMap(e => [storeId, date, e.hour, e.revenue]);
  await (db as any).$client.promise().execute(
    `INSERT INTO hourly_revenue (storeId, revenueDate, hour, revenue) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE revenue = VALUES(revenue)`,
    values
  );
}

// ─── Staff Movements ──────────────────────────────────────────────────────────

export async function getStaffMovements(
  storeId: number,
  limit = 50
): Promise<(StaffMovement & { employeeName: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await (db as any).$client.promise().execute(
    `SELECT sm.*, e.name as employeeName
     FROM staff_movements sm
     LEFT JOIN employees e ON e.id = sm.employeeId
     WHERE sm.storeId = ?
     ORDER BY sm.movementDate DESC, sm.createdAt DESC
     LIMIT ?`,
    [storeId, limit]
  );
  return rows as any[];
}

export async function createStaffMovement(
  storeId: number,
  data: Omit<StaffMovement, "id" | "storeId" | "createdAt">
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await (db as any).$client.promise().execute(
    `INSERT INTO staff_movements (storeId, employeeId, movementType, movementDate, reason, previousValue, newValue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [storeId, data.employeeId, data.movementType, data.movementDate, data.reason ?? null, data.previousValue ?? null, data.newValue ?? null]
  );
  return (result as any).insertId;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type BlockProductivity = {
  blockId: number;
  blockName: string;
  date: string;
  revenue: number;
  personHours: number;
  blockCost: number;
  productivity: number; // R$/h-person
  status: "green" | "amber" | "red";
};

export async function calcBlockProductivity(
  storeId: number,
  startDate: string,
  endDate: string,
  productivityTarget: number,
  chargesPercent: number
): Promise<BlockProductivity[]> {
  const db = await getDb();
  if (!db) return [];

  const blocks = await getShiftBlocks(storeId);
  const employees = await getEmployees(storeId);
  const scheduleEntries = await getScheduleForWeek(storeId, startDate, endDate);
  const revenueEntries = await getHourlyRevenueForWeek(storeId, startDate, endDate);

  // Build employee cost map
  const empCostMap = new Map<number, number>();
  for (const emp of employees) {
    const { hourlyRate } = calcEmployeeCosts(emp, chargesPercent);
    empCostMap.set(emp.id, hourlyRate);
  }

  // Build revenue map: date -> hour -> revenue
  const revMap = new Map<string, Map<number, number>>();
  for (const r of revenueEntries) {
    if (!revMap.has(r.revenueDate)) revMap.set(r.revenueDate, new Map());
    revMap.get(r.revenueDate)!.set(r.hour, r.revenue);
  }

  // Build schedule map: date -> blockId -> employeeIds
  const schedMap = new Map<string, Map<number, number[]>>();
  for (const s of scheduleEntries) {
    if (!schedMap.has(s.workDate)) schedMap.set(s.workDate, new Map());
    const dateMap = schedMap.get(s.workDate)!;
    if (!dateMap.has(s.shiftBlockId)) dateMap.set(s.shiftBlockId, []);
    dateMap.get(s.shiftBlockId)!.push(s.employeeId);
  }

  const results: BlockProductivity[] = [];

  // Iterate over all dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const dayRevMap = revMap.get(dateStr) ?? new Map();
    const daySchedMap = schedMap.get(dateStr) ?? new Map();

    for (const block of blocks) {
      const empIds = daySchedMap.get(block.id) ?? [];
      const blockDuration = blockDurationHours({ startMinute: block.startHour * 60, endMinute: block.endHour * 60 });
      const personHours = empIds.length * blockDuration;

      // Sum revenue for hours in this block
      let revenue = 0;
      for (const h of blockHours({ startMinute: block.startHour * 60, endMinute: block.endHour * 60 })) {
        revenue += dayRevMap.get(h) ?? 0;
      }

      // Block cost
      const blockCost = (empIds as number[]).reduce((sum: number, eid: number) => {
        const rate = empCostMap.get(eid) ?? 0;
        return sum + rate * blockDuration;
      }, 0);

      const productivity = personHours > 0 ? revenue / personHours : 0;
      const status: "green" | "amber" | "red" =
        productivity >= productivityTarget ? "green" :
        productivity >= productivityTarget * 0.5 ? "amber" : "red";

      results.push({
        blockId: block.id,
        blockName: block.name,
        date: dateStr,
        revenue,
        personHours,
        blockCost,
        productivity,
        status,
      });
    }
  }

  return results;
}

export type HeatmapHour = {
  hour: number;
  revenue: number;
  personCount: number;
  productivity: number;
  status: "green" | "amber" | "red" | "idle";
};

export async function calcHeatmap(
  storeId: number,
  date: string,
  productivityTarget: number,
  chargesPercent: number
): Promise<HeatmapHour[]> {
  const db = await getDb();
  if (!db) return [];

  const config = await getStorePeopleConfig(storeId);
  const startHour = config?.operationStartHour ?? 8;
  const endHour = config?.operationEndHour ?? 23;

  const blocks = await getShiftBlocks(storeId);
  const employees = await getEmployees(storeId);
  const scheduleEntries = await getScheduleForWeek(storeId, date, date);
  const revenueEntries = await getHourlyRevenue(storeId, date);

  // Build schedule map: blockId -> employeeIds
  const blockEmpMap = new Map<number, number[]>();
  for (const s of scheduleEntries) {
    if (!blockEmpMap.has(s.shiftBlockId)) blockEmpMap.set(s.shiftBlockId, []);
    blockEmpMap.get(s.shiftBlockId)!.push(s.employeeId);
  }

  // Build revenue map: hour -> revenue
  const revMap = new Map<number, number>();
  for (const r of revenueEntries) revMap.set(r.hour, r.revenue);

  const result: HeatmapHour[] = [];

  for (let h = startHour; h < endHour; h++) {
    const revenue = revMap.get(h) ?? 0;

    // Find which blocks cover this hour
    const coveringBlocks = blocks.filter(b => blockHours(b).includes(h));
    const empSet = new Set<number>();
    for (const b of coveringBlocks) {
      for (const eid of (blockEmpMap.get(b.id) ?? [])) empSet.add(eid);
    }
    const personCount = empSet.size;
    const productivity = personCount > 0 ? revenue / personCount : 0;

    let status: HeatmapHour["status"] = "idle";
    if (personCount > 0 || revenue > 0) {
      status = productivity >= productivityTarget ? "green" :
               productivity >= productivityTarget * 0.5 ? "amber" : "red";
    }

    result.push({ hour: h, revenue, personCount, productivity, status });
  }

  return result;
}

// ─── Suggestions Engine ───────────────────────────────────────────────────────

export type PeopleSuggestion = {
  type: "structural" | "individual" | "opportunity" | "alert";
  trigger: string;
  title: string;
  description: string;
  estimatedSaving?: number;
  actionCategory: string;
  actionTitle: string;
};

export async function generatePeopleSuggestions(
  storeId: number,
  productivityTarget: number,
  payrollTargetPercent: number,
  chargesPercent: number
): Promise<PeopleSuggestion[]> {
  const suggestions: PeopleSuggestion[] = [];

  // Get last 3 weeks of data
  const today = new Date();
  const threeWeeksAgo = new Date(today);
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const blockData = await calcBlockProductivity(
    storeId,
    fmt(threeWeeksAgo),
    fmt(today),
    productivityTarget,
    chargesPercent
  );

  // Group by blockId + day of week
  const blockDayMap = new Map<string, BlockProductivity[]>();
  for (const b of blockData) {
    const dow = new Date(b.date).getDay();
    const key = `${b.blockId}-${dow}`;
    if (!blockDayMap.has(key)) blockDayMap.set(key, []);
    blockDayMap.get(key)!.push(b);
  }

  // Trigger 1: Hora morta recorrente (3+ semanas com produtividade < 0.5x meta)
  for (const [key, entries] of Array.from(blockDayMap.entries())) {
    if (entries.length < 3) continue;
    const lowCount = entries.filter((e: BlockProductivity) => e.productivity < productivityTarget * 0.5 && e.personHours > 0).length;
    if (lowCount >= 3) {
      const block = entries[0];
      const avgProductivity = entries.reduce((s: number, e: BlockProductivity) => s + e.productivity, 0) / entries.length;
      const avgPersonHours = entries.reduce((s: number, e: BlockProductivity) => s + e.personHours, 0) / entries.length;
      const avgCost = entries.reduce((s: number, e: BlockProductivity) => s + e.blockCost, 0) / entries.length;
      const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      const dow = parseInt(key.split("-")[1]);
      suggestions.push({
        type: "structural",
        trigger: "low_productivity_recurring",
        title: `Turno ${block.blockName} na ${dayNames[dow]} com baixa produtividade`,
        description: `O turno ${block.blockName} na ${dayNames[dow]} tem produtividade média de R$ ${avgProductivity.toFixed(0)}/h-pessoa há ${lowCount} semanas seguidas (meta: R$ ${productivityTarget}/h-pessoa). Considere reduzir o quadro nesse turno.`,
        estimatedSaving: avgCost * 0.3 * 4, // 30% redução por 4 semanas
        actionCategory: "pessoas",
        actionTitle: `Reduzir quadro no turno ${block.blockName} na ${dayNames[dow]}`,
      });
    }
  }

  // Trigger 2: Bloco subestimado (produtividade > 2x meta)
  for (const [key, entries] of Array.from(blockDayMap.entries())) {
    if (entries.length < 2) continue;
    const highCount = entries.filter((e: BlockProductivity) => e.productivity > productivityTarget * 2 && e.personHours > 0).length;
    if (highCount >= 2) {
      const block = entries[0];
      const avgProductivity = entries.reduce((s: number, e: BlockProductivity) => s + e.productivity, 0) / entries.length;
      const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      const dow = parseInt(key.split("-")[1]);
      suggestions.push({
        type: "opportunity",
        trigger: "understaffed_block",
        title: `Turno ${block.blockName} na ${dayNames[dow]} pode estar com falta de pessoal`,
        description: `O turno ${block.blockName} na ${dayNames[dow]} tem produtividade média de R$ ${avgProductivity.toFixed(0)}/h-pessoa — mais de 2× a meta. Você pode estar perdendo vendas por falta de atendimento. Considere testar mais uma pessoa nesse turno.`,
        actionCategory: "pessoas",
        actionTitle: `Testar 1 pessoa a mais no turno ${block.blockName} na ${dayNames[dow]}`,
      });
    }
  }

  // Trigger 3: Folha acima da meta (payroll % > target + 3pp)
  const payrollData = await getPayrollSummary(storeId, chargesPercent);
  const employees = await getEmployees(storeId);
  const activeCount = employees.filter(e => e.status !== "inactive").length;
  if (payrollData.payrollPercent !== null && payrollData.payrollPercent > payrollTargetPercent + 3) {
    const excess = payrollData.payrollPercent - payrollTargetPercent;
    suggestions.push({
      type: "alert",
      trigger: "payroll_over_target",
      title: "Folha de pagamento acima da meta",
      description: `A folha estimada representa ${payrollData.payrollPercent.toFixed(1)}% da receita — ${excess.toFixed(1)} pontos percentuais acima da meta de ${payrollTargetPercent}%. Revise o quadro ativo ou negocie horas com a equipe.`,
      estimatedSaving: payrollData.estimatedMonthlyPayroll * (excess / 100),
      actionCategory: "pessoas",
      actionTitle: "Revisar quadro ativo para reduzir % folha/receita",
    });
  }

  // Trigger 4: Alta rotatividade (turnover > 10% no mês)
  const turnover = await getTurnoverStats(storeId);
  if (turnover.turnoverRate > 10) {
    suggestions.push({
      type: "alert",
      trigger: "high_turnover",
      title: "Alta rotatividade de pessoal no mês",
      description: `${turnover.terminationsThisMonth} desligamento(s) este mês — taxa de turnover de ${turnover.turnoverRate.toFixed(1)}%. Alta rotatividade aumenta custos de treinamento e impacta a qualidade do atendimento. Investigue as causas.`,
      actionCategory: "pessoas",
      actionTitle: "Realizar entrevistas de desligamento e mapear causas da rotatividade",
    });
  }

  // Trigger 5: Quadro abaixo do mínimo operacional (< 3 ativos)
  if (activeCount > 0 && activeCount < 3) {
    suggestions.push({
      type: "alert",
      trigger: "understaffed_store",
      title: "Quadro mínimo em risco",
      description: `A loja tem apenas ${activeCount} funcionário(s) ativo(s) cadastrado(s). Um quadro tão enxuto aumenta o risco operacional em caso de faltas ou afastamentos. Considere abrir processo seletivo preventivo.`,
      actionCategory: "pessoas",
      actionTitle: "Abrir processo seletivo preventivo para reforçar o quadro",
    });
  }


  // Trigger 6: Produtividade individual — pessoa com custo/h alto em turnos de baixa venda
  const personData = await calcPersonProductivity(
    storeId,
    fmt(threeWeeksAgo),
    fmt(today),
    chargesPercent,
    productivityTarget
  );
  if (personData.length >= 2) {
    const avgProd = personData.reduce((s, p) => s + p.produtividadeRH, 0) / personData.length;
    const avgCusto = personData.reduce((s, p) => s + p.custoHora, 0) / personData.length;
    const candidatos = personData.filter(
      p => p.produtividadeRH < avgProd * 0.5 && p.custoHora > avgCusto && p.horasTrabalhadas >= 10
    );
    for (const p of candidatos.slice(0, 2)) {
      suggestions.push({
        type: "individual",
        trigger: "low_individual_productivity",
        title: `${p.name} cobre turnos com baixa venda`,
        description: `${p.name} (${p.role}) tem produtividade de R$ ${p.produtividadeRH.toFixed(0)}/h nos turnos que cobre — ${((1 - p.produtividadeRH / avgProd) * 100).toFixed(0)}% abaixo da média da loja (R$ ${avgProd.toFixed(0)}/h). Custo/h: R$ ${p.custoHora.toFixed(0)}. Considere realocar para turnos de maior movimento. (Métrica: receita dos turnos cobertos, compartilhada com colegas.)`,
        actionCategory: "pessoas",
        actionTitle: `Avaliar realocação de ${p.name} para turnos de maior venda`,
      });
    }
  }


  // Trigger 7: Realocação pico × morto — conecta os dois insights numa ação concreta
  // Identifica pares: bloco morto (prod < 50% meta, person-hours > 0) + bloco pico (prod > 2x meta)
  // no mesmo dia da semana, e sugere mover N pessoas do morto para o pico.
  const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  for (let dow = 0; dow < 7; dow++) {
    const dayKey = String(dow);
    // Blocos mortos neste dia da semana (prod < 50% meta, com gente)
    const mortos = Array.from(blockDayMap.entries())
      .filter(([k]) => k.endsWith(`-${dayKey}`))
      .map(([, entries]) => entries)
      .filter(entries => {
        const avg = entries.reduce((s: number, e: BlockProductivity) => s + e.productivity, 0) / entries.length;
        const avgPH = entries.reduce((s: number, e: BlockProductivity) => s + e.personHours, 0) / entries.length;
        return avg < productivityTarget * 0.5 && avgPH > 0;
      });
    // Blocos pico neste dia da semana (prod > 2x meta)
    const picos = Array.from(blockDayMap.entries())
      .filter(([k]) => k.endsWith(`-${dayKey}`))
      .map(([, entries]) => entries)
      .filter(entries => {
        const avg = entries.reduce((s: number, e: BlockProductivity) => s + e.productivity, 0) / entries.length;
        return avg > productivityTarget * 2;
      });
    if (mortos.length > 0 && picos.length > 0) {
      const morto = mortos[0];
      const pico = picos[0];
      const avgMortoPH = morto.reduce((s: number, e: BlockProductivity) => s + e.personHours, 0) / morto.length;
      const avgMortoProd = morto.reduce((s: number, e: BlockProductivity) => s + e.productivity, 0) / morto.length;
      const avgPicoProd = pico.reduce((s: number, e: BlockProductivity) => s + e.productivity, 0) / pico.length;
      const blockMortoDuration = morto[0] ? (morto[0].personHours / Math.max(1, Math.round(morto[0].personHours / 6))) : 6;
      const pessoasMorto = Math.round(avgMortoPH / Math.max(1, blockMortoDuration));
      // Sugerir mover 1 pessoa (ou mais se houver folga)
      const nMover = Math.max(1, Math.floor(pessoasMorto / 2));
      suggestions.push({
        type: "opportunity",
        trigger: "reallocation_peak_dead",
        title: `Realoque ${nMover} pessoa(s) do horário morto para o pico na ${dayNames[dow]}`,
        description: `Na ${dayNames[dow]}, o turno "${morto[0].blockName}" tem produtividade média de R$ ${avgMortoProd.toFixed(0)}/h-pessoa (${pessoasMorto} pessoa(s) escalada(s)) enquanto o turno "${pico[0].blockName}" está com R$ ${avgPicoProd.toFixed(0)}/h-pessoa — ${(avgPicoProd / productivityTarget).toFixed(1)}× a meta, indicando falta de pessoal. Mover ${nMover} pessoa(s) do turno morto para o pico pode aumentar a venda sem aumentar a folha.`,
        estimatedSaving: nMover * avgPicoProd * blockMortoDuration * 4, // estimativa mensal
        actionCategory: "pessoas",
        actionTitle: `Realocar ${nMover} pessoa(s) de "${morto[0].blockName}" para "${pico[0].blockName}" na ${dayNames[dow]}`,
      });
    }
  }

  return suggestions;
}

// ─── Payroll Summary ──────────────────────────────────────────────────────────

export async function getPayrollSummary(
  storeId: number,
  chargesPercent: number,
  monthlyRevenue?: number,
  budgetedPayroll?: number
): Promise<{
  activeCount: number;
  estimatedMonthlyPayroll: number;
  budgetedPayroll: number;
  gap: number;
  payrollPercent: number | null;
  monthlyRevenue: number | null;
}> {
  const employees = await getEmployees(storeId);
  const active = employees.filter(e => e.status !== "inactive");

  const estimatedMonthlyPayroll = active.reduce((sum, emp) => {
    const { monthlyCost } = calcEmployeeCosts(emp, chargesPercent);
    return sum + monthlyCost;
  }, 0);

  const budgeted = budgetedPayroll ?? 0;
  const gap = estimatedMonthlyPayroll - budgeted;

  // Se monthlyRevenue não foi passado, buscar a receita acumulada do mês atual via daily_entries
  let resolvedRevenue = monthlyRevenue;
  if (resolvedRevenue == null || resolvedRevenue <= 0) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const from = `${y}-${m}-01`;
    const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
    const entries = await getDailyEntries(storeId, from, to);
    resolvedRevenue = entries.reduce((sum, e) => sum + parseFloat(e.revenue ?? "0"), 0);
  }

  const payrollPercent = resolvedRevenue && resolvedRevenue > 0
    ? (estimatedMonthlyPayroll / resolvedRevenue) * 100
    : null;

  return {
    activeCount: active.length,
    estimatedMonthlyPayroll,
    budgetedPayroll: budgeted,
    gap,
    payrollPercent,
    monthlyRevenue: resolvedRevenue && resolvedRevenue > 0 ? resolvedRevenue : null,
  };
}

export type PersonProductivity = {
  employeeId: number;
  name: string;
  role: string;
  horasTrabalhadas: number;   // horas escaladas no período
  receitaCoberta: number;     // soma da receita das horas dos turnos cobertos (compartilhada)
  produtividadeRH: number;    // R$/h (receita coberta / horas trabalhadas)
  custoHora: number;          // custo/h do funcionário
  razaoReceitaCusto: number;  // produtividadeRH / custoHora (> 1 = receita > custo)
  status: "green" | "amber" | "red";
};

/**
 * Calcula a produtividade por pessoa no período.
 * ATENÇÃO: receitaCoberta é a receita dos turnos em que a pessoa foi escalada —
 * é uma métrica de "exposição a venda" (compartilhada entre colegas do mesmo turno),
 * NÃO venda exclusiva. Use para comparar quem cobre os turnos mais/menos rentáveis.
 */
export async function calcPersonProductivity(
  storeId: number,
  startDate: string,
  endDate: string,
  chargesPercent: number,
  productivityTarget: number
): Promise<PersonProductivity[]> {
  const blocks = await getShiftBlocks(storeId);
  const employees = await getEmployees(storeId);
  const scheduleEntries = await getScheduleForWeek(storeId, startDate, endDate);
  const revenueEntries = await getHourlyRevenueForWeek(storeId, startDate, endDate);

  // Mapa de custo/hora por funcionário
  const empCostMap = new Map<number, number>();
  for (const emp of employees) {
    const { hourlyRate } = calcEmployeeCosts(emp, chargesPercent);
    empCostMap.set(emp.id, hourlyRate);
  }

  // Mapa de receita: date → hour → revenue
  const revMap = new Map<string, Map<number, number>>();
  for (const r of revenueEntries) {
    if (!revMap.has(r.revenueDate)) revMap.set(r.revenueDate, new Map());
    revMap.get(r.revenueDate)!.set(r.hour, r.revenue);
  }

  // Mapa de blocos por id
  const blockMap = new Map(blocks.map(b => [b.id, b]));

  // Acumuladores por pessoa
  const personHorasMap = new Map<number, number>();
  const personReceitaMap = new Map<number, number>();

  for (const s of scheduleEntries) {
    const block = blockMap.get(s.shiftBlockId);
    if (!block) continue;
    const duration = blockDurationHours(block);
    // Horas trabalhadas
    personHorasMap.set(s.employeeId, (personHorasMap.get(s.employeeId) ?? 0) + duration);
    // Receita coberta: soma das horas do bloco naquele dia (com cross-midnight)
    const dayRevMap = revMap.get(s.workDate) ?? new Map();
    let receitaBloco = 0;
    for (const h of blockHours(block)) {
      const isAfterMidnight = block.endMinute <= block.startMinute && h < Math.floor(block.startMinute / 60);
      const revDate = isAfterMidnight
        ? (() => { const nd = new Date(s.workDate); nd.setDate(nd.getDate() + 1); return nd.toISOString().split("T")[0]; })()
        : s.workDate;
      const revDayMap = revDate === s.workDate ? dayRevMap : (revMap.get(revDate) ?? new Map());
      receitaBloco += revDayMap.get(h) ?? 0;
    }
    personReceitaMap.set(s.employeeId, (personReceitaMap.get(s.employeeId) ?? 0) + receitaBloco);
  }

  // Montar ranking
  const results: PersonProductivity[] = [];
  for (const emp of employees) {
    const horas = personHorasMap.get(emp.id) ?? 0;
    if (horas === 0) continue; // não escalado no período
    const receita = personReceitaMap.get(emp.id) ?? 0;
    const prodRH = horas > 0 ? receita / horas : 0;
    const custoH = empCostMap.get(emp.id) ?? 0;
    const razao = custoH > 0 ? prodRH / custoH : 0;
    const status: "green" | "amber" | "red" =
      prodRH >= productivityTarget ? "green" :
      prodRH >= productivityTarget * 0.5 ? "amber" : "red";
    results.push({
      employeeId: emp.id,
      name: emp.name,
      role: emp.role,
      horasTrabalhadas: horas,
      receitaCoberta: receita,
      produtividadeRH: prodRH,
      custoHora: custoH,
      razaoReceitaCusto: razao,
      status,
    });
  }

  // Ordenar por produtividadeRH desc
  return results.sort((a, b) => b.produtividadeRH - a.produtividadeRH);
}

export async function getTurnoverStats(
  storeId: number,
  period?: string // YYYY-MM, padrão = mês corrente
): Promise<{
  hiresThisMonth: number;
  terminationsThisMonth: number;
  turnoverRate: number;
  avgTenureDays: number;
}> {
  const db = await getDb();
  if (!db) return { hiresThisMonth: 0, terminationsThisMonth: 0, turnoverRate: 0, avgTenureDays: 0 };

  const now = new Date();
  let monthStart: string;
  let monthEnd: string;
  if (period) {
    const [y, m] = period.split("-").map(Number);
    monthStart = `${period}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    monthEnd = `${period}-${String(lastDay).padStart(2, "0")}`;
  } else {
    monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    monthEnd = now.toISOString().split("T")[0];
  }

  const [rows] = await (db as any).$client.promise().execute(
    `SELECT movementType, COUNT(*) as cnt
     FROM staff_movements
     WHERE storeId = ? AND movementDate BETWEEN ? AND ?
     GROUP BY movementType`,
    [storeId, monthStart, monthEnd]
  );

  let hiresThisMonth = 0;
  let terminationsThisMonth = 0;
  for (const r of rows as any[]) {
    if (r.movementType === "hire") hiresThisMonth = Number(r.cnt);
    if (r.movementType === "termination") terminationsThisMonth = Number(r.cnt);
  }

  const employees = await getEmployees(storeId, true);
  const active = employees.filter(e => e.status !== "inactive");
  const quadroMedio = active.length + terminationsThisMonth / 2;
  // Fórmula clássica de rotatividade: (admissões + desligamentos) / 2 / quadroMédio * 100
  const turnoverRate = quadroMedio > 0
    ? ((hiresThisMonth + terminationsThisMonth) / 2 / quadroMedio) * 100
    : 0;

  // Average tenure
  const today = new Date();
  const avgTenureDays = active.length > 0
    ? active.reduce((sum, e) => {
        const hire = new Date(e.hireDate);
        return sum + Math.floor((today.getTime() - hire.getTime()) / 86400000);
      }, 0) / active.length
    : 0;

  return { hiresThisMonth, terminationsThisMonth, turnoverRate, avgTenureDays };
}

/**
 * Agrega o turnover de todas as lojas (visão rede) para um período.
 * Retorna array ordenado por turnoverRate desc.
 */
export async function getNetworkTurnoverStats(
  storeIds: number[],
  period?: string
): Promise<Array<{ storeId: number; hiresThisMonth: number; terminationsThisMonth: number; turnoverRate: number; avgTenureDays: number }>> {
  const results = await Promise.all(
    storeIds.map(async (id) => {
      const stats = await getTurnoverStats(id, period);
      return { storeId: id, ...stats };
    })
  );
  return results.sort((a, b) => b.turnoverRate - a.turnoverRate);
}
