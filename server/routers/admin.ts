/**
 * admin.ts — tRPC router for admin-only operations
 * Handles: store CRUD, user management (admin/supervisor/gerente), store goals, user-store linking
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllStores, createStore, updateStore, getStoreById,
  linkUserToStore,
} from "../db";
import { getDb, rawQuery } from "../db";

// ─── Admin guard middleware ────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────
export const adminRouter = router({

  // ── List all stores ──────────────────────────────────────────────────────
  listStores: adminProcedure.query(async () => {
    return await getAllStores();
  }),

  // ── Create store ─────────────────────────────────────────────────────────
  createStore: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
      location: z.string().optional(),
      managerName: z.string().optional(),
      budgetRevenue: z.string().optional(),
      budgetCmvPct: z.string().optional(),
      budgetPackagingPct: z.string().optional(),
      budgetTaxesPct: z.string().optional(),
      budgetFixedCosts: z.string().optional(),
      budgetPayrollPct: z.string().optional(),
      payrollTargetPct: z.string().optional(),
      operationType: z.enum(["aeroporto", "mall", "rua", "corporativo", "universitario"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createStore({
        name: input.name,
        slug: input.slug,
        location: input.location ?? null,
        managerName: input.managerName ?? null,
        budgetRevenue: input.budgetRevenue ?? null,
        budgetCmvPct: input.budgetCmvPct ?? null,
        budgetPackagingPct: input.budgetPackagingPct ?? null,
        budgetTaxesPct: input.budgetTaxesPct ?? null,
        budgetFixedCosts: input.budgetFixedCosts ?? null,
        operationType: input.operationType ?? "rua",
      });
      return { id };
    }),

  // ── Update store ─────────────────────────────────────────────────────────
  updateStore: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      slug: z.string().min(2).optional(),
      location: z.string().optional(),
      managerName: z.string().optional(),
      budgetRevenue: z.string().optional(),
      budgetCmvPct: z.string().optional(),
      budgetPackagingPct: z.string().optional(),
      budgetTaxesPct: z.string().optional(),
      budgetFixedCosts: z.string().optional(),
      operationType: z.enum(["aeroporto", "mall", "rua", "corporativo", "universitario"]).optional(),
      googlePlaceId: z.string().optional().nullable(),
      segmento: z.string().max(50).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateStore(id, data as any);
      return { success: true };
    }),

  // ── List all users (v2 — inclui supervisor_stores) ────────────────────────
  listUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [rows] = await (db as any).$client.promise().execute(
      `SELECT u.id, u.openId, COALESCE(u.displayName, u.name) as name, u.email, u.role,
              u.createdAt, u.lastSignedIn,
              GROUP_CONCAT(DISTINCT CONCAT('g:', us.storeId, ':', COALESCE(s1.name,'')) ORDER BY us.storeId SEPARATOR '||') as gsLinks,
              GROUP_CONCAT(DISTINCT CONCAT('s:', ss.storeId, ':', COALESCE(s2.name,'')) ORDER BY ss.storeId SEPARATOR '||') as svLinks
       FROM users u
       LEFT JOIN user_stores us ON us.userId = u.id
       LEFT JOIN stores s1 ON s1.id = us.storeId
       LEFT JOIN supervisor_stores ss ON ss.supervisorId = u.id
       LEFT JOIN stores s2 ON s2.id = ss.storeId
       GROUP BY u.id
       ORDER BY FIELD(u.role,'admin','supervisor','gerente','user'), u.createdAt DESC`,
      []
    );
    return (rows as any[]).map(r => {
      const parseLinks = (raw: string | null, prefix: string) => {
        if (!raw) return { ids: [] as number[], names: [] as string[] };
        const items = String(raw).split("||").filter(s => s.startsWith(prefix + ":"));
        const ids = items.map(s => Number(s.split(":")[1])).filter(Boolean);
        const names = items.map(s => s.split(":").slice(2).join(":")).filter(Boolean);
        return { ids, names };
      };
      const gs = parseLinks(r.gsLinks, "g");
      const sv = parseLinks(r.svLinks, "s");
      return {
        id: r.id as number,
        openId: r.openId as string,
        name: (r.name ?? r.openId) as string,
        email: r.email as string | null,
        role: r.role as string,
        createdAt: r.createdAt as Date,
        storeIds: gs.ids,
        storeNames: gs.names,
        supervisorStoreIds: sv.ids,
        supervisorStoreNames: sv.names,
      };
    });
  }),

  // ── Create / pre-register user ────────────────────────────────────────────
  createUser: adminProcedure
    .input(z.object({
      openId: z.string().min(1),
      displayName: z.string().min(1),
      role: z.enum(["user", "admin", "supervisor", "gerente"]),
      storeIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Upsert user
      await (db as any).$client.promise().execute(
        `INSERT INTO users (openId, name, displayName, role)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           role = VALUES(role),
           displayName = VALUES(displayName),
           name = COALESCE(name, VALUES(name))`,
        [input.openId, input.displayName, input.displayName, input.role]
      );
      const [[userRow]] = await (db as any).$client.promise().execute(
        `SELECT id FROM users WHERE openId = ?`, [input.openId]
      );
      const userId = (userRow as any).id as number;
      // Link to stores
      if (input.storeIds && input.storeIds.length > 0) {
        for (const storeId of input.storeIds) {
          if (input.role === "supervisor") {
            await (db as any).$client.promise().execute(
              `INSERT IGNORE INTO supervisor_stores (supervisorId, storeId) VALUES (?, ?)`,
              [userId, storeId]
            );
          } else {
            await (db as any).$client.promise().execute(
              `INSERT IGNORE INTO user_stores (userId, storeId) VALUES (?, ?)`,
              [userId, storeId]
            );
          }
        }
      }
      return { success: true, userId };
    }),

  // ── Link user to store ────────────────────────────────────────────────────
  linkUserToStore: adminProcedure
    .input(z.object({
      userId: z.number(),
      storeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      await linkUserToStore(input.userId, input.storeId);
      return { success: true };
    }),

  // ── Unlink user from store ────────────────────────────────────────────────
  unlinkUserFromStore: adminProcedure
    .input(z.object({
      userId: z.number(),
      storeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await (db as any).$client.promise().execute(
        `DELETE FROM user_stores WHERE userId = ? AND storeId = ?`,
        [input.userId, input.storeId]
      );
      return { success: true };
    }),

  // ── Link supervisor to store ──────────────────────────────────────────────
  linkSupervisorToStore: adminProcedure
    .input(z.object({ userId: z.number(), storeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await (db as any).$client.promise().execute(
        `INSERT IGNORE INTO supervisor_stores (supervisorId, storeId) VALUES (?, ?)`,
        [input.userId, input.storeId]
      );
      return { success: true };
    }),

  // ── Unlink supervisor from store ──────────────────────────────────────────
  unlinkSupervisorFromStore: adminProcedure
    .input(z.object({ userId: z.number(), storeId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await (db as any).$client.promise().execute(
        `DELETE FROM supervisor_stores WHERE supervisorId = ? AND storeId = ?`,
        [input.userId, input.storeId]
      );
      return { success: true };
    }),

  // ── Set user role ─────────────────────────────────────────────────────────
  setUserRole: adminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin", "supervisor", "gerente"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await (db as any).$client.promise().execute(
        `UPDATE users SET role = ? WHERE id = ?`,
        [input.role, input.userId]
      );
      return { success: true };
    }),

  // ── Update store goals ────────────────────────────────────────────────────
  updateStoreGoals: adminProcedure
    .input(z.object({
      storeId: z.number(),
      budgetRevenue: z.string().optional(),
      budgetCmvPct: z.string().optional(),
      budgetPackagingPct: z.string().optional(),
      budgetTaxesPct: z.string().optional(),
      budgetFixedCosts: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { storeId, ...goals } = input;
      await updateStore(storeId, goals as any);
      return { success: true };
    }),

  // ── Get store details with goals ──────────────────────────────────────────
  getStore: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getStoreById(input.id);
    }),

  // ── Get system stats ──────────────────────────────────────────────────────
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalUsers: 0, totalStores: 0, totalActions: 0 };
    const [[usersRow], [storesRow], [actionsRow]] = await Promise.all([
      (db as any).$client.promise().execute(`SELECT COUNT(*) as cnt FROM users`, []),
      (db as any).$client.promise().execute(`SELECT COUNT(*) as cnt FROM stores`, []),
      (db as any).$client.promise().execute(`SELECT COUNT(*) as cnt FROM action_plans`, []),
    ]);
    return {
      totalUsers: Number((usersRow as any[])[0]?.cnt ?? 0),
      totalStores: Number((storesRow as any[])[0]?.cnt ?? 0),
      totalActions: Number((actionsRow as any[])[0]?.cnt ?? 0),
    };
  }),

  // ── List all users with roles ─────────────────────────────────────────────
  listAllUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [rows] = await (db as any).$client.promise().execute(
      `SELECT u.id, u.openId, u.name, u.email, u.role, u.lastSignedIn,
              GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') as storeNames
       FROM users u
       LEFT JOIN user_stores us ON us.userId = u.id
       LEFT JOIN stores s ON s.id = us.storeId
       GROUP BY u.id ORDER BY u.name`, []
    );
    return (rows as any[]).map((r: any) => ({
      id: r.id,
      openId: r.openId,
      name: r.name,
      email: r.email,
      role: r.role ?? "user",
      lastSignedIn: r.lastSignedIn,
      storeNames: r.storeNames ?? null,
    }));
  }),

  // ── Promote user to role ──────────────────────────────────────────────────
  promoteUser: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin", "supervisor", "gerente"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await (db as any).$client.promise().execute(`UPDATE users SET role = ? WHERE id = ?`, [input.role, input.userId]);
      return { success: true };
    }),

  // ── Get network defaults (premissas padrão da rede) ───────────────────────
  getNetworkDefaults: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [rows] = await (db as any).$client.promise().execute(`SELECT * FROM network_defaults WHERE id = 1`, []);
    const r = (rows as any[])[0];
    if (!r) return null;
    return {
      cmvMetaPct: Number(r.cmv_meta_pct),
      royaltiesPct: Number(r.royalties_pct),
      fundoPromocaoPct: Number(r.fundo_promocao_pct),
      diasOperacao: Number(r.dias_operacao),
      ticketMedio: r.ticket_medio != null ? Number(r.ticket_medio) : null,
      aluguelPct: r.aluguel_pct != null ? Number(r.aluguel_pct) : null,
      headcount: r.headcount != null ? Number(r.headcount) : null,
      energiaRs: r.energia_rs != null ? Number(r.energia_rs) : null,
      aguaRs: r.agua_rs != null ? Number(r.agua_rs) : null,
      gasRs: r.gas_rs != null ? Number(r.gas_rs) : null,
      observacoes: r.observacoes ?? null,
    };
  }),

  // ── Set network defaults ──────────────────────────────────────────────────
  setNetworkDefaults: adminProcedure
    .input(z.object({
      cmvMetaPct: z.number().min(0).max(100),
      royaltiesPct: z.number().min(0).max(100),
      fundoPromocaoPct: z.number().min(0).max(100),
      diasOperacao: z.number().min(1).max(31),
      ticketMedio: z.number().nullable().optional(),
      aluguelPct: z.number().nullable().optional(),
      headcount: z.number().nullable().optional(),
      energiaRs: z.number().nullable().optional(),
      aguaRs: z.number().nullable().optional(),
      gasRs: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await (db as any).$client.promise().execute(
        `INSERT INTO network_defaults (id, cmv_meta_pct, royalties_pct, fundo_promocao_pct, dias_operacao, ticket_medio, aluguel_pct, headcount, energia_rs, agua_rs, gas_rs, observacoes)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           cmv_meta_pct = VALUES(cmv_meta_pct), royalties_pct = VALUES(royalties_pct),
           fundo_promocao_pct = VALUES(fundo_promocao_pct), dias_operacao = VALUES(dias_operacao),
           ticket_medio = VALUES(ticket_medio), aluguel_pct = VALUES(aluguel_pct),
           headcount = VALUES(headcount), energia_rs = VALUES(energia_rs),
           agua_rs = VALUES(agua_rs), gas_rs = VALUES(gas_rs), observacoes = VALUES(observacoes)`,
        [input.cmvMetaPct, input.royaltiesPct, input.fundoPromocaoPct, input.diasOperacao,
         input.ticketMedio ?? null, input.aluguelPct ?? null, input.headcount ?? null,
         input.energiaRs ?? null, input.aguaRs ?? null, input.gasRs ?? null, input.observacoes ?? null]
      );
      return { success: true };
    }),

  // ── Clear demo data for a store ──────────────────────────────────
  clearStoreDemoData: adminProcedure
    .input(z.object({ storeId: z.number() }))
    .mutation(async ({ input }) => {
      const sid = input.storeId;
      // Remove all data for the store (keeps the store itself)
      await rawQuery(`DELETE FROM daily_entries WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM caixa_diario WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM stock_counts WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM stock_items WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM stock_products WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM stock_movements WHERE periodId IN (SELECT id FROM stock_periods WHERE storeId = ?)`, [sid]);
      await rawQuery(`DELETE FROM stock_periods WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM purchase_entries WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM action_plans WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM commitments WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM customer_occurrences WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM monthly_quality WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM despesas_mes WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM dre_fechamentos WHERE store_id = ?`, [sid]);
      await rawQuery(`DELETE FROM dre_historico_mensal WHERE store_id = ?`, [sid]);
      await rawQuery(`DELETE FROM medidas_progresso WHERE medida_id IN (SELECT id FROM medidas_direcao WHERE loja_id = ?)`, [sid]);
      await rawQuery(`DELETE FROM medidas_direcao WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM metas WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM orcamento_metas_diarias WHERE store_id = ?`, [sid]);
      await rawQuery(`DELETE FROM orcamento_linhas_custom WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM orcamento_colaboradores WHERE orcamento_id IN (SELECT id FROM orcamentos WHERE store_id = ?)`, [sid]);
      await rawQuery(`DELETE FROM orcamentos WHERE store_id = ?`, [sid]);
      await rawQuery(`DELETE FROM checklist_itens WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM preturno_configs WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM manutencoes WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM employees WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM shift_blocks WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM schedules WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM staff_movements WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM remuneracao_apuracao WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM remuneracao_regras WHERE config_id IN (SELECT id FROM remuneracao_config WHERE loja_id = ?)`, [sid]);
      await rawQuery(`DELETE FROM remuneracao_config WHERE loja_id = ?`, [sid]);
      await rawQuery(`DELETE FROM google_ratings WHERE storeId = ?`, [sid]);
      await rawQuery(`DELETE FROM reviews WHERE storeId = ?`, [sid]);
      return { success: true, message: "Todos os dados da loja removidos com sucesso." };
    }),

  // ── Clear ALL demo data (all stores) ─────────────────────────────
  clearAllDemoData: adminProcedure
    .mutation(async () => {
      await rawQuery(`DELETE FROM medidas_progresso`, []);
      await rawQuery(`DELETE FROM medidas_direcao`, []);
      await rawQuery(`DELETE FROM metas`, []);
      await rawQuery(`DELETE FROM orcamento_metas_diarias`, []);
      await rawQuery(`DELETE FROM orcamento_linhas_custom`, []);
      await rawQuery(`DELETE FROM orcamento_colaboradores`, []);
      await rawQuery(`DELETE FROM orcamentos`, []);
      await rawQuery(`DELETE FROM daily_entries`, []);
      await rawQuery(`DELETE FROM caixa_diario`, []);
      await rawQuery(`DELETE FROM stock_movements`, []);
      await rawQuery(`DELETE FROM stock_periods`, []);
      await rawQuery(`DELETE FROM stock_counts`, []);
      await rawQuery(`DELETE FROM stock_items`, []);
      await rawQuery(`DELETE FROM stock_products`, []);
      await rawQuery(`DELETE FROM purchase_entries`, []);
      await rawQuery(`DELETE FROM action_plans`, []);
      await rawQuery(`DELETE FROM commitments`, []);
      await rawQuery(`DELETE FROM customer_occurrences`, []);
      await rawQuery(`DELETE FROM monthly_quality`, []);
      await rawQuery(`DELETE FROM despesas_mes`, []);
      await rawQuery(`DELETE FROM dre_fechamentos`, []);
      await rawQuery(`DELETE FROM dre_historico_mensal`, []);
      await rawQuery(`DELETE FROM remuneracao_apuracao`, []);
      await rawQuery(`DELETE FROM remuneracao_regras`, []);
      await rawQuery(`DELETE FROM remuneracao_config`, []);
      await rawQuery(`DELETE FROM google_ratings`, []);
      await rawQuery(`DELETE FROM reviews`, []);
      return { success: true, message: "Todos os dados removidos." };
    }),
});
