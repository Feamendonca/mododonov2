import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { bigint, date, tinyint, uniqueIndex } from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "supervisor", "gerente"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Stores (Lojas) ──────────────────────────────────────────────────────────
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  location: varchar("location", { length: 128 }),
  managerName: varchar("managerName", { length: 128 }),
  // Orçamento mensal
  budgetRevenue: decimal("budgetRevenue", { precision: 12, scale: 2 }).default("0"),
  budgetCmvPct: decimal("budgetCmvPct", { precision: 5, scale: 2 }).default("30"),
  budgetPackagingPct: decimal("budgetPackagingPct", { precision: 5, scale: 2 }).default("4"),
  budgetTaxesPct: decimal("budgetTaxesPct", { precision: 5, scale: 2 }).default("3"),
  budgetFixedCosts: decimal("budgetFixedCosts", { precision: 12, scale: 2 }).default("0"),
  // Pesos por dia da semana (JSON array [dom, seg, ter, qua, qui, sex, sab])
  dayWeights: json("dayWeights").$type<number[]>(),
  // Qualidade
  qualityGoogle: decimal("qualityGoogle", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityAudit: decimal("qualityAudit", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityChecklist: decimal("qualityChecklist", { precision: 5, scale: 2 }), // NULL = sem apontamento
  sanitaryGate: boolean("sanitaryGate").default(true),
  /** Google Place ID da loja — quando preenchido, qualityGoogle vem automaticamente do Places API. */
  googlePlaceId: varchar("googlePlaceId", { length: 255 }),
  // Gatilhos de elegibilidade
  gateAbsences: boolean("gateAbsences").default(true),
  gateEvaluation: boolean("gateEvaluation").default(true),
  gateSanctions: boolean("gateSanctions").default(true),
  // Tipo de operação (define comportamento base de feriados)
  operationType: mysqlEnum("operationType", ["aeroporto", "mall", "rua", "corporativo", "universitario"]).default("rua"),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /** CMV Teórico: quando true, a tela Estoque exibe comparativo CMV real vs teórico (migration 0018) */
  usaCmvTeorico: boolean("usaCmvTeorico").default(false),
  /** Segmento operacional (ex.: 'massas', 'hamburgueria'). NULL = não classificada. Migration 0021. */
  segmento: varchar("segmento", { length: 50 }),
  /** Faixa de faturamento calculada automaticamente. 'ate_300k' | '300k_600k' | 'acima_600k'. Migration 0021. */
  faixaFaturamento: varchar("faixaFaturamento", { length: 20 }),
});

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

// ─── User ↔ Store link ───────────────────────────────────────────────────────
export const userStores = mysqlTable("user_stores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storeId: int("storeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Daily Entries (Lançamentos Diários) ─────────────────────────────────────
export const dailyEntries = mysqlTable("daily_entries", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  entryDate: varchar("entryDate", { length: 10 }).notNull(), // YYYY-MM-DD
  revenue: decimal("revenue", { precision: 12, scale: 2 }).default("0"),
  invoices: decimal("invoices", { precision: 12, scale: 2 }).default("0"), // notas de entrada
  extraLabor: decimal("extraLabor", { precision: 12, scale: 2 }).default("0"), // mão de obra extra
  atendimentos: int("atendimentos").default(0), // número de atendimentos do dia
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyEntry = typeof dailyEntries.$inferSelect;
export type InsertDailyEntry = typeof dailyEntries.$inferInsert;

// ─── Stock Items (Itens de Estoque — Curva ABC) ───────────────────────────────
export const stockItems = mysqlTable("stock_items", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("kg"),
  curve: mysqlEnum("curve", ["A", "B", "C"]).default("B"),
  avgCost: decimal("avgCost", { precision: 10, scale: 2 }).default("0"),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockItem = typeof stockItems.$inferSelect;

// ─── Stock Counts (Contagens de Estoque) ─────────────────────────────────────
export const stockCounts = mysqlTable("stock_counts", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  countDate: varchar("countDate", { length: 10 }).notNull(), // YYYY-MM-DD
  totalValue: decimal("totalValue", { precision: 12, scale: 2 }).notNull(),
  countType: mysqlEnum("countType", ["initial", "weekly", "monthly"]).default("weekly"),
  items: json("items").$type<{ itemId: number; qty: number; cost: number }[]>(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockCount = typeof stockCounts.$inferSelect;
export type InsertStockCount = typeof stockCounts.$inferInsert;

// ─── Action Plans (Plano de Ação) ─────────────────────────────────────────────
export const actionPlans = mysqlTable("action_plans", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  category: mysqlEnum("category", ["cmv", "experience", "revenue", "people", "discipline", "other"]).notNull(),
  description: text("description").notNull(),
  reason: text("reason"),
  dueDate: varchar("dueDate", { length: 10 }), // YYYY-MM-DD
  responsible: varchar("responsible", { length: 128 }),
  status: mysqlEnum("status", ["todo", "doing", "done", "failed", "cancelled"]).default("todo"),
  result: text("result"),
  isSuggestion: boolean("isSuggestion").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  medidaId: int("medida_id"),  // FK lógica para medidas_direcao.id (nullable — ações avulsas ficam null)
  semanaInicio: int("semanaInicio"),        // 1-4: semana do mês em que a ação começa (guia semanal, migration 0023)
  checkpointNumerico: text("checkpointNumerico"), // número que o gerente olha para saber se está funcionando
  acaoSeEstourar: text("acaoSeEstourar"),   // o que fazer se o checkpoint estourar
});

export type ActionPlan = typeof actionPlans.$inferSelect;
export type InsertActionPlan = typeof actionPlans.$inferInsert;

// ─── Commitments (Compromisso Digital) ───────────────────────────────────────
export const commitments = mysqlTable("commitments", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  signed: boolean("signed").default(false),
  signedAt: timestamp("signedAt"),
  signedBy: varchar("signedBy", { length: 128 }),
  // Bloco 1: Experiência do cliente
  reviewsTarget: int("reviewsTarget").default(30),
  tableResponseHours: int("tableResponseHours").default(24),
  googleResponseHours: int("googleResponseHours").default(48),
  trainTeam: boolean("trainTeam").default(false),
  actOnStandard: boolean("actOnStandard").default(false),
  joinCommunity: boolean("joinCommunity").default(false),
  // Bloco 2: Disciplina diária
  doPreShift: boolean("doPreShift").default(false),
  doAppEntry: boolean("doAppEntry").default(false),
  doWeeklyMeeting: boolean("doWeeklyMeeting").default(false),
  // Bloco 3: CMV / estoque
  doInitialCount: boolean("doInitialCount").default(false),
  doWeeklyCount: boolean("doWeeklyCount").default(false),
  doMonthlyCount: boolean("doMonthlyCount").default(false),
  // Bloco 4: Crescimento como gestor
  readTrails: boolean("readTrails").default(false),
  joinCouncil: boolean("joinCouncil").default(false),
  applyContent: boolean("applyContent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Commitment = typeof commitments.$inferSelect;
export type InsertCommitment = typeof commitments.$inferInsert;

// ─── Trail Completions (Trilhas Concluídas) ───────────────────────────────────
export const trailCompletions = mysqlTable("trail_completions", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  moduleId: varchar("moduleId", { length: 64 }).notNull(),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
});

export type TrailCompletion = typeof trailCompletions.$inferSelect;

// ─── Customer Occurrences (Experiência do Cliente) ────────────────────────────
export const customerOccurrences = mysqlTable("customer_occurrences", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  occurrenceDate: varchar("occurrenceDate", { length: 10 }).notNull(), // YYYY-MM-DD
  type: mysqlEnum("type", ["complaint", "compliment", "suggestion", "google_review"]).notNull(),
  rating: int("rating"), // 1-5 stars
  description: text("description").notNull(),
  actionTaken: text("actionTaken"),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolvedAt"),
  linkedActionId: int("linkedActionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerOccurrence = typeof customerOccurrences.$inferSelect;
export type InsertCustomerOccurrence = typeof customerOccurrences.$inferInsert;

// ─── Monthly Quality (Qualidade Mensal) ───────────────────────────────────────
export const monthlyQuality = mysqlTable("monthly_quality", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  qualityGoogle: decimal("qualityGoogle", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityAudit: decimal("qualityAudit", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityChecklist: decimal("qualityChecklist", { precision: 5, scale: 2 }), // NULL = sem apontamento
  sanitaryGate: boolean("sanitaryGate").default(true),
  // Proveniência (Bloco C) — quem/como cada campo foi gerado
  googleFonte: mysqlEnum("googleFonte", ["calculado", "manual"]),  // NULL = nunca apontado
  googleUpdatedBy: varchar("googleUpdatedBy", { length: 128 }),    // nome ou "migração"
  googleUpdatedAt: timestamp("googleUpdatedAt"),
  auditFonte: mysqlEnum("auditFonte", ["calculado", "manual"]),
  auditUpdatedBy: varchar("auditUpdatedBy", { length: 128 }),
  auditUpdatedAt: timestamp("auditUpdatedAt"),
  checklistFonte: mysqlEnum("checklistFonte", ["calculado", "manual"]),
  checklistUpdatedBy: varchar("checklistUpdatedBy", { length: 128 }),
  checklistUpdatedAt: timestamp("checklistUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MonthlyQuality = typeof monthlyQuality.$inferSelect;

// ─── Gatilhos Mensais (Elegibilidade por Pessoa/Mês) ────────────────────────────────────
export const gatilhosMensais = mysqlTable("gatilhos_mensais", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  storeId: int("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  semFaltasInjustificadas: boolean("semFaltasInjustificadas"), // NULL = não apontado
  avaliacaoDesempenho: decimal("avaliacaoDesempenho", { precision: 4, scale: 2 }), // NULL = não apontado
  semSancoes: boolean("semSancoes"), // NULL = não apontado
  // Proveniência
  fonte: mysqlEnum("fonte", ["calculado", "manual"]).default("manual"),
  updatedBy: varchar("updatedBy", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GatilhoMensal = typeof gatilhosMensais.$inferSelect;
export type InsertGatilhoMensal = typeof gatilhosMensais.$inferInsert;

// ─── Holiday Calendars (Calendário de Feriados) ───────────────────────────────────────
export const holidayCalendars = mysqlTable("holiday_calendars", {
  id: int("id").autoincrement().primaryKey(),
  // Data no formato YYYY-MM-DD
  holidayDate: varchar("holiday_date", { length: 10 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  // feriado = dia do feriado, vespera = véspera, ponto_facultativo = ponto facultativo
  eventType: mysqlEnum("event_type", ["feriado", "vespera", "ponto_facultativo"]).notNull().default("feriado"),
  // Abrangência: nacional, estadual, municipal
  scope: mysqlEnum("scope", ["nacional", "estadual", "municipal"]).default("nacional"),
  uf: varchar("uf", { length: 2 }),
  municipio: varchar("municipio", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HolidayCalendar = typeof holidayCalendars.$inferSelect;
export type InsertHolidayCalendar = typeof holidayCalendars.$inferInsert;

// ─── Store Holiday Rules (Regras de Multiplicador por Loja) ──────────────────────
export const storeHolidayRules = mysqlTable("store_holiday_rules", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("store_id").notNull(),
  // Data no formato YYYY-MM-DD (pode ser feriado ou véspera)
  ruleDate: varchar("rule_date", { length: 10 }).notNull(),
  eventType: mysqlEnum("event_type", ["feriado", "vespera", "ponto_facultativo"]).notNull().default("feriado"),
  // Multiplicador sobre a meta diária base (ex: 1.3 = 30% acima, 0.6 = 40% abaixo, 0 = fechado)
  multiplier: decimal("multiplier", { precision: 5, scale: 3 }).notNull().default("1.000"),
  // fonte: ia = sugerido pela IA, manual = ajustado manualmente pelo admin/gerente
  source: mysqlEnum("source", ["ia", "manual"]).default("ia"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StoreHolidayRule = typeof storeHolidayRules.$inferSelect;
export type InsertStoreHolidayRule = typeof storeHolidayRules.$inferInsert;

// ─── Pessoas — Employees ──────────────────────────────────────────────────────
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  salaryBase: decimal("salaryBase", { precision: 10, scale: 2 }).notNull().default("0"),
  transportAllowance: decimal("transportAllowance", { precision: 10, scale: 2 }).notNull().default("0"),
  mealAllowance: decimal("mealAllowance", { precision: 10, scale: 2 }).notNull().default("0"),
  otherBenefits: decimal("otherBenefits", { precision: 10, scale: 2 }).notNull().default("0"),
  hoursPerMonth: int("hoursPerMonth").notNull().default(220),
  hireDate: date("hireDate").notNull(),
  status: mysqlEnum("status", ["active", "probation", "inactive"]).notNull().default("active"),
  papelRemuneravel: mysqlEnum("papelRemuneravel", ["nenhum", "gestor", "lider"]).notNull().default("nenhum"),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type EmployeeRow = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// ─── Pessoas — Shift Blocks ───────────────────────────────────────────────────
export const shiftBlocks = mysqlTable("shift_blocks", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  startHour: int("startHour").notNull(),
  endHour: int("endHour").notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  startMinute: int("startMinute").notNull().default(0),
  endMinute: int("endMinute").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type ShiftBlockRow = typeof shiftBlocks.$inferSelect;
export type InsertShiftBlock = typeof shiftBlocks.$inferInsert;

// ─── Pessoas — Schedules ──────────────────────────────────────────────────────
export const schedules = mysqlTable("schedules", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  shiftBlockId: int("shiftBlockId").notNull(),
  employeeId: int("employeeId").notNull(),
  workDate: date("workDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  uqSchedule: uniqueIndex("uq_schedule").on(t.storeId, t.shiftBlockId, t.employeeId, t.workDate),
}));
export type ScheduleRow = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

// ─── Pessoas — Hourly Revenue ─────────────────────────────────────────────────
export const hourlyRevenue = mysqlTable("hourly_revenue", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  revenueDate: date("revenueDate").notNull(),
  hour: int("hour").notNull(),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
}, (t) => ({
  uqHourlyRevenue: uniqueIndex("uq_hourly_revenue").on(t.storeId, t.revenueDate, t.hour),
}));
export type HourlyRevenueRow = typeof hourlyRevenue.$inferSelect;
export type InsertHourlyRevenue = typeof hourlyRevenue.$inferInsert;

// ─── Pessoas — Staff Movements ────────────────────────────────────────────────
export const staffMovements = mysqlTable("staff_movements", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  employeeId: int("employeeId").notNull(),
  movementType: mysqlEnum("movementType", ["hire", "termination", "role_change", "salary_change"]).notNull(),
  movementDate: date("movementDate").notNull(),
  reason: text("reason"),
  previousValue: varchar("previousValue", { length: 256 }),
  newValue: varchar("newValue", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type StaffMovementRow = typeof staffMovements.$inferSelect;
export type InsertStaffMovement = typeof staffMovements.$inferInsert;

// ─── Pessoas — Store People Config ───────────────────────────────────────────
export const storePeopleConfig = mysqlTable("store_people_config", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().unique(),
  chargesPercent: decimal("chargesPercent", { precision: 5, scale: 2 }).notNull().default("70.00"),
  productivityTarget: decimal("productivityTarget", { precision: 10, scale: 2 }).notNull().default("200.00"),
  payrollTargetPercent: decimal("payrollTargetPercent", { precision: 5, scale: 2 }).notNull().default("18.00"),
  hiringCost: decimal("hiringCost", { precision: 10, scale: 2 }).notNull().default("1500.00"),
  operationStartHour: int("operationStartHour").notNull().default(8),
  operationEndHour: int("operationEndHour").notNull().default(23),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type StorePeopleConfigRow = typeof storePeopleConfig.$inferSelect;
export type InsertStorePeopleConfig = typeof storePeopleConfig.$inferInsert;

// ─── Sistema 2: Estoque / CMV ─────────────────────────────────────────────────

export const stockProducts = mysqlTable("stock_products", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull().default("KG"),
  unitCost: decimal("unitCost", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  curveABC: mysqlEnum("curveABC", ["A", "B", "C"]).notNull().default("B"),
  active: boolean("active").notNull().default(true),
  categoryId: int("categoryId"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type StockProductRow = typeof stockProducts.$inferSelect;

export const stockPeriods = mysqlTable("stock_periods", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  weekNumber: int("weekNumber").notNull(),
  year: int("year").notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
  // CMV Teórico — preenchidos ao fechar o período (migration 0018)
  cmvTeoricoRs: decimal("cmvTeoricoRs", { precision: 14, scale: 2 }),
  cmvTeoricoReceita: decimal("cmvTeoricoReceita", { precision: 14, scale: 2 }),
  cmvTeoricoPct: decimal("cmvTeoricoPct", { precision: 8, scale: 4 }),
  dispersaoRs: decimal("dispersaoRs", { precision: 14, scale: 2 }),
  dispersaoPct: decimal("dispersaoPct", { precision: 8, scale: 4 }),
});
export type StockPeriodRow = typeof stockPeriods.$inferSelect;

// stock_movements: consumption e cmvValue são colunas GENERATED ALWAYS AS STORED no banco.
//   consumption = COALESCE(openingStock,0) + COALESCE(purchases,0) - COALESCE(closingStock,0)
//   cmvValue    = COALESCE(openingCost,0)  + COALESCE(purchasesCost,0) - COALESCE(closingCost,0)
// Drizzle não suporta colunas GENERATED nativamente — omitidas aqui intencionalmente.
// O banco as cria via migration 0011 (drizzle/0011_stock_movements_fix.sql).
// O UNIQUE KEY uq_stock_movement(periodId, productId) também é criado pela migration 0011.
// NÃO incluir consumption/cmvValue no INSERT de upsertStockMovement — MySQL rejeita.
export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  periodId: int("periodId").notNull(),
  productId: int("productId").notNull(),
  storeId: int("storeId").notNull(),
  openingStock: decimal("openingStock", { precision: 10, scale: 3 }).default("0"),
  purchases: decimal("purchases", { precision: 10, scale: 3 }).default("0"),
  closingStock: decimal("closingStock", { precision: 10, scale: 3 }).default("0"),
  openingCost: decimal("openingCost", { precision: 10, scale: 2 }).default("0"),
  purchasesCost: decimal("purchasesCost", { precision: 10, scale: 2 }).default("0"),
  closingCost: decimal("closingCost", { precision: 10, scale: 2 }).default("0"),
  alertFlags: json("alertFlags"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});
export type StockMovementRow = typeof stockMovements.$inferSelect;

export const purchaseEntries = mysqlTable("purchase_entries", {
  id: int("id").autoincrement().primaryKey(),
  periodId: int("periodId").notNull(),
  storeId: int("storeId").notNull(),
  supplier: varchar("supplier", { length: 255 }),
  categoryId: int("categoryId"),
  invoiceNumber: varchar("invoiceNumber", { length: 100 }),
  invoiceDate: varchar("invoiceDate", { length: 10 }),
  totalValue: decimal("totalValue", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type PurchaseEntryRow = typeof purchaseEntries.$inferSelect;

// ─── Cron Executions ─────────────────────────────────────────────────────────
// Tabela de idempotência para handlers de cron (server/scheduled/).
// UNIQUE(handler, run_date) garante que cada handler rode no máximo 1x por data.
// Criada pela migration 0012.
export const cronExecutions = mysqlTable("cron_executions", {
  id: int("id").primaryKey().autoincrement(),
  handler: varchar("handler", { length: 128 }).notNull(),
  runDate: date("run_date").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqHandlerDate: uniqueIndex("uq_cron_handler_date").on(t.handler, t.runDate),
}));
export type CronExecutionRow = typeof cronExecutions.$inferSelect;

// ─── Remuneração ─────────────────────────────────────────────────────────────
// Tabelas do módulo de remuneração variável (Modo Dono).
// Espelham fielmente as tabelas criadas via scripts/setup-real-ops.ts.
// Todas as colunas monetárias (R$) são decimal(15,2) — sem float.
// Criadas pela migration 0013 (idempotente: CREATE TABLE IF NOT EXISTS).

/** Configuração de remuneração por loja (parâmetros do programa). */
export const remuneracaoConfig = mysqlTable("remuneracao_config", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("loja_id").notNull(),
  ativa: tinyint("ativa").default(1),
  bonusBasePctFaturamento: decimal("bonus_base_pct_faturamento", { precision: 6, scale: 4 }).default("0.0150"),
  gatilhoMinimoPct: decimal("gatilho_minimo_pct", { precision: 5, scale: 2 }).default("80.00"),
  tetoMaximoPct: decimal("teto_maximo_pct", { precision: 5, scale: 2 }).default("120.00"),
  descricao: text("descricao"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type RemuneracaoConfigRow = typeof remuneracaoConfig.$inferSelect;

/** Regras de desconto vinculadas a uma configuração (gatilhos de elegibilidade). */
export const remuneracaoRegras = mysqlTable("remuneracao_regras", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("config_id").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  tipo: varchar("tipo", { length: 20 }).default("manual"),
  indicador: varchar("indicador", { length: 50 }).default("custom"),
  metaValor: decimal("meta_valor", { precision: 15, scale: 4 }),
  metaOperador: varchar("meta_operador", { length: 10 }).default("gte"),
  descontoPct: decimal("desconto_pct", { precision: 5, scale: 2 }).notNull().default("25.00"),
  ordem: int("ordem").default(0),
  ativa: tinyint("ativa").default(1),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type RemuneracaoRegraRow = typeof remuneracaoRegras.$inferSelect;

/** Apuração mensal de remuneração por loja/pessoa. */
export const remuneracaoApuracao = mysqlTable("remuneracao_apuracao", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("loja_id").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  faturamentoReal: decimal("faturamento_real", { precision: 15, scale: 2 }),
  bonusBaseRs: decimal("bonus_base_rs", { precision: 15, scale: 2 }),
  resultadoAtingimentoPct: decimal("resultado_atingimento_pct", { precision: 5, scale: 2 }),
  /** Variável final em R$ — sempre decimal(15,2), nunca float. */
  bonusFinalRs: decimal("bonus_final_rs", { precision: 15, scale: 2 }),
  status: varchar("status", { length: 20 }).default("rascunho"),
  observacao: text("observacao"),
  aprovadoPor: varchar("aprovado_por", { length: 200 }),
  aprovadoEm: bigint("aprovado_em", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  employeeId: int("employee_id"),
  papel: mysqlEnum("papel", ["gestor", "lider"]),
  legado: tinyint("legado").notNull().default(0),
  extratoJson: json("extrato_json"),
});
export type RemuneracaoApuracaoRow = typeof remuneracaoApuracao.$inferSelect;

/** Snapshot mensal da avaliação Google Places (apenas AGREGADO — sem texto de reviews individuais, conforme ToS). */
export const googleRatings = mysqlTable("google_ratings", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  rating: decimal("rating", { precision: 2, scale: 1 }).notNull(), // ex: 4.3
  totalRatings: int("totalRatings").notNull(),
  nota: decimal("nota", { precision: 5, scale: 2 }).notNull(), // rating × 20
  fetchedAt: bigint("fetchedAt", { mode: "number" }).notNull(),
});
export type GoogleRatingRow = typeof googleRatings.$inferSelect;

// ─── Metas do Mês (MIC 4DX) ──────────────────────────────────────────────────
// Tabelas criadas antes do Drizzle ser adotado — declaradas aqui para manter o
// schema em controle de versão. Migration 0017 garante idempotência.
export const metas = mysqlTable("metas", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("loja_id").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  valorMeta: decimal("valor_meta", { precision: 15, scale: 2 }),
  unidade: varchar("unidade", { length: 50 }).default("R$"),
  descricao: text("descricao"),
  status: varchar("status", { length: 20 }).default("ativa"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type MetaRow = typeof metas.$inferSelect;

export const medidasDirecao = mysqlTable("medidas_direcao", {
  id: int("id").autoincrement().primaryKey(),
  metaId: int("meta_id").notNull(),
  lojaId: int("loja_id").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  indicador: varchar("indicador", { length: 50 }).default("custom"),
  metaValor: decimal("meta_valor", { precision: 15, scale: 4 }),
  metaOperador: varchar("meta_operador", { length: 10 }).default("gte"),
  unidade: varchar("unidade", { length: 50 }).default("%"),
  pesoRemuneracaoPct: decimal("peso_remuneracao_pct", { precision: 5, scale: 2 }).default("0"),
  ordem: int("ordem").default(0),
  ativa: tinyint("ativa").default(1),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MedidaDirecaoRow = typeof medidasDirecao.$inferSelect;

export const medidasProgresso = mysqlTable("medidas_progresso", {
  id: int("id").autoincrement().primaryKey(),
  medidaId: int("medida_id").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  valorAtual: decimal("valor_atual", { precision: 15, scale: 4 }),
  atingida: tinyint("atingida").default(0),
  observacao: text("observacao"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type MedidaProgressoRow = typeof medidasProgresso.$inferSelect;

// ─── Despesas do Mês (DRE Viva) ───────────────────────────────────────────────
export const despesasMes = mysqlTable("despesas_mes", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  categoria: varchar("categoria", { length: 50 }).notNull(),
  valor: decimal("valor", { precision: 14, scale: 2 }).notNull(),
  data: date("data").notNull(),
  descricao: varchar("descricao", { length: 500 }),
  fonte: varchar("fonte", { length: 30 }).notNull().default("manual"),
  conferido: tinyint("conferido").notNull().default(0),
  createdBy: int("createdBy"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

// ─── DRE Benchmarks Mensais (Benchmarks por segmento/faixa/rede) ──────────────
export const dreBenchmarksMensais = mysqlTable("dre_benchmarks_mensais", {
  id: int("id").autoincrement().primaryKey(),
  periodo: varchar("periodo", { length: 7 }).notNull(), // YYYY-MM
  /** 'segmento' | 'faixa' | 'rede' */
  nivel: varchar("nivel", { length: 20 }).notNull(),
  /** Valor do segmento/faixa ou 'rede' */
  grupo: varchar("grupo", { length: 50 }).notNull(),
  nLojas: int("n_lojas").notNull().default(0),
  cmvPctMediana: decimal("cmv_pct_mediana", { precision: 8, scale: 4 }),
  cmvPctP25: decimal("cmv_pct_p25", { precision: 8, scale: 4 }),
  cmvPctP75: decimal("cmv_pct_p75", { precision: 8, scale: 4 }),
  encargosPctMediana: decimal("encargos_pct_mediana", { precision: 8, scale: 4 }),
  encargosPctP25: decimal("encargos_pct_p25", { precision: 8, scale: 4 }),
  encargosPctP75: decimal("encargos_pct_p75", { precision: 8, scale: 4 }),
  receitaMediana: decimal("receita_mediana", { precision: 14, scale: 2 }),
  receitaP25: decimal("receita_p25", { precision: 14, scale: 2 }),
  receitaP75: decimal("receita_p75", { precision: 14, scale: 2 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().default(0),
});

export type DreBenchmarkMensal = typeof dreBenchmarksMensais.$inferSelect;
