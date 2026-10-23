/**
 * pessoas.ts — tRPC router for the Pessoas (People Management) module
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { assertPodeAcessarLoja } from "../auth-helpers";
import {
  calcBlockProductivity,
  calcPersonProductivity,
  calcHeatmap,
  copyScheduleFromPreviousWeek,
  createEmployee,
  createShiftBlock,
  createStaffMovement,
  deleteEmployee,
  deleteShiftBlock,
  generatePeopleSuggestions,
  getEmployeeById,
  getEmployees,
  getHourlyRevenue,
  getHourlyRevenueForWeek,
  getPayrollSummary,
  getScheduleForWeek,
  getShiftBlocks,
  getStaffMovements,
  getStorePeopleConfig,
  getTurnoverStats,
  PersonProductivity,
  getNetworkTurnoverStats,
  setScheduleForBlock,
  updateEmployee,
  updateShiftBlock,
  upsertHourlyRevenue,
  upsertStorePeopleConfig,
} from "../db-pessoas";
import { distribuirPorCurva, parsePdvPaste, CURVA_PADRAO } from "../revenue-curve";

const DEFAULT_CHARGES = 70;
const DEFAULT_PRODUCTIVITY_TARGET = 200;

// ─── Router ───────────────────────────────────────────────────────────────────

export const pessoasRouter = router({

  // ── Config ──────────────────────────────────────────────────────────────────
  getConfig: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      return config ?? {
        storeId: input.storeId,
        chargesPercent: DEFAULT_CHARGES,
        productivityTarget: DEFAULT_PRODUCTIVITY_TARGET,
        payrollTargetPercent: 18,
        hiringCost: 1500,
        operationStartHour: 8,
        operationEndHour: 23,
      };
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      chargesPercent: z.number().min(0).max(200).optional(),
      productivityTarget: z.number().min(0).optional(),
      payrollTargetPercent: z.number().min(0).max(100).optional(),
      hiringCost: z.number().min(0).optional(),
      operationStartHour: z.number().min(0).max(23).optional(),
      operationEndHour: z.number().min(1).max(24).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, ...data } = input;
      await upsertStorePeopleConfig(storeId, data);
      return { success: true };
    }),

  // ── Shift Blocks ─────────────────────────────────────────────────────────────
  getShiftBlocks: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getShiftBlocks(input.storeId);
    }),

  createShiftBlock: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      name: z.string().min(1).max(64),
      startHour: z.number().min(0).max(23),
      endHour: z.number().min(1).max(24),
      sortOrder: z.number().optional(),
      startMinute: z.number().min(0).max(1439).optional(),
      endMinute: z.number().min(0).max(1439).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, ...data } = input;
      const id = await createShiftBlock(storeId, data);
      return { id };
    }),

  updateShiftBlock: protectedProcedure
    .input(z.object({
      id: z.number(),
      storeId: z.number(),
      name: z.string().min(1).max(64).optional(),
      startHour: z.number().min(0).max(23).optional(),
      endHour: z.number().min(1).max(24).optional(),
      sortOrder: z.number().optional(),
      startMinute: z.number().min(0).max(1439).optional(),
      endMinute: z.number().min(0).max(1439).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { id, storeId, ...data } = input;
      await updateShiftBlock(id, storeId, data);
      return { success: true };
    }),

  deleteShiftBlock: adminProcedure
    .input(z.object({ id: z.number(), storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await deleteShiftBlock(input.id, input.storeId);
      return { success: true };
    }),

  // ── Employees ────────────────────────────────────────────────────────────────
  getEmployees: protectedProcedure
    .input(z.object({ storeId: z.number(), includeInactive: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getEmployees(input.storeId, input.includeInactive ?? false);
    }),

  createEmployee: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      name: z.string().min(1).max(128),
      role: z.string().min(1).max(64),
      salaryBase: z.number().min(0),
      transportAllowance: z.number().min(0).default(0),
      mealAllowance: z.number().min(0).default(0),
      otherBenefits: z.number().min(0).default(0),
      hoursPerMonth: z.number().min(1).max(744).default(220),
      hireDate: z.string(),
      status: z.enum(["active", "probation", "inactive"]).default("active"),
      papelRemuneravel: z.enum(["nenhum", "gestor", "lider"]).default("nenhum"),
      userId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, ...data } = input;
      const id = await createEmployee(storeId, data);
      // Auto-register hire movement
      await createStaffMovement(storeId, {
        employeeId: id,
        movementType: "hire",
        movementDate: data.hireDate,
        reason: "Cadastro inicial",
        previousValue: null,
        newValue: data.role,
      });
      return { id };
    }),

  updateEmployee: protectedProcedure
    .input(z.object({
      id: z.number(),
      storeId: z.number(),
      name: z.string().min(1).max(128).optional(),
      role: z.string().min(1).max(64).optional(),
      salaryBase: z.number().min(0).optional(),
      transportAllowance: z.number().min(0).optional(),
      mealAllowance: z.number().min(0).optional(),
      otherBenefits: z.number().min(0).optional(),
      hoursPerMonth: z.number().min(1).max(744).optional(),
      hireDate: z.string().optional(),
      status: z.enum(["active", "probation", "inactive"]).optional(),
      papelRemuneravel: z.enum(["nenhum", "gestor", "lider"]).optional(),
      userId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { id, storeId, ...data } = input;
      // Buscar estado atual para detectar mudanças de cargo/salário
      const current = await getEmployeeById(id, storeId);
      if (current) {
        const today = new Date().toISOString().split("T")[0];
        if (data.role !== undefined && data.role !== current.role) {
          await createStaffMovement(storeId, {
            employeeId: id,
            movementType: "role_change",
            movementDate: today,
            reason: "Mudança de cargo",
            previousValue: current.role,
            newValue: data.role,
          });
        }
        if (data.salaryBase !== undefined && data.salaryBase !== current.salaryBase) {
          await createStaffMovement(storeId, {
            employeeId: id,
            movementType: "salary_change",
            movementDate: today,
            reason: "Ajuste salarial",
            previousValue: String(current.salaryBase),
            newValue: String(data.salaryBase),
          });
        }
      }
      await updateEmployee(id, storeId, data);
      return { success: true };
    }),

  deleteEmployee: adminProcedure
    .input(z.object({ id: z.number(), storeId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await deleteEmployee(input.id, input.storeId);
      // Registrar movimento de desligamento para o turnover
      const today = new Date().toISOString().split("T")[0];
      await createStaffMovement(input.storeId, {
        employeeId: input.id,
        movementType: "termination",
        movementDate: today,
        reason: input.reason ?? "Desligamento",
        previousValue: null,
        newValue: null,
      });
      return { success: true };
    }),

  // ── Schedule ─────────────────────────────────────────────────────────────────
  getScheduleForWeek: protectedProcedure
    .input(z.object({ storeId: z.number(), startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getScheduleForWeek(input.storeId, input.startDate, input.endDate);
    }),

  setScheduleForBlock: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      shiftBlockId: z.number(),
      workDate: z.string(),
      employeeIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await setScheduleForBlock(input.storeId, input.shiftBlockId, input.workDate, input.employeeIds);
      return { success: true };
    }),

  copyFromPreviousWeek: protectedProcedure
    .input(z.object({ storeId: z.number(), targetStartDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const count = await copyScheduleFromPreviousWeek(input.storeId, input.targetStartDate);
      return { copied: count };
    }),

  // ── Hourly Revenue ────────────────────────────────────────────────────────────
  getHourlyRevenue: protectedProcedure
    .input(z.object({ storeId: z.number(), date: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getHourlyRevenue(input.storeId, input.date);
    }),

  getHourlyRevenueForWeek: protectedProcedure
    .input(z.object({ storeId: z.number(), startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getHourlyRevenueForWeek(input.storeId, input.startDate, input.endDate);
    }),

  saveHourlyRevenue: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      date: z.string(),
      entries: z.array(z.object({ hour: z.number().min(0).max(23), revenue: z.number().min(0) })),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await upsertHourlyRevenue(input.storeId, input.date, input.entries);
      return { success: true };
    }),

  // ── Heatmap ───────────────────────────────────────────────────────────────────
  getHeatmap: protectedProcedure
    .input(z.object({ storeId: z.number(), date: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      const productivityTarget = config?.productivityTarget ?? DEFAULT_PRODUCTIVITY_TARGET;
      const chargesPercent = config?.chargesPercent ?? DEFAULT_CHARGES;
      return calcHeatmap(input.storeId, input.date, productivityTarget, chargesPercent);
    }),

  // ── Analytics ─────────────────────────────────────────────────────────────────
  getBlockProductivity: protectedProcedure
    .input(z.object({ storeId: z.number(), startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      const productivityTarget = config?.productivityTarget ?? DEFAULT_PRODUCTIVITY_TARGET;
      const chargesPercent = config?.chargesPercent ?? DEFAULT_CHARGES;
      return calcBlockProductivity(input.storeId, input.startDate, input.endDate, productivityTarget, chargesPercent);
    }),

  getPayrollSummary: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      monthlyRevenue: z.number().optional(),
      budgetedPayroll: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      const chargesPercent = config?.chargesPercent ?? DEFAULT_CHARGES;
      return getPayrollSummary(input.storeId, chargesPercent, input.monthlyRevenue, input.budgetedPayroll);
    }),

  getTurnoverStats: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getTurnoverStats(input.storeId);
    }),
  personProductivity: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      const chargesPercent = config?.chargesPercent ?? DEFAULT_CHARGES;
      const productivityTarget = config?.productivityTarget ?? DEFAULT_PRODUCTIVITY_TARGET;
      return calcPersonProductivity(input.storeId, input.startDate, input.endDate, chargesPercent, productivityTarget);
    }),
  getTurnoverHistory: protectedProcedure
    .input(z.object({ storeId: z.number(), months: z.number().min(1).max(24).default(12) }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const now = new Date();
      const history = await Promise.all(
        Array.from({ length: input.months }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return getTurnoverStats(input.storeId, period).then(s => ({ period, ...s }));
        })
      );
      return history.reverse(); // cronológico
    }),
  getNetworkTurnover: protectedProcedure
    .input(z.object({ period: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") return [];
      const { getStoresByUserId } = await import("../db");
      const stores = await getStoresByUserId(ctx.user.id);
      return getNetworkTurnoverStats(stores.map(s => s.id), input.period);
    }),

  getSuggestions: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      const productivityTarget = config?.productivityTarget ?? DEFAULT_PRODUCTIVITY_TARGET;
      const payrollTargetPercent = config?.payrollTargetPercent ?? 18;
      const chargesPercent = config?.chargesPercent ?? DEFAULT_CHARGES;
      return generatePeopleSuggestions(input.storeId, productivityTarget, payrollTargetPercent, chargesPercent);
    }),

  // ── Staff Movements ───────────────────────────────────────────────────────────
  getMovements: protectedProcedure
    .input(z.object({ storeId: z.number(), limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getStaffMovements(input.storeId, input.limit ?? 50);
    }),

  createMovement: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      employeeId: z.number(),
      movementType: z.enum(["hire", "termination", "role_change", "salary_change"]),
      movementDate: z.string(),
      reason: z.string().optional(),
      previousValue: z.string().optional(),
      newValue: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, ...data } = input;
      const id = await createStaffMovement(storeId, {
        ...data,
        reason: data.reason ?? null,
        previousValue: data.previousValue ?? null,
        newValue: data.newValue ?? null,
      });
      return { id };
    }),

  // ── Atalhos de receita por hora ───────────────────────────────────────────────

  /** Estima receita por hora distribuindo a receita total do dia pela curva-padrão */
  estimarPorCurva: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      date: z.string(),
      totalRevenue: z.number().min(0),
      /** Pesos customizados (array de 24 números, índice = hora). Se omitido, usa CURVA_PADRAO. */
      customWeights: z.array(z.number()).length(24).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const config = await getStorePeopleConfig(input.storeId);
      const startH = config?.operationStartHour ?? 8;
      const endH   = config?.operationEndHour ?? 23;
      const weights = input.customWeights ?? CURVA_PADRAO;
      const entries = distribuirPorCurva(input.totalRevenue, startH, endH, weights);
      // Gravar em hourly_revenue (upsert — sobrescreve estimativas anteriores)
      await upsertHourlyRevenue(input.storeId, input.date, entries.map(e => ({ hour: e.hour, revenue: e.revenue })));
      return { entries, isEstimate: true };
    }),

  /** Parseia texto colado do PDV/ERP e grava em hourly_revenue */
  parsePdvPaste: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      date: z.string(),
      pasteText: z.string().max(4096),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const entries = parsePdvPaste(input.pasteText);
      if (entries.length === 0) return { entries: [], saved: 0 };
      await upsertHourlyRevenue(input.storeId, input.date, entries);
      return { entries, saved: entries.length };
    }),

  /** Copia o padrão de receita de um dia para os demais dias da semana */
  copyDayToWeek: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      sourceDate: z.string(),
      targetDates: z.array(z.string()).min(1).max(6),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const source = await getHourlyRevenue(input.storeId, input.sourceDate);
      if (source.length === 0) return { copied: 0 };
      let copied = 0;
      for (const date of input.targetDates) {
        await upsertHourlyRevenue(input.storeId, date, source.map(e => ({ hour: e.hour, revenue: e.revenue })));
        copied++;
      }
      return { copied };
    }),
});
