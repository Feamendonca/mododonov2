import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createActionPlan, createStockCount, createStockItem,
  createStore, deleteActionPlan, getAllStores, getActionPlans, getCommitment,
  getDailyEntries, getDailyEntry, getMonthlyQuality,
  getStockCounts, getStockItems, getStoreById, getStoreBySlug, getStoresByUserId,
  linkUserToStore, updateActionPlan,
  updateStore, upsertCommitment, upsertDailyEntry, upsertDailyEntryFields,
  upsertMonthlyQuality, upsertUser, getUserByOpenId, getDb,
  recalcularQualidadeGoogle, QualidadeGoogleExtrato,
} from "./db";
import { assertPodeAcessarLoja } from "./auth-helpers";
import { calcCMVWindows, calcMonthAccumulated, calcConsistencyScore } from "../shared/calculations";
import { notaResultado, notaRampa, notaCmv, notaQualidade, notaTotal, DEFAULT_CONFIG } from "../shared/engine";
import { cmvRouter } from "./routers/cmv";
import { pessoasRouter } from "./routers/pessoas";
import { adminRouter } from "./routers/admin";
import { experienciaRouter } from "./routers/experiencia";
import { preturnoRouter } from "./routers/preturno";
import { trilhasRouter } from "./routers/trilhas";
import { getTrailProgressByStore } from "./db-trilhas";
import { orcamentoRouter } from "./routers/orcamento";
import { manutencoesRouter } from "./routers/manutencoes";
import { checklistRouter } from "./routers/checklist";
import { metasRouter } from "./routers/metas";
import { setupRouter } from "./routers/setup";
import { despesasRouter } from "./routers/despesas";
import { adminHistoricoRouter } from "./routers/admin-historico";
import { remuneracaoRouter } from "./routers/remuneracao";
import { gatilhosRouter } from "./routers/gatilhos";
import { holidaysRouter } from "./routers/holidays";
import { lancamentosRouter } from "./routers/lancamentos";
import { reuniaoRouter } from "./routers/reuniao";
import { listAnexos, createAnexo, deleteAnexo, getAnexoById } from "./db-anexos";
import { getOrcamentoVigente, getMetaDiaria, calcularOrcamento } from "./db-orcamento";
import { storagePut } from "./storage";
import { seedDatabase } from "./seed";
import { calculaGestor, calculaLider } from "../shared/engine";
import { getEmployeeByUserId } from "./db-pessoas";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toNum(v: string | null | undefined, fallback = 0): number {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? fallback : n;
}

// LEGADO: usado como fallback quando não há orçamento aprovado para o período.
// Não usar como fonte primária — ver getOrcamentoVigente + orcamentoToConfig.
function storeToConfig(s: { budgetRevenue: string | null; budgetCmvPct: string | null; budgetPackagingPct: string | null; budgetTaxesPct: string | null; budgetFixedCosts: string | null; dayWeights: number[] | null }) {
  return {
    budgetRevenue: toNum(s.budgetRevenue),
    budgetCmvPct: toNum(s.budgetCmvPct, 30),
    budgetPackagingPct: toNum(s.budgetPackagingPct, 4),
    budgetTaxesPct: toNum(s.budgetTaxesPct, 3),
    budgetFixedCosts: toNum(s.budgetFixedCosts),
    dayWeights: s.dayWeights ?? [110, 80, 90, 95, 100, 110, 115],
  };
}

/**
 * Calcula notas usando o motor único (shared/engine.ts).
 * FASE B do patch motor único:
 * - Resultado usa EBITDA em R$ (Regra de Ouro 1) — nunca razão de margens %
 * - Orçado ≤ 0: estado explícito "sem orçamento válido" (nunca nota)
 * - Qualidade: null/undefined = "sem apontamento" (nunca default 85)
 */
export type QualidadeOuNull = {
  google: number | null;
  audit: number | null;
  checklist: number | null;
  sanitaryGate: boolean;
};

function calcScores(
  acc: { ebitda: number; budgetEbitda: number; cmvPct: number },
  ebitdaOrcadoRs: number | null | undefined,  // do orcamentoToConfig — sobrescreve acc.budgetEbitda quando disponível
  cmvMetaPct: number,
  qualidade: QualidadeOuNull
) {
  // ── Resultado (EBITDA em R$, Regra de Ouro 1) ──
  // Prioridade: ebitdaOrcadoRs do orçamento aprovado > acc.budgetEbitda do config da loja
  const orcadoRs = ebitdaOrcadoRs ?? acc.budgetEbitda;
  let sResult: number;
  let semOrcamentoValido = false;
  if (orcadoRs > 0) {
    sResult = notaResultado(acc.ebitda, orcadoRs, DEFAULT_CONFIG);
  } else if (orcadoRs < 0) {
    // Loja em recuperação: rampa com base=orcadoRs e alvo=0
    sResult = notaRampa(acc.ebitda, orcadoRs, 0, DEFAULT_CONFIG);
  } else {
    // Orçado = 0 ou nulo: sem orçamento válido — nota 0, sem defaults
    sResult = 0;
    semOrcamentoValido = true;
  }

  // ── CMV (pontos percentuais) ──
  const sCmv = notaCmv(acc.cmvPct, cmvMetaPct, DEFAULT_CONFIG);

  // ── Qualidade (sem default silencioso) ──
  // Se qualquer componente for null/undefined, qualidade fica null ("sem apontamento")
  let sQuality: number | null = null;
  if (qualidade.google != null && qualidade.audit != null && qualidade.checklist != null) {
    sQuality = notaQualidade(
      { vozDoCliente: qualidade.google, auditoria: qualidade.audit,
        checklist: qualidade.checklist, gateSanitarioOk: qualidade.sanitaryGate },
      DEFAULT_CONFIG
    );
  }

  // ── Total com regra de corte (só quando qualidade foi apontada) ──
  const sTotal = sQuality != null
    ? notaTotal([sResult, sCmv, sQuality], DEFAULT_CONFIG.pesosGestor, DEFAULT_CONFIG)
    : null;

  return {
    result: sResult,
    cmv: sCmv,
    quality: sQuality,   // null = "sem apontamento"
    total: sTotal,       // null = "sem apontamento de qualidade"
    semOrcamentoValido,  // true = exibir aviso no frontend
  };
}

/**
 * Constrói um StoreConfig a partir do orçamento aprovado do período.
 * Retorna null quando não há orçamento aprovado — o chamador deve exibir
 * "sem orçamento aprovado" em vez de usar defaults silenciosos.
 */
function orcamentoToConfig(orc: Awaited<ReturnType<typeof getOrcamentoVigente>>) {
  if (!orc) return null;
  const calc = calcularOrcamento(orc, orc.colaboradores ?? []);
  return {
    budgetRevenue: orc.receitaBruta,
    budgetCmvPct: orc.cmvPct * (orc.cmvTipo === "percentual" ? 100 : 1 / orc.receitaBruta * 100),
    budgetPackagingPct: 0, // orçamento não tem packaging separado — usa 0
    budgetTaxesPct: 0,     // impostos já estão no EBITDA do orçamento
    budgetFixedCosts: 0,   // custos fixos já estão no EBITDA do orçamento
    dayWeights: [80, 100, 100, 100, 110, 130, 120], // pesos padrão do orçamento
    // Campos extras para o motor
    ebitdaOrcado: calc.ebitda,
    ebitdaOrcadoPct: calc.ebitdaPct,
    cmvMetaPct: orc.cmvTipo === "percentual" ? orc.cmvPct * 100 : (orc.receitaBruta > 0 ? (orc.cmvPct / orc.receitaBruta) * 100 : 30),
  };
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` };
}

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Seed ──────────────────────────────────────────────────────────────────
  seed: router({
    run: publicProcedure.mutation(async () => {
      await seedDatabase();
      return { ok: true };
    }),
  }),

  // ─── Stores ────────────────────────────────────────────────────────────────
  stores: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") return getAllStores();
      // Supervisor: return stores linked via supervisor_stores
      if (ctx.user.role === "supervisor") {
        const db = await getDb();
        if (!db) return [];
        const [rows] = await (db as any).$client.promise().execute(
          `SELECT s.* FROM stores s
           INNER JOIN supervisor_stores ss ON ss.storeId = s.id
           WHERE ss.supervisorId = ?
           ORDER BY s.name`,
          [ctx.user.id]
        );
        if ((rows as any[]).length > 0) return rows as any[];
        return getAllStores(); // fallback for onboarding
      }
      // Gerente/user: return their linked stores via user_stores
      const linked = await getStoresByUserId(ctx.user.id);
      if (linked.length > 0) return linked;
      return getAllStores();
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const store = await getStoreById(input.id);
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });
      return store;
    }),

    getBySlug: protectedProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
      const store = await getStoreBySlug(input.slug);
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });
      return store;
    }),

    create: protectedProcedure
      .input(z.object({
        slug: z.string(), name: z.string(), location: z.string().optional(),
        managerName: z.string().optional(), budgetRevenue: z.string().optional(),
        budgetCmvPct: z.string().optional(), budgetPackagingPct: z.string().optional(),
        budgetTaxesPct: z.string().optional(), budgetFixedCosts: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const id = await createStore({ ...input, dayWeights: [110, 80, 90, 95, 100, 110, 115] });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(), name: z.string().optional(), location: z.string().optional(),
        managerName: z.string().optional(), budgetRevenue: z.string().optional(),
        budgetCmvPct: z.string().optional(), budgetPackagingPct: z.string().optional(),
        budgetTaxesPct: z.string().optional(), budgetFixedCosts: z.string().optional(),
        qualityGoogle: z.string().optional(), qualityAudit: z.string().optional(),
        qualityChecklist: z.string().optional(), sanitaryGate: z.boolean().optional(),
        gateAbsences: z.boolean().optional(), gateEvaluation: z.boolean().optional(),
        gateSanctions: z.boolean().optional(),
        googlePlaceId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { id, ...data } = input;
        await updateStore(id, data);
        return { ok: true };
      }),

    linkUser: protectedProcedure
      .input(z.object({ userId: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await linkUserToStore(input.userId, input.storeId);
        return { ok: true };
      }),
    /** Busca o rating atual do Google Places para uma loja (gate admin). */
    fetchGoogleRating: protectedProcedure
      .input(z.object({ storeId: z.number(), placeId: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await assertPodeAcessarLoja(ctx, input.storeId);
        const { fetchGooglePlaceRating, calcNotaFromRating } = await import("./google-places");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const [storeRows] = await (db as any).$client.promise().execute(
          "SELECT googlePlaceId FROM stores WHERE id = ?",
          [input.storeId]
        );
        const store = (storeRows as Array<{ googlePlaceId: string | null }>)[0];
        // Prioridade: placeId passado diretamente (teste antes de salvar) > place_id do banco
        const resolvedPlaceId = input.placeId?.trim() || store?.googlePlaceId;
        if (!resolvedPlaceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um Google Place ID válido." });
        }
        const placeData = await fetchGooglePlaceRating(resolvedPlaceId);
        if (!placeData) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível buscar o rating no Google Places. Verifique o Place ID e a chave de API." });
        }
        const nota = calcNotaFromRating(placeData.rating);
        // Se a loja tem o placeId salvo no banco (não é só preview), sincronizar automaticamente
        if (input.storeId > 0 && store?.googlePlaceId && store.googlePlaceId === resolvedPlaceId) {
          const period = new Date().toISOString().slice(0, 7); // YYYY-MM atual
          const { syncGoogleRating } = await import("./google-places");
          await syncGoogleRating(input.storeId, period).catch(err =>
            console.error("[fetchGoogleRating] Erro ao sincronizar automaticamente:", err)
          );
        }
        return { rating: placeData.rating, totalRatings: placeData.totalRatings, nota };
      }),
    /** Sincroniza o rating do Google Places para uma loja/período e grava em monthly_quality (gate admin). */
    syncGoogleRating: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await assertPodeAcessarLoja(ctx, input.storeId);
        const { syncGoogleRating } = await import("./google-places");
        const result = await syncGoogleRating(input.storeId, input.period);
        if (!result) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível sincronizar. Verifique o Place ID e a chave de API." });
        }
        return result;
      }),
    /** Retorna o último snapshot de google_ratings para exibição no Admin. */
    getGoogleRating: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await assertPodeAcessarLoja(ctx, input.storeId);
        const { getLastGoogleRating } = await import("./google-places");
        return getLastGoogleRating(input.storeId);
      }),
  }),

  // ─── Dashboard (Hoje) ──────────────────────────────────────────────────────
  dashboard: router({
    today: protectedProcedure
      .input(z.object({ storeId: z.number(), date: z.string().optional() }))
      .query(async ({ input }) => {
        const today = input.date ?? new Date().toISOString().slice(0, 10);
        const period = today.slice(0, 7);
        const { from, to } = periodRange(period);
        const store = await getStoreById(input.storeId);
        if (!store) throw new TRPCError({ code: "NOT_FOUND" });

        // GAP 0: fonte única do orçamento — usa orçamento aprovado do período.
        // Sem orçamento aprovado, sinaliza ao frontend (sem defaults silenciosos).
        const orcVigente = await getOrcamentoVigente(input.storeId, period);
        const config = orcamentoToConfig(orcVigente) ?? storeToConfig(store);
        const semOrcamento = !orcVigente;

        const entries = await getDailyEntries(input.storeId, from, to);
        const todayEntry = await getDailyEntry(input.storeId, today);
        const counts = await getStockCounts(input.storeId, from, to);
        const commitment = await getCommitment(input.storeId, period);
        const actions = await getActionPlans(input.storeId);
        const openActions = actions.filter((a) => a.status === "todo" || a.status === "doing");
        const overdueActions = openActions.filter((a) => a.dueDate && a.dueDate < today);

        const entriesNum = entries.map((e) => ({
          entryDate: e.entryDate,
          revenue: toNum(e.revenue),
          invoices: toNum(e.invoices),
          extraLabor: toNum(e.extraLabor),
        }));
        const countsNum = counts.map((c) => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        const accumulated = calcMonthAccumulated(entriesNum, countsNum, config, period);

        // GAP 0: meta do dia — lê orcamento_metas_diarias (gerado ao aprovar orçamento).
        // Fallback para cálculo por pesos quando não há meta diaria cadastrada.
        const metaDiaria = await getMetaDiaria(input.storeId, today);
        let budgetedToday: number;
        let metaFonte: "orcamento" | "pesos_genericos" | "sem_orcamento";
        if (metaDiaria) {
          budgetedToday = metaDiaria.metaReceita;
          metaFonte = "orcamento";
        } else if (!semOrcamento && config.budgetRevenue > 0) {
          // Orçamento aprovado mas sem meta diaria gerada ainda — usa pesos do orçamento
          const [y, m] = today.split("-").map(Number);
          const weights = config.dayWeights;
          let totalW = 0;
          const days = new Date(y, m, 0).getDate();
          for (let d = 1; d <= days; d++) totalW += weights[new Date(y, m - 1, d).getDay()];
          const dow = new Date(y, m - 1, parseInt(today.slice(8))).getDay();
          budgetedToday = (config.budgetRevenue * weights[dow]) / totalW;
          metaFonte = "pesos_genericos";
        } else {
          budgetedToday = 0;
          metaFonte = "sem_orcamento";
        }

        return {
          store,
          todayEntry,
          accumulated,
          budgetedToday,
          metaFonte,
          semOrcamento,
          ebitdaOrcado: orcVigente ? (orcamentoToConfig(orcVigente)?.ebitdaOrcado ?? null) : null,
          cmvMetaPct: orcVigente ? (orcamentoToConfig(orcVigente)?.cmvMetaPct ?? toNum(store.budgetCmvPct, 30)) : toNum(store.budgetCmvPct, 30),
          commitmentSigned: commitment?.signed ?? false,
          overdueActionsCount: overdueActions.length,
          last7Days: entries.slice(-7).map((e) => ({
            date: e.entryDate,
            revenue: toNum(e.revenue),
            invoices: toNum(e.invoices),
          })),
        };
      }),

    saveEntry: protectedProcedure
      .input(z.object({
        storeId: z.number(), entryDate: z.string(), 
        revenue: z.string(), invoices: z.string().optional(), extraLabor: z.string(),
        atendimentos: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Gravar apenas revenue, extraLabor, atendimentos — invoices é derivado de purchase_entries
        await upsertDailyEntryFields(input.storeId, input.entryDate, {
          revenue: input.revenue,
          extraLabor: input.extraLabor,
          ...(input.atendimentos != null ? { atendimentos: input.atendimentos } : {}),
        });
        return { ok: true };
      }),
  }),
  // ─── Projeção do mês ───────────────────────────────────────────────────────
  projecao: router({
    mes: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const period = input.period ?? currentPeriod();
        const { from, to } = periodRange(period);
        const store = await getStoreById(input.storeId);
        if (!store) throw new TRPCError({ code: "NOT_FOUND" });

        const orcVigente = await getOrcamentoVigente(input.storeId, period);
        if (!orcVigente) {
          return { semOrcamento: true, ebitdaPct: null, notas: null, variavelEstimada: null, papel: null };
        }

        // AVISO: este importador grava invoices direto (carga histórica/seed). Não usar em mês operado ao vivo — clobbera o invoices derivado de purchase_entries.
        const config = orcamentoToConfig(orcVigente)!;
        const entries = await getDailyEntries(input.storeId, from, to);
        const counts = await getStockCounts(input.storeId, from, to);
        const quality = await getMonthlyQuality(input.storeId, period);

        const entriesNum = entries.map(e => ({ entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor) }));
        const countsNum = counts.map(c => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        const acc = calcMonthAccumulated(entriesNum, countsNum, config, period);

        const ebitdaOrcadoRs = config.ebitdaOrcado ?? null;
        const cmvMetaPct = config.cmvMetaPct ?? config.budgetCmvPct;

        // Qualidade do mês (sem defaults silenciosos)
        const qGoogle = quality?.qualityGoogle != null ? toNum(quality.qualityGoogle) : (store.qualityGoogle != null ? toNum(store.qualityGoogle) : null);
        const qAudit = quality?.qualityAudit != null ? toNum(quality.qualityAudit) : (store.qualityAudit != null ? toNum(store.qualityAudit) : null);
        const qChecklist = quality?.qualityChecklist != null ? toNum(quality.qualityChecklist) : (store.qualityChecklist != null ? toNum(store.qualityChecklist) : null);
        const sanitaryGate = quality?.sanitaryGate ?? store.sanitaryGate ?? true;

        // ── Pró-rata: extrapolação do EBITDA para o mês inteiro ──────────────
        // O acc.ebitda é PARCIAL (acumulado até hoje). Para comparar com o orçado
        // do mês inteiro, extrapolamos mantendo o ritmo atual.
        // diasDecorridos = nº de dias com lançamento; se 0 → projeção indisponível.
        const [yProj, mProj] = period.split("-").map(Number);
        const totalDias = new Date(yProj!, mProj!, 0).getDate();
        const diasDecorridos = entries.length;
        // ebitdaProjetado: EBITDA extrapolado para o mês inteiro no ritmo atual
        // CMV (acc.cmvPct) é percentual — já é comparável, NÃO pró-ratear
        const ebitdaProjetado = diasDecorridos > 0
          ? (acc.ebitda / diasDecorridos) * totalDias
          : null; // dia 1 sem lançamento → projeção indisponível
        // Para o calcScores da projeção, usar ebitdaProjetado no lugar de acc.ebitda
        const accProjetado = ebitdaProjetado != null
          ? { ...acc, ebitda: ebitdaProjetado }
          : acc;
        // Notas do motor com realizado PROJETADO (pró-rata)
        const scores = calcScores(accProjetado, ebitdaOrcadoRs, cmvMetaPct, { google: qGoogle, audit: qAudit, checklist: qChecklist, sanitaryGate });

        // Verificar se o usuário logado é gestor/líder desta loja
        let variavelEstimada: number | null = null;
        let papel: "gestor" | "lider" | null = null;
        const emp = await getEmployeeByUserId(ctx.user.id, input.storeId);
        if (emp && (emp.papelRemuneravel === "gestor" || emp.papelRemuneravel === "lider") && emp.salaryBase > 0) {
          papel = emp.papelRemuneravel;
          // Gatilhos otimistas para projeção (assume elegível — gerente vê o potencial máximo)
          const gatilhosOtimistas = { semFaltasInjustificadas: true, avaliacaoDesempenho: 8, semSancoesDisciplinares: true };
          // Usar ebitdaProjetado (pró-rata) para a variável estimada
          const resultado = ebitdaProjetado != null
            ? { ebitdaRealRs: ebitdaProjetado, ebitdaOrcadoRs: ebitdaOrcadoRs ?? 0 }
            : { ebitdaRealRs: acc.ebitda, ebitdaOrcadoRs: ebitdaOrcadoRs ?? 0 };

          if (emp.papelRemuneravel === "gestor" && scores.quality != null) {
            const extrato = calculaGestor({
              fixoRs: emp.salaryBase,
              gatilhos: gatilhosOtimistas,
              resultado,
              cmv: { realPp: acc.cmvPct, metaPp: cmvMetaPct },
              qualidade: { vozDoCliente: qGoogle ?? 85, auditoria: qAudit ?? 85, checklist: qChecklist ?? 85, gateSanitarioOk: sanitaryGate },
            });
            variavelEstimada = extrato.variavelMesRs;
          } else if (emp.papelRemuneravel === "lider" && scores.quality != null) {
            const extrato = calculaLider({
              fixoRs: emp.salaryBase,
              gatilhos: gatilhosOtimistas,
              migTurno: { realPp: acc.cmvPct, metaPp: cmvMetaPct },
              checklistTurno: qChecklist ?? 85,
              resultadoLoja: resultado,
            });
            variavelEstimada = extrato.variavelMesRs;
          }
        }

        const receitaProRata = config.budgetRevenue > 0 && totalDias > 0
          ? (config.budgetRevenue / totalDias) * diasDecorridos
          : 0;
        const receitaVsProRataPct = receitaProRata > 0 ? (acc.revenue / receitaProRata) * 100 : null;

        return {
          semOrcamento: false,
          ebitdaPct: acc.ebitdaPct,
          ebitdaOrcadoPct: config.ebitdaOrcadoPct ?? null,
          notas: scores,
          variavelEstimada,
          papel,
          receitaVsProRataPct,
          cmvVsMeta: acc.cmvPct - cmvMetaPct,  // positivo = acima da meta (ruim)
          diasDecorridos,
          totalDias,
          ebitdaProjetado,  // EBITDA extrapolado para o mês inteiro (pró-rata) — null se sem lançamentos
        };
      }),
  }),

  // ─── Stock / CMV ───────────────────────────────────────────────────────────
  stock: router({
    items: protectedProcedure.input(z.object({ storeId: z.number() })).query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getStockItems(input.storeId);
    }),

    addItem: protectedProcedure
      .input(z.object({ storeId: z.number(), name: z.string(), unit: z.string(), curve: z.enum(["A", "B", "C"]), avgCost: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const id = await createStockItem(input);
        return { id };
      }),

    counts: protectedProcedure
      .input(z.object({ storeId: z.number(), from: z.string().optional(), to: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getStockCounts(input.storeId, input.from, input.to);
      }),

    addCount: protectedProcedure
      .input(z.object({ storeId: z.number(), countDate: z.string(), totalValue: z.string(), countType: z.enum(["initial", "weekly", "monthly"]), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const id = await createStockCount(input);
        return { id };
      }),

    cmvWindows: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        // AVISO: este importador grava invoices direto (carga histórica/seed). Não usar em mês operado ao vivo — clobbera o invoices derivado de purchase_entries.
        await assertPodeAcessarLoja(ctx, input.storeId);
        const period = input.period ?? currentPeriod();
        const { from, to } = periodRange(period);
        const entries = await getDailyEntries(input.storeId, from, to);
        const counts = await getStockCounts(input.storeId, from, to);
        const entriesNum = entries.map((e) => ({ entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor) }));
        const countsNum = counts.map((c) => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        return calcCMVWindows(entriesNum, countsNum);
      }),
  }),

  // ─── EBITDA / Mês ──────────────────────────────────────────────────────────
  ebitda: router({
    monthly: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string().optional() }))
      .query(async ({ input }) => {
        const period = input.period ?? currentPeriod();
        const { from, to } = periodRange(period);
        const store = await getStoreById(input.storeId);
        if (!store) throw new TRPCError({ code: "NOT_FOUND" });

        // GAP 0: fonte única do orçamento
        const orcVigente = await getOrcamentoVigente(input.storeId, period);
        const config = orcamentoToConfig(orcVigente) ?? storeToConfig(store);
        // AVISO: este importador grava invoices direto (carga histórica/seed). Não usar em mês operado ao vivo — clobbera o invoices derivado de purchase_entries.
        const semOrcamento = !orcVigente;

        const entries = await getDailyEntries(input.storeId, from, to);
        const counts = await getStockCounts(input.storeId, from, to);
        const quality = await getMonthlyQuality(input.storeId, period);
        const entriesNum = entries.map((e) => ({ entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor) }));
        const countsNum = counts.map((c) => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        const accumulated = calcMonthAccumulated(entriesNum, countsNum, config, period);

        // FASE B: sem defaults silenciosos de qualidade
        const qGoogle = quality?.qualityGoogle != null ? toNum(quality.qualityGoogle) : (store.qualityGoogle != null ? toNum(store.qualityGoogle) : null);
        const qAudit = quality?.qualityAudit != null ? toNum(quality.qualityAudit) : (store.qualityAudit != null ? toNum(store.qualityAudit) : null);
        const qChecklist = quality?.qualityChecklist != null ? toNum(quality.qualityChecklist) : (store.qualityChecklist != null ? toNum(store.qualityChecklist) : null);
        const sanitaryGate = quality?.sanitaryGate ?? store.sanitaryGate ?? true;

        const ebitdaOrcadoRs = orcVigente ? (orcamentoToConfig(orcVigente)?.ebitdaOrcado ?? null) : null;
        const cmvMetaPct = orcVigente ? (orcamentoToConfig(orcVigente)?.cmvMetaPct ?? config.budgetCmvPct) : config.budgetCmvPct;
        const scores = calcScores(accumulated, ebitdaOrcadoRs, cmvMetaPct, { google: qGoogle, audit: qAudit, checklist: qChecklist, sanitaryGate });

        return {
          accumulated,
          scores,
          quality: { google: qGoogle, audit: qAudit, checklist: qChecklist, sanitaryGate },
          semOrcamento: semOrcamento || scores.semOrcamentoValido,
          ebitdaOrcado: ebitdaOrcadoRs,
        };
      }),

    updateQuality: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string(), qualityGoogle: z.string(), qualityAudit: z.string(), qualityChecklist: z.string(), sanitaryGate: z.boolean() }))
      .mutation(async ({ input }) => {
        await upsertMonthlyQuality(input);
        return { ok: true };
      }),

    // BLOCO B: recalcula voz do cliente a partir da tabela reviews (fonte única desde migration 0014)
    recalcularQualidade: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string() }))
      .mutation(async ({ input }) => {
        const extrato = await recalcularQualidadeGoogle(input.storeId, input.period);
        if (extrato === null) {
          // Sem reviews no mês: zerar qualityGoogle para NULL
          const existing = await getMonthlyQuality(input.storeId, input.period);
          if (existing) {
            await upsertMonthlyQuality({
              storeId: input.storeId,
              period: input.period,
              qualityGoogle: null as unknown as string, // NULL = sem apontamento
              qualityAudit: existing.qualityAudit ?? null as unknown as string,
              qualityChecklist: existing.qualityChecklist ?? null as unknown as string,
              sanitaryGate: existing.sanitaryGate ?? true,
            });
          }
          return { calculado: false, extrato: null, nota: null };
        }
        // Gravar nota calculada
        const existing = await getMonthlyQuality(input.storeId, input.period);
        await upsertMonthlyQuality({
          storeId: input.storeId,
          period: input.period,
          qualityGoogle: String(extrato.notaFinal),
          qualityAudit: existing?.qualityAudit ?? null as unknown as string,
          qualityChecklist: existing?.qualityChecklist ?? null as unknown as string,
          sanitaryGate: existing?.sanitaryGate ?? true,
        });
        return { calculado: true, extrato, nota: extrato.notaFinal };
      }),
  }),

  // ─── Action Plans ──────────────────────────────────────────────────────────
  actions: router({
    list: protectedProcedure.input(z.object({ storeId: z.number() })).query(async ({ input }) => {
      return getActionPlans(input.storeId);
    }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        category: z.enum(["cmv", "experience", "revenue", "people", "discipline", "other"]),
        description: z.string(), reason: z.string().optional(),
        dueDate: z.string().optional(), responsible: z.string().optional(),
        isSuggestion: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createActionPlan({ ...input, status: "todo" });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(), status: z.enum(["todo", "doing", "done", "failed", "cancelled"]).optional(),
        result: z.string().optional(), description: z.string().optional(),
        dueDate: z.string().optional(), responsible: z.string().optional(),
        completedAt: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.status === "done" || data.status === "failed") {
          (data as any).completedAt = new Date();
        }
        await updateActionPlan(id, data);
        return { ok: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await deleteActionPlan(input.id);
      return { ok: true };
    }),

    suggestions: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string().optional() }))
      .query(async ({ input }) => {
        const period = input.period ?? currentPeriod();
        const { from, to } = periodRange(period);
        const store = await getStoreById(input.storeId);
        if (!store) return [];
        // GAP 0: fonte única do orçamento
        const orcVigente = await getOrcamentoVigente(input.storeId, period);
        const config = orcamentoToConfig(orcVigente) ?? storeToConfig(store);
        // AVISO: este importador grava invoices direto (carga histórica/seed). Não usar em mês operado ao vivo — clobbera o invoices derivado de purchase_entries.
        const entries = await getDailyEntries(input.storeId, from, to);
        const counts = await getStockCounts(input.storeId, from, to);
        const commitment = await getCommitment(input.storeId, period);
        const actions = await getActionPlans(input.storeId);
        const quality = await getMonthlyQuality(input.storeId, period);
        const entriesNum = entries.map((e) => ({ entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor) }));
        const countsNum = counts.map((c) => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        const acc = calcMonthAccumulated(entriesNum, countsNum, config, period);
        const recentActions = actions.filter((a) => {
          const created = new Date(a.createdAt);
          return (Date.now() - created.getTime()) < 7 * 86400000;
        });
        const suggestions: { category: string; description: string; reason: string }[] = [];
        const hasCmv = recentActions.some((a) => a.category === "cmv");
        if (!hasCmv && acc.cmvPct > config.budgetCmvPct + 1) {
          suggestions.push({ category: "cmv", description: "Revisar porcionamento e fichas técnicas", reason: `CMV em ${acc.cmvPct.toFixed(1)}% vs meta ${config.budgetCmvPct}%` });
        }
        const hasExp = recentActions.some((a) => a.category === "experience");
        const qGoogle = quality?.qualityGoogle != null ? parseFloat(quality.qualityGoogle) : null;
        if (!hasExp && qGoogle !== null && qGoogle < 80) {
          suggestions.push({ category: "experience", description: "Treinamento de atendimento com a equipe", reason: `Nota Google em ${qGoogle.toFixed(0)}/100` });
        }
        const hasRev = recentActions.some((a) => a.category === "revenue");
        if (!hasRev && acc.revenueVsBudgetPct < 95) {
          suggestions.push({ category: "revenue", description: "Ação de vendas no horário de pico", reason: `Receita em ${acc.revenueVsBudgetPct.toFixed(0)}% do orçado` });
        }
        if (!commitment?.signed) {
          suggestions.push({ category: "discipline", description: "Assinar o Compromisso do trimestre", reason: "Compromisso ainda não assinado" });
        }
                return suggestions;
      }),
    // ─── Anexos ──────────────────────────────────────────────────────────────
    listAnexos: protectedProcedure
      .input(z.object({ acaoId: z.number() }))
      .query(async ({ input }) => {
        return listAnexos(input.acaoId);
      }),
    uploadAnexo: protectedProcedure
      .input(z.object({
        acaoId: z.number(),
        lojaId: z.number(),
        nome: z.string(),
        mimeType: z.string(),
        tamanho: z.number(),
        base64: z.string(), // base64 encoded file content
      }))
      .mutation(async ({ input, ctx }) => {
        const MAX_SIZE = 16 * 1024 * 1024; // 16MB
        if (input.tamanho > MAX_SIZE) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Limite: 16MB" });
        }
        const ALLOWED_TYPES = [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
          "video/mp4",
        ];
        if (!ALLOWED_TYPES.includes(input.mimeType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de arquivo não permitido" });
        }
        // Decode base64 and upload to S3
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.nome.split(".").pop() ?? "bin";
        const fileKey = `plano-acao/${input.lojaId}/${input.acaoId}/${Date.now()}.${ext}`;
        const { key, url } = await storagePut(fileKey, buffer, input.mimeType);
        const id = await createAnexo({
          acaoId: input.acaoId,
          lojaId: input.lojaId,
          nome: input.nome,
          fileKey: key,
          url,
          mimeType: input.mimeType,
          tamanho: input.tamanho,
          criadoPor: ctx.user?.name ?? ctx.user?.openId ?? "unknown",
        });
        return { id, key, url };
      }),
    deleteAnexo: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAnexo(input.id);
        return { ok: true };
      }),
  }),
  // ─── Commitment ────────────────────────────────────────────────────────────
  commitment: router({
    get: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const period = input.period ?? currentPeriod();
        return getCommitment(input.storeId, period);
      }),

    save: protectedProcedure
      .input(z.object({
        storeId: z.number(), period: z.string().optional(),
        reviewsTarget: z.number().optional(), tableResponseHours: z.number().optional(),
        googleResponseHours: z.number().optional(),
        trainTeam: z.boolean().optional(), actOnStandard: z.boolean().optional(), joinCommunity: z.boolean().optional(),
        doPreShift: z.boolean().optional(), doAppEntry: z.boolean().optional(), doWeeklyMeeting: z.boolean().optional(),
        doInitialCount: z.boolean().optional(), doWeeklyCount: z.boolean().optional(), doMonthlyCount: z.boolean().optional(),
        readTrails: z.boolean().optional(), joinCouncil: z.boolean().optional(), applyContent: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const period = input.period ?? currentPeriod();
        await upsertCommitment({ ...input, period });
        return { ok: true };
      }),

    sign: protectedProcedure
      .input(z.object({ storeId: z.number(), period: z.string().optional(), signedBy: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        const period = input.period ?? currentPeriod();
        await upsertCommitment({ storeId: input.storeId, period, signed: true, signedAt: new Date(), signedBy: input.signedBy });
        return { ok: true };
      }),
  }),




  // ─── Ranking ───────────────────────────────────────────────────────────────
  ranking: router({
    monthly: protectedProcedure.input(z.object({ period: z.string().optional() })).query(async ({ ctx: _ctx, input }) => {
      const period = input.period ?? currentPeriod();
      const { from, to } = periodRange(period);
      const allStores = await getAllStores();
      const results = await Promise.all(allStores.map(async (store) => {
        // GAP 0: fonte única do orçamento
        const orcVigente = await getOrcamentoVigente(store.id, period);
        const config = orcamentoToConfig(orcVigente) ?? storeToConfig(store);
        const entries = await getDailyEntries(store.id, from, to);
        const counts = await getStockCounts(store.id, from, to);
        const actions = await getActionPlans(store.id);
        const trailProgress = await getTrailProgressByStore(store.id);
        const commitment = await getCommitment(store.id, period);
        const quality = await getMonthlyQuality(store.id, period);
        const entriesNum = entries.map((e) => ({ entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor) }));
        const countsNum = counts.map((c) => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        const acc = calcMonthAccumulated(entriesNum, countsNum, config, period);
        const doneActions = actions.filter((a) => a.status === "done").length;
        const totalActions = actions.length;
        // FASE B: sem defaults silenciosos de qualidade
        const qGoogle = quality?.qualityGoogle != null ? toNum(quality.qualityGoogle) : (store.qualityGoogle != null ? toNum(store.qualityGoogle) : null);
        const qAudit = quality?.qualityAudit != null ? toNum(quality.qualityAudit) : (store.qualityAudit != null ? toNum(store.qualityAudit) : null);
        const qChecklist = quality?.qualityChecklist != null ? toNum(quality.qualityChecklist) : (store.qualityChecklist != null ? toNum(store.qualityChecklist) : null);
        const ebitdaOrcadoRs = orcVigente ? (orcamentoToConfig(orcVigente)?.ebitdaOrcado ?? null) : null;
        const cmvMetaPct = orcVigente ? (orcamentoToConfig(orcVigente)?.cmvMetaPct ?? config.budgetCmvPct) : config.budgetCmvPct;
        const { result: sResult, cmv: sCmv, quality: sQuality, total: sTotal } = calcScores(
          acc, ebitdaOrcadoRs, cmvMetaPct, { google: qGoogle, audit: qAudit, checklist: qChecklist, sanitaryGate: store.sanitaryGate ?? true }
        );
        // trailsScore: % de aulas concluídas pela equipe da loja (fonte viva: trilha_progresso).
        // Normalizado pelo total real de aulas publicadas — sem o "/9" mágico da tabela legada.
        const trailsScore = trailProgress.percentual;
        const actionsScore = totalActions > 0 ? (doneActions / totalActions) * 100 : 0;
        const commitmentScore = commitment?.signed ? 100 : 0;
        return {
          storeId: store.id,
          storeName: store.name,
          totalScore: sTotal ?? 0,
          semOrcamento: !orcVigente,
          scores: { ebitda: sResult, cmv: sCmv, quality: sQuality, trails: trailsScore, actions: actionsScore, commitment: commitmentScore },
        };
      }));
      return results.sort((a, b) => b.totalScore - a.totalScore);
    }),

  }),

  // ─── Network (Rede) ────────────────────────────────────────────────────────
  network: router({
    overview: protectedProcedure
      .input(z.object({ period: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const period = input?.period ?? currentPeriod();
      const { from, to } = periodRange(period);
      const allStores = await getAllStores();
      const storeData = await Promise.all(allStores.map(async (store) => {
        // GAP 0: fonte única do orçamento
        const orcVigente = await getOrcamentoVigente(store.id, period);
        const config = orcamentoToConfig(orcVigente) ?? storeToConfig(store);
        const entries = await getDailyEntries(store.id, from, to);
        const counts = await getStockCounts(store.id, from, to);
        const quality = await getMonthlyQuality(store.id, period);
        const actions = await getActionPlans(store.id);
        const commitment = await getCommitment(store.id, period);
        const entriesNum = entries.map((e) => ({ entryDate: e.entryDate, revenue: toNum(e.revenue), invoices: toNum(e.invoices), extraLabor: toNum(e.extraLabor) }));
        const countsNum = counts.map((c) => ({ countDate: c.countDate, totalValue: toNum(c.totalValue) }));
        const acc = calcMonthAccumulated(entriesNum, countsNum, config, period);
        // FASE B: sem defaults silenciosos de qualidade
        const qGoogle = quality?.qualityGoogle != null ? toNum(quality.qualityGoogle) : (store.qualityGoogle != null ? toNum(store.qualityGoogle) : null);
        const qAudit = quality?.qualityAudit != null ? toNum(quality.qualityAudit) : (store.qualityAudit != null ? toNum(store.qualityAudit) : null);
        const qChecklist = quality?.qualityChecklist != null ? toNum(quality.qualityChecklist) : (store.qualityChecklist != null ? toNum(store.qualityChecklist) : null);
        const ebitdaOrcadoRs = orcVigente ? (orcamentoToConfig(orcVigente)?.ebitdaOrcado ?? null) : null;
        const cmvMetaPct = orcVigente ? (orcamentoToConfig(orcVigente)?.cmvMetaPct ?? config.budgetCmvPct) : config.budgetCmvPct;
        const { result: sResult, cmv: sCmv, quality: sQuality, total: sTotal } = calcScores(
          acc, ebitdaOrcadoRs, cmvMetaPct, { google: qGoogle, audit: qAudit, checklist: qChecklist, sanitaryGate: store.sanitaryGate ?? true }
        );
        const overdueActions = actions.filter((a) => (a.status === "todo" || a.status === "doing") && a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10));
        return {
          storeId: store.id,
          storeName: store.name,
          revenue: acc.revenue,
          revenueVsBudgetPct: acc.revenueVsBudgetPct,
          cmvPct: acc.cmvPct,
          budgetCmvPct: config.budgetCmvPct,
          ebitdaPct: acc.ebitdaPct,
          budgetEbitdaPct: acc.budgetEbitdaPct,
          score: sTotal,
          commitmentSigned: commitment?.signed ?? false,
          overdueActionsCount: overdueActions.length,
        };
      }));
      const totalRevenue = storeData.reduce((s, d) => s + d.revenue, 0);
      const avgEbitdaPct = storeData.length > 0 ? storeData.reduce((s, d) => s + d.ebitdaPct, 0) / storeData.length : 0;
      const avgCmvPct = storeData.length > 0 ? storeData.reduce((s, d) => s + d.cmvPct, 0) / storeData.length : 0;
      const avgBudgetRevenue = storeData.length > 0 ? storeData.reduce((s, d) => s + (d.revenue / Math.max(d.revenueVsBudgetPct / 100, 0.01)), 0) / storeData.length : 0;
      const revenueVsBudgetPct = avgBudgetRevenue > 0 ? (totalRevenue / (avgBudgetRevenue * storeData.length)) * 100 : 0;
      return {
        stores: storeData,
        totals: { totalRevenue, avgEbitdaPct, avgCmvPct, revenueVsBudgetPct },
      };
    }),
  }),

  // ─── CMV Advanced Module ──────────────────────────────────────────────────
  cmv: cmvRouter,
  pessoas: pessoasRouter,
  admin: adminRouter,
  experiencia: experienciaRouter,
  preturno: preturnoRouter,
  trilhas: trilhasRouter,
  orcamento: orcamentoRouter,
  manutencoes: manutencoesRouter,
  checklist: checklistRouter,

  // ─── Users (admin) ─────────────────────────────────────────────────────────
  users: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      return getUserByOpenId(ctx.user.openId);
    }),
    promoteToAdmin: protectedProcedure
      .input(z.object({ openId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await upsertUser({ openId: input.openId, role: "admin" });
        return { ok: true };
      }),
  }),
  metas: metasRouter,
  remuneracao: remuneracaoRouter,
  gatilhos: gatilhosRouter,
  holidays: holidaysRouter,
  setup: setupRouter,
  despesas: despesasRouter,
  lancamentos: lancamentosRouter,
  reuniao: reuniaoRouter,
  adminHistorico: adminHistoricoRouter,
});

export type AppRouter = typeof appRouter;
