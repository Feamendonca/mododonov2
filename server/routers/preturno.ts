import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { assertPodeAcessarLoja } from "../auth-helpers";
import { getAllStores } from "../db";
import {
  getPreturnoConfigs, upsertPreturnoConfig, deletePreturnoConfig,
  getPreturnoTemas, createPreturnoTema, deletePreturnoTema,
  getPreturnoCondutores, upsertPreturnoCondutor,
  getAtasToday, createAta, updateAta, getAtaHistory, getAtaById,
  getPreturnoStats, getPreturnoSugestoes,
} from "../db-preturno";

export const preturnoRouter = router({

  // ─── Config ─────────────────────────────────────────────────────────────────
  config: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getPreturnoConfigs(input.storeId);
      }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        storeId: z.number(),
        nome: z.string(),
        diasDaSemana: z.array(z.number().min(0).max(6)),
        horarioEsperado: z.string().regex(/^\d{2}:\d{2}$/),
        condutorPadraoId: z.number().nullish(),
        condutorPadraoNome: z.string().nullish(),
        toleranciaMinutos: z.number().min(0).max(480).optional(),
        ativa: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return upsertPreturnoConfig(input);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return deletePreturnoConfig(input.id, input.storeId);
      }),
  }),

  // ─── Temas ──────────────────────────────────────────────────────────────────
  temas: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getPreturnoTemas(input.storeId);
      }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        label: z.string().min(1),
        ordem: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return createPreturnoTema(input);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number(), storeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return deletePreturnoTema(input.id, input.storeId);
      }),
  }),

  // ─── Condutores ─────────────────────────────────────────────────────────────
  condutores: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getPreturnoCondutores(input.storeId);
      }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        storeId: z.number(),
        employeeId: z.number().nullish(),
        nome: z.string().min(1),
        podeConduzir: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return upsertPreturnoCondutor(input);
      }),
  }),

  // ─── Atas ────────────────────────────────────────────────────────────────────
  atas: router({
    today: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getAtasToday(input.storeId);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getAtaById(input.id)),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        configId: z.number().nullish(),
        nomeReuniao: z.string(),
        data: z.string(),
        horarioEsperado: z.string(),
        horarioInicio: z.string().nullish(),
        status: z.enum(["realizada", "nao-realizada", "atrasada"]),
        motivoNaoRealizada: z.string().nullish(),
        condutorId: z.number().nullish(),
        condutorNome: z.string().nullish(),
        participantes: z.array(z.number()).nullish(),
        participantesNomes: z.array(z.string()).nullish(),
        escaladosNoTurno: z.array(z.number()).nullish(),
        motivoAusencia: z.string().nullish(),
        assunto: z.string().nullish(),
        assuntoTemaId: z.number().nullish(),
        reivindicacao: z.string().nullish(),
        reivindicacaoStatus: z.enum(["nota-pra-depois", "tratada-na-hora", "virou-acao"]).nullish(),
        comentarios: z.string().nullish(),
        criadoPor: z.string().nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return createAta(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["realizada", "nao-realizada", "atrasada"]).optional(),
        motivoNaoRealizada: z.string().nullish(),
        condutorId: z.number().nullish(),
        condutorNome: z.string().nullish(),
        participantes: z.array(z.number()).nullish(),
        participantesNomes: z.array(z.string()).nullish(),
        motivoAusencia: z.string().nullish(),
        assunto: z.string().nullish(),
        assuntoTemaId: z.number().nullish(),
        reivindicacao: z.string().nullish(),
        reivindicacaoStatus: z.enum(["nota-pra-depois", "tratada-na-hora", "virou-acao"]).nullish(),
        reivindicacaoAcaoId: z.number().nullish(),
        comentarios: z.string().nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ata = await getAtaById(input.id);
        if (!ata) throw new TRPCError({ code: "NOT_FOUND" });
        await assertPodeAcessarLoja(ctx, ata.storeId);
        const { id, ...data } = input;
        return updateAta(id, data);
      }),

    history: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.string().optional(),
        condutorId: z.number().optional(),
        comReivindicacao: z.boolean().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getAtaHistory(input.storeId, input);
      }),
  }),

  // ─── Stats ───────────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      year: z.number().optional(),
      month: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const now = new Date();
      return getPreturnoStats(
        input.storeId,
        input.year ?? now.getFullYear(),
        input.month ?? now.getMonth() + 1
      );
    }),

  // ─── Sugestões ───────────────────────────────────────────────────────────────
  sugestoes: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getPreturnoSugestoes(input.storeId);
    }),

  // ─── Disciplina Ranking (admin) ───────────────────────────────────────────────────────────────
  disciplinaRanking: protectedProcedure
    .input(z.object({
      year: z.number().optional(),
      month: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date();
      const year = input?.year ?? now.getFullYear();
      const month = input?.month ?? (now.getMonth() + 1);
      const todayDow = now.getDay();

      const allStores = await getAllStores();

      const results = await Promise.all(allStores.map(async (store) => {
        const stats = await getPreturnoStats(store.id, year, month);
        const configs = await getPreturnoConfigs(store.id);
        const todayConfigs = configs.filter((c) => c.diasDaSemana.includes(todayDow));

        let todayStatus: "realizado" | "pendente" | "sem-config" = "sem-config";
        if (todayConfigs.length > 0) {
          const atasHoje = await getAtasToday(store.id);
          const allDone = todayConfigs.every((cfg) => {
            const estado = atasHoje.find((a) => a.configId === cfg.id);
            return estado?.estado === "realizado";
          });
          todayStatus = allDone ? "realizado" : "pendente";
        }

        return {
          storeId: store.id,
          storeName: store.name,
          disciplinaPct: stats.disciplinaPct,
          realizadasMes: stats.realizadasMes,
          esperadasMes: stats.esperadasMes,
          reivindicacoesAbertas: stats.reivindicacoesAbertas,
          quemMaisConduziu: stats.quemMaisConduziu,
          todayStatus,
          hasConfig: configs.length > 0,
        };
      }));

      results.sort((a, b) => b.disciplinaPct - a.disciplinaPct);

      const withConfig = results.filter((r) => r.hasConfig);
      const avgDisciplina = withConfig.length > 0
        ? Math.round(withConfig.reduce((s, r) => s + r.disciplinaPct, 0) / withConfig.length)
        : 0;

      return { ranking: results, avgDisciplina, year, month };
    }),
});
