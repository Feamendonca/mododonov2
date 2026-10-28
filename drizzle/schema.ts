import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersRoleEnum = pgEnum("users_role", ["user", "admin", "supervisor", "gerente"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: usersRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Stores (Lojas) ──────────────────────────────────────────────────────────
export const storesOperationTypeEnum = pgEnum("stores_operation_type", [
  "aeroporto",
  "mall",
  "rua",
  "corporativo",
  "universitario",
]);

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  location: varchar("location", { length: 128 }),
  managerName: varchar("managerName", { length: 128 }),
  // Orçamento mensal
  budgetRevenue: numeric("budgetRevenue", { precision: 12, scale: 2 }).default("0"),
  budgetCmvPct: numeric("budgetCmvPct", { precision: 5, scale: 2 }).default("30"),
  budgetPackagingPct: numeric("budgetPackagingPct", { precision: 5, scale: 2 }).default("4"),
  budgetTaxesPct: numeric("budgetTaxesPct", { precision: 5, scale: 2 }).default("3"),
  budgetFixedCosts: numeric("budgetFixedCosts", { precision: 12, scale: 2 }).default("0"),
  // Pesos por dia da semana (JSON array [dom, seg, ter, qua, qui, sex, sab])
  dayWeights: jsonb("dayWeights").$type<number[]>(),
  // Qualidade
  qualityGoogle: numeric("qualityGoogle", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityAudit: numeric("qualityAudit", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityChecklist: numeric("qualityChecklist", { precision: 5, scale: 2 }), // NULL = sem apontamento
  sanitaryGate: boolean("sanitaryGate").default(true),
  /** Google Place ID da loja — quando preenchido, qualityGoogle vem automaticamente do Places API. */
  googlePlaceId: varchar("googlePlaceId", { length: 255 }),
  // Gatilhos de elegibilidade
  gateAbsences: boolean("gateAbsences").default(true),
  gateEvaluation: boolean("gateEvaluation").default(true),
  gateSanctions: boolean("gateSanctions").default(true),
  // Tipo de operação (define comportamento base de feriados)
  operationType: storesOperationTypeEnum("operationType").default("rua"),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
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
export const userStores = pgTable("user_stores", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  storeId: integer("storeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqUserStore: uniqueIndex("uq_user_store").on(t.userId, t.storeId),
}));

// ─── Daily Entries (Lançamentos Diários) ─────────────────────────────────────
export const dailyEntries = pgTable("daily_entries", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  entryDate: varchar("entryDate", { length: 10 }).notNull(), // YYYY-MM-DD
  revenue: numeric("revenue", { precision: 12, scale: 2 }).default("0"),
  invoices: numeric("invoices", { precision: 12, scale: 2 }).default("0"), // notas de entrada
  extraLabor: numeric("extraLabor", { precision: 12, scale: 2 }).default("0"), // mão de obra extra
  atendimentos: integer("atendimentos").default(0), // número de atendimentos do dia
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  uqDailyEntry: uniqueIndex("uq_daily_entry").on(t.storeId, t.entryDate),
}));

export type DailyEntry = typeof dailyEntries.$inferSelect;
export type InsertDailyEntry = typeof dailyEntries.$inferInsert;

// ─── Stock Items (Itens de Estoque — Curva ABC) ───────────────────────────────
export const stockItemsCurveEnum = pgEnum("stock_items_curve", ["A", "B", "C"]);

export const stockItems = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("kg"),
  curve: stockItemsCurveEnum("curve").default("B"),
  avgCost: numeric("avgCost", { precision: 10, scale: 2 }).default("0"),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockItem = typeof stockItems.$inferSelect;

// ─── Stock Counts (Contagens de Estoque) ─────────────────────────────────────
export const stockCountsCountTypeEnum = pgEnum("stock_counts_count_type", ["initial", "weekly", "monthly"]);

export const stockCounts = pgTable("stock_counts", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  countDate: varchar("countDate", { length: 10 }).notNull(), // YYYY-MM-DD
  totalValue: numeric("totalValue", { precision: 12, scale: 2 }).notNull(),
  countType: stockCountsCountTypeEnum("countType").default("weekly"),
  items: jsonb("items").$type<{ itemId: number; qty: number; cost: number }[]>(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockCount = typeof stockCounts.$inferSelect;
export type InsertStockCount = typeof stockCounts.$inferInsert;

// ─── Action Plans (Plano de Ação) ─────────────────────────────────────────────
export const actionPlansCategoryEnum = pgEnum("action_plans_category", [
  "cmv",
  "experience",
  "revenue",
  "people",
  "discipline",
  "other",
]);
export const actionPlansStatusEnum = pgEnum("action_plans_status", [
  "todo",
  "doing",
  "done",
  "failed",
  "cancelled",
]);

export const actionPlans = pgTable("action_plans", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  category: actionPlansCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  reason: text("reason"),
  dueDate: varchar("dueDate", { length: 10 }), // YYYY-MM-DD
  responsible: varchar("responsible", { length: 128 }),
  status: actionPlansStatusEnum("status").default("todo"),
  result: text("result"),
  isSuggestion: boolean("isSuggestion").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  medidaId: integer("medida_id"),  // FK lógica para medidas_direcao.id (nullable — ações avulsas ficam null)
  semanaInicio: integer("semanaInicio"),        // 1-4: semana do mês em que a ação começa (guia semanal, migration 0023)
  checkpointNumerico: text("checkpointNumerico"), // número que o gerente olha para saber se está funcionando
  acaoSeEstourar: text("acaoSeEstourar"),   // o que fazer se o checkpoint estourar
});

export type ActionPlan = typeof actionPlans.$inferSelect;
export type InsertActionPlan = typeof actionPlans.$inferInsert;

// ─── Commitments (Compromisso Digital) ───────────────────────────────────────
export const commitments = pgTable("commitments", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  signed: boolean("signed").default(false),
  signedAt: timestamp("signedAt"),
  signedBy: varchar("signedBy", { length: 128 }),
  // Bloco 1: Experiência do cliente
  reviewsTarget: integer("reviewsTarget").default(30),
  tableResponseHours: integer("tableResponseHours").default(24),
  googleResponseHours: integer("googleResponseHours").default(48),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  uqCommitment: uniqueIndex("uq_commitment").on(t.storeId, t.period),
}));

export type Commitment = typeof commitments.$inferSelect;
export type InsertCommitment = typeof commitments.$inferInsert;

// ─── Trail Completions (Trilhas Concluídas) ───────────────────────────────────
export const trailCompletions = pgTable("trail_completions", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  moduleId: varchar("moduleId", { length: 64 }).notNull(),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
});

export type TrailCompletion = typeof trailCompletions.$inferSelect;

// ─── Customer Occurrences (Experiência do Cliente) ────────────────────────────
export const customerOccurrencesTypeEnum = pgEnum("customer_occurrences_type", [
  "complaint",
  "compliment",
  "suggestion",
  "google_review",
]);

export const customerOccurrences = pgTable("customer_occurrences", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  occurrenceDate: varchar("occurrenceDate", { length: 10 }).notNull(), // YYYY-MM-DD
  type: customerOccurrencesTypeEnum("type").notNull(),
  rating: integer("rating"), // 1-5 stars
  description: text("description").notNull(),
  actionTaken: text("actionTaken"),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolvedAt"),
  linkedActionId: integer("linkedActionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CustomerOccurrence = typeof customerOccurrences.$inferSelect;
export type InsertCustomerOccurrence = typeof customerOccurrences.$inferInsert;

// ─── Monthly Quality (Qualidade Mensal) ───────────────────────────────────────
export const monthlyQualityGoogleFonteEnum = pgEnum("monthly_quality_google_fonte", ["calculado", "manual"]);
export const monthlyQualityAuditFonteEnum = pgEnum("monthly_quality_audit_fonte", ["calculado", "manual"]);
export const monthlyQualityChecklistFonteEnum = pgEnum("monthly_quality_checklist_fonte", ["calculado", "manual"]);

export const monthlyQuality = pgTable("monthly_quality", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  qualityGoogle: numeric("qualityGoogle", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityAudit: numeric("qualityAudit", { precision: 5, scale: 2 }), // NULL = sem apontamento
  qualityChecklist: numeric("qualityChecklist", { precision: 5, scale: 2 }), // NULL = sem apontamento
  sanitaryGate: boolean("sanitaryGate").default(true),
  // Proveniência (Bloco C) — quem/como cada campo foi gerado
  googleFonte: monthlyQualityGoogleFonteEnum("googleFonte"),  // NULL = nunca apontado
  googleUpdatedBy: varchar("googleUpdatedBy", { length: 128 }),    // nome ou "migração"
  googleUpdatedAt: timestamp("googleUpdatedAt"),
  auditFonte: monthlyQualityAuditFonteEnum("auditFonte"),
  auditUpdatedBy: varchar("auditUpdatedBy", { length: 128 }),
  auditUpdatedAt: timestamp("auditUpdatedAt"),
  checklistFonte: monthlyQualityChecklistFonteEnum("checklistFonte"),
  checklistUpdatedBy: varchar("checklistUpdatedBy", { length: 128 }),
  checklistUpdatedAt: timestamp("checklistUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  uqMonthlyQuality: uniqueIndex("uq_monthly_quality").on(t.storeId, t.period),
}));

export type MonthlyQuality = typeof monthlyQuality.$inferSelect;

// ─── Gatilhos Mensais (Elegibilidade por Pessoa/Mês) ────────────────────────────────────
export const gatilhosMensaisFonteEnum = pgEnum("gatilhos_mensais_fonte", ["calculado", "manual"]);

export const gatilhosMensais = pgTable("gatilhos_mensais", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull(),
  storeId: integer("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  semFaltasInjustificadas: boolean("semFaltasInjustificadas"), // NULL = não apontado
  avaliacaoDesempenho: numeric("avaliacaoDesempenho", { precision: 4, scale: 2 }), // NULL = não apontado
  semSancoes: boolean("semSancoes"), // NULL = não apontado
  // Proveniência
  fonte: gatilhosMensaisFonteEnum("fonte").default("manual"),
  updatedBy: varchar("updatedBy", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqGatilhoMensal: uniqueIndex("uq_gatilho_mensal").on(t.employeeId, t.storeId, t.period),
}));

export type GatilhoMensal = typeof gatilhosMensais.$inferSelect;
export type InsertGatilhoMensal = typeof gatilhosMensais.$inferInsert;

// ─── Holiday Calendars (Calendário de Feriados) ───────────────────────────────────────
export const holidayCalendarsEventTypeEnum = pgEnum("holiday_calendars_event_type", [
  "feriado",
  "vespera",
  "ponto_facultativo",
]);
export const holidayCalendarsScopeEnum = pgEnum("holiday_calendars_scope", ["nacional", "estadual", "municipal"]);

export const holidayCalendars = pgTable("holiday_calendars", {
  id: serial("id").primaryKey(),
  // Data no formato YYYY-MM-DD
  holidayDate: varchar("holiday_date", { length: 10 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  // feriado = dia do feriado, vespera = véspera, ponto_facultativo = ponto facultativo
  eventType: holidayCalendarsEventTypeEnum("event_type").notNull().default("feriado"),
  // Abrangência: nacional, estadual, municipal
  scope: holidayCalendarsScopeEnum("scope").default("nacional"),
  uf: varchar("uf", { length: 2 }),
  municipio: varchar("municipio", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HolidayCalendar = typeof holidayCalendars.$inferSelect;
export type InsertHolidayCalendar = typeof holidayCalendars.$inferInsert;

// ─── Store Holiday Rules (Regras de Multiplicador por Loja) ──────────────────────
export const storeHolidayRulesEventTypeEnum = pgEnum("store_holiday_rules_event_type", [
  "feriado",
  "vespera",
  "ponto_facultativo",
]);
export const storeHolidayRulesSourceEnum = pgEnum("store_holiday_rules_source", ["ia", "manual"]);

export const storeHolidayRules = pgTable("store_holiday_rules", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  // Data no formato YYYY-MM-DD (pode ser feriado ou véspera)
  ruleDate: varchar("rule_date", { length: 10 }).notNull(),
  eventType: storeHolidayRulesEventTypeEnum("event_type").notNull().default("feriado"),
  // Multiplicador sobre a meta diária base (ex: 1.3 = 30% acima, 0.6 = 40% abaixo, 0 = fechado)
  multiplier: numeric("multiplier", { precision: 5, scale: 3 }).notNull().default("1.000"),
  // fonte: ia = sugerido pela IA, manual = ajustado manualmente pelo admin/gerente
  source: storeHolidayRulesSourceEnum("source").default("ia"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  uqStoreHolidayRule: uniqueIndex("uq_store_holiday_rule").on(t.storeId, t.ruleDate),
}));

export type StoreHolidayRule = typeof storeHolidayRules.$inferSelect;
export type InsertStoreHolidayRule = typeof storeHolidayRules.$inferInsert;

// ─── Pessoas — Employees ──────────────────────────────────────────────────────
export const employeesStatusEnum = pgEnum("employees_status", ["active", "probation", "inactive"]);
export const employeesPapelRemuneravelEnum = pgEnum("employees_papel_remuneravel", ["nenhum", "gestor", "lider"]);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  role: varchar("role", { length: 64 }).notNull(),
  salaryBase: numeric("salaryBase", { precision: 10, scale: 2 }).notNull().default("0"),
  transportAllowance: numeric("transportAllowance", { precision: 10, scale: 2 }).notNull().default("0"),
  mealAllowance: numeric("mealAllowance", { precision: 10, scale: 2 }).notNull().default("0"),
  otherBenefits: numeric("otherBenefits", { precision: 10, scale: 2 }).notNull().default("0"),
  hoursPerMonth: integer("hoursPerMonth").notNull().default(220),
  hireDate: date("hireDate").notNull(),
  status: employeesStatusEnum("status").notNull().default("active"),
  papelRemuneravel: employeesPapelRemuneravelEnum("papelRemuneravel").notNull().default("nenhum"),
  userId: integer("userId"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
export type EmployeeRow = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// ─── Pessoas — Shift Blocks ───────────────────────────────────────────────────
export const shiftBlocks = pgTable("shift_blocks", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  startHour: integer("startHour").notNull(),
  endHour: integer("endHour").notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  startMinute: integer("startMinute").notNull().default(0),
  endMinute: integer("endMinute").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
export type ShiftBlockRow = typeof shiftBlocks.$inferSelect;
export type InsertShiftBlock = typeof shiftBlocks.$inferInsert;

// ─── Pessoas — Schedules ──────────────────────────────────────────────────────
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  shiftBlockId: integer("shiftBlockId").notNull(),
  employeeId: integer("employeeId").notNull(),
  workDate: date("workDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (t) => ({
  uqSchedule: uniqueIndex("uq_schedule").on(t.storeId, t.shiftBlockId, t.employeeId, t.workDate),
}));
export type ScheduleRow = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

// ─── Pessoas — Hourly Revenue ─────────────────────────────────────────────────
export const hourlyRevenue = pgTable("hourly_revenue", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  revenueDate: date("revenueDate").notNull(),
  hour: integer("hour").notNull(),
  revenue: numeric("revenue", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (t) => ({
  uqHourlyRevenue: uniqueIndex("uq_hourly_revenue").on(t.storeId, t.revenueDate, t.hour),
}));
export type HourlyRevenueRow = typeof hourlyRevenue.$inferSelect;
export type InsertHourlyRevenue = typeof hourlyRevenue.$inferInsert;

// ─── Pessoas — Staff Movements ────────────────────────────────────────────────
export const staffMovementsMovementTypeEnum = pgEnum("staff_movements_movement_type", [
  "hire",
  "termination",
  "role_change",
  "salary_change",
]);

export const staffMovements = pgTable("staff_movements", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  employeeId: integer("employeeId").notNull(),
  movementType: staffMovementsMovementTypeEnum("movementType").notNull(),
  movementDate: date("movementDate").notNull(),
  reason: text("reason"),
  previousValue: varchar("previousValue", { length: 256 }),
  newValue: varchar("newValue", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type StaffMovementRow = typeof staffMovements.$inferSelect;
export type InsertStaffMovement = typeof staffMovements.$inferInsert;

// ─── Pessoas — Store People Config ───────────────────────────────────────────
export const storePeopleConfig = pgTable("store_people_config", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull().unique(),
  chargesPercent: numeric("chargesPercent", { precision: 5, scale: 2 }).notNull().default("70.00"),
  productivityTarget: numeric("productivityTarget", { precision: 10, scale: 2 }).notNull().default("200.00"),
  payrollTargetPercent: numeric("payrollTargetPercent", { precision: 5, scale: 2 }).notNull().default("18.00"),
  hiringCost: numeric("hiringCost", { precision: 10, scale: 2 }).notNull().default("1500.00"),
  operationStartHour: integer("operationStartHour").notNull().default(8),
  operationEndHour: integer("operationEndHour").notNull().default(23),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
export type StorePeopleConfigRow = typeof storePeopleConfig.$inferSelect;
export type InsertStorePeopleConfig = typeof storePeopleConfig.$inferInsert;

// ─── Sistema 2: Estoque / CMV ─────────────────────────────────────────────────

export const stockProductsCurveABCEnum = pgEnum("stock_products_curve_abc", ["A", "B", "C"]);

export const stockProducts = pgTable("stock_products", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull().default("KG"),
  unitCost: numeric("unitCost", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  curveABC: stockProductsCurveABCEnum("curveABC").notNull().default("B"),
  active: boolean("active").notNull().default(true),
  categoryId: integer("categoryId"),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});
export type StockProductRow = typeof stockProducts.$inferSelect;

export const stockPeriodsStatusEnum = pgEnum("stock_periods_status", ["open", "closed"]);

export const stockPeriods = pgTable("stock_periods", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  weekNumber: integer("weekNumber").notNull(),
  year: integer("year").notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  status: stockPeriodsStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
  // CMV Teórico — preenchidos ao fechar o período (migration 0018)
  cmvTeoricoRs: numeric("cmvTeoricoRs", { precision: 14, scale: 2 }),
  cmvTeoricoReceita: numeric("cmvTeoricoReceita", { precision: 14, scale: 2 }),
  cmvTeoricoPct: numeric("cmvTeoricoPct", { precision: 8, scale: 4 }),
  dispersaoRs: numeric("dispersaoRs", { precision: 14, scale: 2 }),
  dispersaoPct: numeric("dispersaoPct", { precision: 8, scale: 4 }),
});
export type StockPeriodRow = typeof stockPeriods.$inferSelect;

// stock_movements: consumption e cmvValue são colunas GENERATED ALWAYS AS STORED no banco.
//   consumption = COALESCE(openingStock,0) + COALESCE(purchases,0) - COALESCE(closingStock,0)
//   cmvValue    = COALESCE(openingCost,0)  + COALESCE(purchasesCost,0) - COALESCE(closingCost,0)
// Drizzle não suporta colunas GENERATED nativamente — omitidas aqui intencionalmente.
// O banco as cria via migration 0011 (drizzle/0011_stock_movements_fix.sql).
// O UNIQUE KEY uq_stock_movement(periodId, productId) também é criado pela migration 0011.
// NÃO incluir consumption/cmvValue no INSERT de upsertStockMovement — MySQL rejeita.
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  periodId: integer("periodId").notNull(),
  productId: integer("productId").notNull(),
  storeId: integer("storeId").notNull(),
  openingStock: numeric("openingStock", { precision: 10, scale: 3 }).default("0"),
  purchases: numeric("purchases", { precision: 10, scale: 3 }).default("0"),
  closingStock: numeric("closingStock", { precision: 10, scale: 3 }).default("0"),
  openingCost: numeric("openingCost", { precision: 10, scale: 2 }).default("0"),
  purchasesCost: numeric("purchasesCost", { precision: 10, scale: 2 }).default("0"),
  closingCost: numeric("closingCost", { precision: 10, scale: 2 }).default("0"),
  alertFlags: jsonb("alertFlags"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (t) => ({
  uqStockMovement: uniqueIndex("uq_stock_movement").on(t.periodId, t.productId),
}));
export type StockMovementRow = typeof stockMovements.$inferSelect;

export const purchaseEntries = pgTable("purchase_entries", {
  id: serial("id").primaryKey(),
  periodId: integer("periodId").notNull(),
  storeId: integer("storeId").notNull(),
  supplier: varchar("supplier", { length: 255 }),
  categoryId: integer("categoryId"),
  invoiceNumber: varchar("invoiceNumber", { length: 100 }),
  invoiceDate: varchar("invoiceDate", { length: 10 }),
  totalValue: numeric("totalValue", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type PurchaseEntryRow = typeof purchaseEntries.$inferSelect;

// ─── Cron Executions ─────────────────────────────────────────────────────────
// Tabela de idempotência para handlers de cron (server/scheduled/).
// UNIQUE(handler, run_date) garante que cada handler rode no máximo 1x por data.
// Criada pela migration 0012.
export const cronExecutions = pgTable("cron_executions", {
  id: serial("id").primaryKey(),
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
export const remuneracaoConfig = pgTable("remuneracao_config", {
  id: serial("id").primaryKey(),
  lojaId: integer("loja_id").notNull(),
  ativa: boolean("ativa").default(true),
  bonusBasePctFaturamento: numeric("bonus_base_pct_faturamento", { precision: 6, scale: 4 }).default("0.0150"),
  gatilhoMinimoPct: numeric("gatilho_minimo_pct", { precision: 5, scale: 2 }).default("80.00"),
  tetoMaximoPct: numeric("teto_maximo_pct", { precision: 5, scale: 2 }).default("120.00"),
  descricao: text("descricao"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type RemuneracaoConfigRow = typeof remuneracaoConfig.$inferSelect;

/** Regras de desconto vinculadas a uma configuração (gatilhos de elegibilidade). */
export const remuneracaoRegras = pgTable("remuneracao_regras", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  tipo: varchar("tipo", { length: 20 }).default("manual"),
  indicador: varchar("indicador", { length: 50 }).default("custom"),
  metaValor: numeric("meta_valor", { precision: 15, scale: 4 }),
  metaOperador: varchar("meta_operador", { length: 10 }).default("gte"),
  descontoPct: numeric("desconto_pct", { precision: 5, scale: 2 }).notNull().default("25.00"),
  ordem: integer("ordem").default(0),
  ativa: boolean("ativa").default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type RemuneracaoRegraRow = typeof remuneracaoRegras.$inferSelect;

/** Apuração mensal de remuneração por loja/pessoa. */
export const remuneracaoApuracaoPapelEnum = pgEnum("remuneracao_apuracao_papel", ["gestor", "lider"]);

export const remuneracaoApuracao = pgTable("remuneracao_apuracao", {
  id: serial("id").primaryKey(),
  lojaId: integer("loja_id").notNull(),
  mes: integer("mes").notNull(),
  ano: integer("ano").notNull(),
  faturamentoReal: numeric("faturamento_real", { precision: 15, scale: 2 }),
  bonusBaseRs: numeric("bonus_base_rs", { precision: 15, scale: 2 }),
  resultadoAtingimentoPct: numeric("resultado_atingimento_pct", { precision: 5, scale: 2 }),
  /** Variável final em R$ — sempre decimal(15,2), nunca float. */
  bonusFinalRs: numeric("bonus_final_rs", { precision: 15, scale: 2 }),
  status: varchar("status", { length: 20 }).default("rascunho"),
  observacao: text("observacao"),
  aprovadoPor: varchar("aprovado_por", { length: 200 }),
  aprovadoEm: bigint("aprovado_em", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  employeeId: integer("employee_id"),
  papel: remuneracaoApuracaoPapelEnum("papel"),
  legado: boolean("legado").notNull().default(false),
  extratoJson: jsonb("extrato_json"),
});
export type RemuneracaoApuracaoRow = typeof remuneracaoApuracao.$inferSelect;

/** Snapshot mensal da avaliação Google Places (apenas AGREGADO — sem texto de reviews individuais, conforme ToS). */
export const googleRatings = pgTable("google_ratings", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
  rating: numeric("rating", { precision: 2, scale: 1 }).notNull(), // ex: 4.3
  totalRatings: integer("totalRatings").notNull(),
  nota: numeric("nota", { precision: 5, scale: 2 }).notNull(), // rating × 20
  fetchedAt: bigint("fetchedAt", { mode: "number" }).notNull(),
}, (t) => ({
  uqGoogleRating: uniqueIndex("uq_google_rating").on(t.storeId, t.period),
}));
export type GoogleRatingRow = typeof googleRatings.$inferSelect;

// ─── Metas do Mês (MIC 4DX) ──────────────────────────────────────────────────
// Tabelas criadas antes do Drizzle ser adotado — declaradas aqui para manter o
// schema em controle de versão. Migration 0017 garante idempotência.
export const metas = pgTable("metas", {
  id: serial("id").primaryKey(),
  lojaId: integer("loja_id").notNull(),
  mes: integer("mes").notNull(),
  ano: integer("ano").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  valorMeta: numeric("valor_meta", { precision: 15, scale: 2 }),
  unidade: varchar("unidade", { length: 50 }).default("R$"),
  descricao: text("descricao"),
  status: varchar("status", { length: 20 }).default("ativa"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type MetaRow = typeof metas.$inferSelect;

export const medidasDirecao = pgTable("medidas_direcao", {
  id: serial("id").primaryKey(),
  metaId: integer("meta_id").notNull(),
  lojaId: integer("loja_id").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  indicador: varchar("indicador", { length: 50 }).default("custom"),
  metaValor: numeric("meta_valor", { precision: 15, scale: 4 }),
  metaOperador: varchar("meta_operador", { length: 10 }).default("gte"),
  unidade: varchar("unidade", { length: 50 }).default("%"),
  pesoRemuneracaoPct: numeric("peso_remuneracao_pct", { precision: 5, scale: 2 }).default("0"),
  ordem: integer("ordem").default(0),
  ativa: boolean("ativa").default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MedidaDirecaoRow = typeof medidasDirecao.$inferSelect;

export const medidasProgresso = pgTable("medidas_progresso", {
  id: serial("id").primaryKey(),
  medidaId: integer("medida_id").notNull(),
  mes: integer("mes").notNull(),
  ano: integer("ano").notNull(),
  valorAtual: numeric("valor_atual", { precision: 15, scale: 4 }),
  atingida: boolean("atingida").default(false),
  observacao: text("observacao"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => ({
  uqMedidaProgresso: uniqueIndex("uq_medida_progresso").on(t.medidaId, t.mes, t.ano),
}));
export type MedidaProgressoRow = typeof medidasProgresso.$inferSelect;

// ─── Despesas do Mês (DRE Viva) ───────────────────────────────────────────────
export const despesasMes = pgTable("despesas_mes", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  categoria: varchar("categoria", { length: 50 }).notNull(),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
  data: date("data").notNull(),
  descricao: varchar("descricao", { length: 500 }),
  fonte: varchar("fonte", { length: 30 }).notNull().default("manual"),
  conferido: boolean("conferido").notNull().default(false),
  createdBy: integer("createdBy"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

// ─── DRE Benchmarks Mensais (Benchmarks por segmento/faixa/rede) ──────────────
export const dreBenchmarksMensais = pgTable("dre_benchmarks_mensais", {
  id: serial("id").primaryKey(),
  periodo: varchar("periodo", { length: 7 }).notNull(), // YYYY-MM
  /** 'segmento' | 'faixa' | 'rede' */
  nivel: varchar("nivel", { length: 20 }).notNull(),
  /** Valor do segmento/faixa ou 'rede' */
  grupo: varchar("grupo", { length: 50 }).notNull(),
  nLojas: integer("n_lojas").notNull().default(0),
  cmvPctMediana: numeric("cmv_pct_mediana", { precision: 8, scale: 4 }),
  cmvPctP25: numeric("cmv_pct_p25", { precision: 8, scale: 4 }),
  cmvPctP75: numeric("cmv_pct_p75", { precision: 8, scale: 4 }),
  encargosPctMediana: numeric("encargos_pct_mediana", { precision: 8, scale: 4 }),
  encargosPctP25: numeric("encargos_pct_p25", { precision: 8, scale: 4 }),
  encargosPctP75: numeric("encargos_pct_p75", { precision: 8, scale: 4 }),
  receitaMediana: numeric("receita_mediana", { precision: 14, scale: 2 }),
  receitaP25: numeric("receita_p25", { precision: 14, scale: 2 }),
  receitaP75: numeric("receita_p75", { precision: 14, scale: 2 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().default(0),
}, (t) => ({
  uqDreBenchmark: uniqueIndex("uq_dre_benchmark").on(t.periodo, t.nivel, t.grupo),
}));

export type DreBenchmarkMensal = typeof dreBenchmarksMensais.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// Tabelas portadas das migrations legadas MySQL (0022/0027/0028) + orcamentos.
// Criadas no schema para o port Postgres (antes só existiam via SQL cru/externo).
// ════════════════════════════════════════════════════════════════════════════

// ─── Caixa Diário (quebra de receita por forma de pagamento) — migration 0027 ──
export const caixaDiario = pgTable("caixa_diario", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  data: varchar("data", { length: 10 }).notNull(), // YYYY-MM-DD
  dinheiro: numeric("dinheiro", { precision: 12, scale: 2 }).default("0"),
  debito: numeric("debito", { precision: 12, scale: 2 }).default("0"),
  credito: numeric("credito", { precision: 12, scale: 2 }).default("0"),
  vale: numeric("vale", { precision: 12, scale: 2 }).default("0"),
  pix: numeric("pix", { precision: 12, scale: 2 }).default("0"),
  apps: numeric("apps", { precision: 12, scale: 2 }).default("0"),
  atendimentos: integer("atendimentos").default(0),
  createdBy: integer("createdBy"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }),
}, (t) => ({
  uqCaixaStoreData: uniqueIndex("uq_caixa_store_data").on(t.storeId, t.data),
}));
export type CaixaDiarioRow = typeof caixaDiario.$inferSelect;

// ─── Reuniões (cadência semanal) — migration 0028 ─────────────────────────────
export const reunioes = pgTable("reunioes", {
  id: serial("id").primaryKey(),
  storeId: integer("storeId").notNull(),
  data: varchar("data", { length: 10 }).notNull(),
  participantes: varchar("participantes", { length: 300 }),
  observacao: text("observacao"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt").defaultNow(),
});
export type ReuniaoRow = typeof reunioes.$inferSelect;

export const reuniaoCombinados = pgTable("reuniao_combinados", {
  id: serial("id").primaryKey(),
  reuniaoId: integer("reuniaoId").notNull(),
  storeId: integer("storeId").notNull(),
  descricao: varchar("descricao", { length: 500 }).notNull(),
  responsavel: varchar("responsavel", { length: 150 }),
  prazo: varchar("prazo", { length: 10 }),
  status: varchar("status", { length: 10 }).notNull().default("aberto"),
  medidaId: integer("medidaId"),
  createdAt: timestamp("createdAt").defaultNow(),
  concluidoAt: timestamp("concluidoAt"),
});
export type ReuniaoCombinadoRow = typeof reuniaoCombinados.$inferSelect;

// ─── DRE Histórico Mensal — migration 0022 ────────────────────────────────────
export const dreHistoricoMensalFonteEnum = pgEnum("dre_historico_mensal_fonte", ["importado", "dre_viva"]);

export const dreHistoricoMensal = pgTable("dre_historico_mensal", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  anoMes: varchar("ano_mes", { length: 7 }).notNull(), // YYYY-MM
  faturamento: numeric("faturamento", { precision: 14, scale: 2 }),
  cmv: numeric("cmv", { precision: 14, scale: 2 }),
  folha: numeric("folha", { precision: 14, scale: 2 }),
  custosFixos: numeric("custos_fixos", { precision: 14, scale: 2 }),
  custosVariaveis: numeric("custos_variaveis", { precision: 14, scale: 2 }),
  impostos: numeric("impostos", { precision: 14, scale: 2 }),
  ebitda: numeric("ebitda", { precision: 14, scale: 2 }),
  fonte: dreHistoricoMensalFonteEnum("fonte").notNull().default("importado"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull().default(0),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull().default(0),
}, (t) => ({
  uqHistorico: uniqueIndex("uq_historico").on(t.storeId, t.anoMes),
}));
export type DreHistoricoMensalRow = typeof dreHistoricoMensal.$inferSelect;

// ─── Benchmarks Agregados — migration 0022 ────────────────────────────────────
export const benchmarksAgregadosMetricaEnum = pgEnum("benchmarks_agregados_metrica", [
  "cmv_pct",
  "folha_pct",
  "ebitda_pct",
  "custos_fixos_pct",
]);

export const benchmarksAgregados = pgTable("benchmarks_agregados", {
  id: serial("id").primaryKey(),
  segmento: varchar("segmento", { length: 64 }).notNull(),
  anoMes: varchar("ano_mes", { length: 7 }).notNull(),
  metrica: benchmarksAgregadosMetricaEnum("metrica").notNull(),
  p25: numeric("p25", { precision: 8, scale: 4 }),
  mediana: numeric("mediana", { precision: 8, scale: 4 }),
  p75: numeric("p75", { precision: 8, scale: 4 }),
  nLojas: integer("n_lojas").notNull().default(0),
  geradoEm: bigint("gerado_em", { mode: "number" }).notNull().default(0),
}, (t) => ({
  uqBenchmark: uniqueIndex("uq_benchmark_agregado").on(t.segmento, t.anoMes, t.metrica),
}));
export type BenchmarkAgregadoRow = typeof benchmarksAgregados.$inferSelect;

// ─── Orçamentos (DRE orçada por loja/mês) — migrations 0016/0020 ──────────────
// Colunas inferidas de server/db-orcamento.ts (createOrcamento). Colunas *_pct e
// monetárias = numeric; *_tipo = varchar ('rs' | 'pct' | 'auto'); epochs = bigint.
export const orcamentos = pgTable("orcamentos", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  periodoInicio: varchar("periodo_inicio", { length: 10 }).notNull(),
  periodoFim: varchar("periodo_fim", { length: 10 }),
  tipo: varchar("tipo", { length: 20 }),
  receitaBruta: numeric("receita_bruta", { precision: 14, scale: 2 }),
  ticketMedio: numeric("ticket_medio", { precision: 14, scale: 2 }),
  diasOperacao: integer("dias_operacao"),
  taxaCartaoPct: numeric("taxa_cartao_pct", { precision: 8, scale: 4 }),
  taxaCartaoTipo: varchar("taxa_cartao_tipo", { length: 10 }),
  taxaDeliveryPct: numeric("taxa_delivery_pct", { precision: 8, scale: 4 }),
  taxaDeliveryTipo: varchar("taxa_delivery_tipo", { length: 10 }),
  impostosPct: numeric("impostos_pct", { precision: 8, scale: 4 }),
  impostosTipo: varchar("impostos_tipo", { length: 10 }),
  cmvPct: numeric("cmv_pct", { precision: 8, scale: 4 }),
  cmvTipo: varchar("cmv_tipo", { length: 10 }),
  royaltiesPct: numeric("royalties_pct", { precision: 8, scale: 4 }),
  royaltiesTipo: varchar("royalties_tipo", { length: 10 }),
  fundoMarketingPct: numeric("fundo_marketing_pct", { precision: 8, scale: 4 }),
  fundoMarketingTipo: varchar("fundo_marketing_tipo", { length: 10 }),
  aluguel: numeric("aluguel", { precision: 14, scale: 2 }),
  aluguelTipo: varchar("aluguel_tipo", { length: 10 }),
  condominio: numeric("condominio", { precision: 14, scale: 2 }),
  condominioTipo: varchar("condominio_tipo", { length: 10 }),
  energia: numeric("energia", { precision: 14, scale: 2 }),
  energiaTipo: varchar("energia_tipo", { length: 10 }),
  gas: numeric("gas", { precision: 14, scale: 2 }),
  gasTipo: varchar("gas_tipo", { length: 10 }),
  agua: numeric("agua", { precision: 14, scale: 2 }),
  aguaTipo: varchar("agua_tipo", { length: 10 }),
  outrosOcupacao: numeric("outros_ocupacao", { precision: 14, scale: 2 }),
  outrosOcupacaoTipo: varchar("outros_ocupacao_tipo", { length: 10 }),
  contabilidade: numeric("contabilidade", { precision: 14, scale: 2 }),
  contabilidadeTipo: varchar("contabilidade_tipo", { length: 10 }),
  sistemas: numeric("sistemas", { precision: 14, scale: 2 }),
  sistemasTipo: varchar("sistemas_tipo", { length: 10 }),
  sanitarismo: numeric("sanitarismo", { precision: 14, scale: 2 }),
  sanitarismoTipo: varchar("sanitarismo_tipo", { length: 10 }),
  outrosServicos: numeric("outros_servicos", { precision: 14, scale: 2 }),
  outrosServicosTipo: varchar("outros_servicos_tipo", { length: 10 }),
  juros: numeric("juros", { precision: 14, scale: 2 }),
  jurosTipo: varchar("juros_tipo", { length: 10 }),
  tarifasBancarias: numeric("tarifas_bancarias", { precision: 14, scale: 2 }),
  tarifasBancariasTipo: varchar("tarifas_bancarias_tipo", { length: 10 }),
  marketing: numeric("marketing", { precision: 14, scale: 2 }),
  marketingTipo: varchar("marketing_tipo", { length: 10 }),
  outrasDespesas: numeric("outras_despesas", { precision: 14, scale: 2 }),
  outrasDespesasTipo: varchar("outras_despesas_tipo", { length: 10 }),
  proLabore: numeric("pro_labore", { precision: 14, scale: 2 }),
  proLaboreTipo: varchar("pro_labore_tipo", { length: 10 }),
  encargosPct: numeric("encargos_pct", { precision: 8, scale: 4 }),
  encargosTipo: varchar("encargos_tipo", { length: 10 }),
  notas: text("notas"),
  iaRevisaoJson: text("ia_revisao_json"),
  status: varchar("status", { length: 20 }).notNull().default("rascunho"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  // ── Fase B — migration 0029 ──
  emAtencao: boolean("em_atencao").notNull().default(false),
  prazoDecisao: varchar("prazo_decisao", { length: 10 }), // YYYY-MM-DD
  decisao: varchar("decisao", { length: 20 }), // 'seguir' | 'encerrar'
  rampaMeses: integer("rampa_meses"),
  // Folha (grupo 7 — Colaboradores). Distinta de pro_labore (grupo 13).
  folha: numeric("folha", { precision: 14, scale: 2 }),
}, (t) => ({
  uqOrcamentoStorePeriodo: uniqueIndex("uq_orcamento_store_periodo").on(t.storeId, t.periodoInicio),
}));
export type OrcamentoRow = typeof orcamentos.$inferSelect;

// ─── Orçamento — Metas Diárias (ritmo intra-mês) — migration 0029 ─────────────
export const orcamentoMetasDiarias = pgTable("orcamento_metas_diarias", {
  id: serial("id").primaryKey(),
  orcamentoId: integer("orcamento_id").notNull(),
  storeId: integer("store_id").notNull(),
  data: varchar("data", { length: 10 }).notNull(), // YYYY-MM-DD
  metaReceita: numeric("meta_receita", { precision: 14, scale: 2 }),
  metaAtendimentos: integer("meta_atendimentos"),
  pesoDia: numeric("peso_dia", { precision: 8, scale: 4 }),
}, (t) => ({
  uqMetaDiaria: uniqueIndex("uq_meta_diaria").on(t.storeId, t.data),
}));
export type OrcamentoMetaDiariaRow = typeof orcamentoMetasDiarias.$inferSelect;
