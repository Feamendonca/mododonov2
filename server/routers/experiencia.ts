import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertPodeAcessarLoja } from "../auth-helpers";
import {
  getReviews, getReviewById, createReview, updateReview,
  getMonthlyReviewStats, getWeekReviews,
  getServiceStandards, createServiceStandard, updateServiceStandard,
  getStandardObservations, createStandardObservation, getEmployeeObsSummary,
  getTrainingSessions, createTrainingSession, updateTrainingSession, getWeekTrainingCount,
  getCouncilCases, createCouncilCase, updateCouncilCase,
  generateExperienceSuggestions,
  getServiceStandardById, getTrainingSessionById, getCouncilCaseById,
} from "../db-experiencia";

export const experienciaRouter = router({
  // ─── Reviews ───────────────────────────────────────────────────────────────
  reviews: router({
    list: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        platform: z.string().optional(),
        minStars: z.number().optional(),
        maxStars: z.number().optional(),
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getReviews(input.storeId, input);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getReviewById(input.id)),

    weekList: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getWeekReviews(input.storeId);
      }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        platform: z.enum(["google", "tripadvisor", "ifood", "manual"]),
        stars: z.number().min(1).max(5),
        clientName: z.string().nullish(),
        text: z.string().nullish(),
        originalLink: z.string().nullish(),
        reviewDate: z.string(),
        tags: z.array(z.string()).nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return createReview(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        category: z.string().optional(),
        wentToTable: z.boolean().optional(),
        wentToTableAt: z.string().nullish(),
        replied: z.boolean().optional(),
        repliedAt: z.string().nullish(),
        replyText: z.string().nullish(),
        actionTaken: z.string().nullish(),
        linkedActionId: z.number().nullish(),
        linkedEmployeeId: z.number().nullish(),
        publishedToCouncil: z.boolean().optional(),
        councilCaseId: z.number().nullish(),
        tags: z.array(z.string()).nullish(),
        status: z.enum(["registrada", "em-acao", "respondida", "fechada", "ignorada"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const review = await getReviewById(input.id);
        if (!review) throw new TRPCError({ code: "NOT_FOUND" });
        await assertPodeAcessarLoja(ctx, review.storeId);
        const { id, ...data } = input;
        return updateReview(id, data);
      }),

    monthlyStats: protectedProcedure
      .input(z.object({ storeId: z.number(), year: z.number(), month: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getMonthlyReviewStats(input.storeId, input.year, input.month);
      }),
  }),

  // ─── Service Standards ─────────────────────────────────────────────────────
  standards: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number(), brand: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getServiceStandards(input.storeId, input.brand);
      }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number().nullish(),
        layer: z.enum(["base", "marca", "loja", "franqueadora"]),
        brand: z.string().nullish(),
        category: z.enum(["entrada", "mesa", "pedido", "cozinha", "saida", "pos-atendimento", "digital"]),
        text: z.string().min(1),
        whyText: z.string().nullish(),
        positiveExample: z.string().nullish(),
        negativeExample: z.string().nullish(),
        appliesTo: z.array(z.string()).nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.storeId != null) await assertPodeAcessarLoja(ctx, input.storeId);
        return createServiceStandard(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        text: z.string().optional(),
        whyText: z.string().nullish(),
        positiveExample: z.string().nullish(),
        negativeExample: z.string().nullish(),
        appliesTo: z.array(z.string()).nullish(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const std = await getServiceStandardById(input.id);
        if (!std) throw new TRPCError({ code: "NOT_FOUND" });
        if (std.storeId != null) await assertPodeAcessarLoja(ctx, std.storeId);
        const { id, ...data } = input;
        return updateServiceStandard(id, data);
      }),
  }),

  // ─── Standard Observations ─────────────────────────────────────────────────
  observations: router({
    list: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        employeeId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getStandardObservations(input.storeId, input);
      }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        employeeId: z.number(),
        standardId: z.number().nullish(),
        observationDate: z.string(),
        type: z.enum(["positivo", "a-melhorar", "neutro"]),
        text: z.string().min(1),
        author: z.enum(["gestor", "supervisor", "lider"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return createStandardObservation(input);
      }),

    summary: protectedProcedure
      .input(z.object({ storeId: z.number(), year: z.number(), month: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getEmployeeObsSummary(input.storeId, input.year, input.month);
      }),
  }),

  // ─── Training Sessions ─────────────────────────────────────────────────────
  training: router({
    list: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getTrainingSessions(input.storeId, input);
      }),

    weekCount: protectedProcedure
      .input(z.object({ storeId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getWeekTrainingCount(input.storeId);
      }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        sessionDate: z.string(),
        theme: z.string().min(1),
        linkedStandardId: z.number().nullish(),
        contentLink: z.string().nullish(),
        contentText: z.string().nullish(),
        participants: z.array(z.number()).nullish(),
        status: z.enum(["planejada", "realizada", "cancelada", "remarcada"]).optional(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return createTrainingSession(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        theme: z.string().optional(),
        sessionDate: z.string().optional(),
        status: z.enum(["planejada", "realizada", "cancelada", "remarcada"]).optional(),
        notes: z.string().nullish(),
        participants: z.array(z.number()).nullish(),
        linkedStandardId: z.number().nullish(),
        contentLink: z.string().nullish(),
        contentText: z.string().nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        const session = await getTrainingSessionById(input.id);
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        await assertPodeAcessarLoja(ctx, session.storeId);
        const { id, ...data } = input;
        return updateTrainingSession(id, data);
      }),
  }),

  // ─── Council Cases ─────────────────────────────────────────────────────────
  council: router({
    list: protectedProcedure
      .input(z.object({ storeId: z.number(), onlyShared: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return getCouncilCases(input.storeId, input.onlyShared ?? false);
      }),

    create: protectedProcedure
      .input(z.object({
        storeId: z.number(),
        caseDate: z.string(),
        title: z.string().min(1),
        category: z.enum(["situacao-dificil", "inspiracao", "duvida", "aprendizado", "outros"]),
        text: z.string().min(1),
        learning: z.string().nullish(),
        linkedReviewId: z.number().nullish(),
        employeeName: z.string().nullish(),
        shared: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertPodeAcessarLoja(ctx, input.storeId);
        return createCouncilCase({ ...input, authorUserId: ctx.user!.id });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["em-discussao", "encerrado", "consolidado"]).optional(),
        passedByStores: z.array(z.number()).optional(),
        tookToTeamStores: z.array(z.number()).optional(),
        consolidatedStandardId: z.number().nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ccase = await getCouncilCaseById(input.id);
        if (!ccase) throw new TRPCError({ code: "NOT_FOUND" });
        await assertPodeAcessarLoja(ctx, ccase.storeId);
        const { id, ...data } = input;
        return updateCouncilCase(id, data);
      }),
  }),

  // ─── Suggestions ───────────────────────────────────────────────────────────
  suggestions: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      metaAvaliacoesPositivas: z.number().default(40),
      prazoMesa: z.number().default(24),
      prazoResposta: z.number().default(48),
    }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return generateExperienceSuggestions(input.storeId, {
        metaAvaliacoesPositivas: input.metaAvaliacoesPositivas,
        prazoMesa: input.prazoMesa,
        prazoResposta: input.prazoResposta,
      });
    }),
});
