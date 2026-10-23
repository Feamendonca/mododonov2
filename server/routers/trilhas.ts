import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { assertPodeAcessarLoja } from "../auth-helpers";
import {
  listTrilhas, getTrilha, getTrilhaBySlug, createTrilha, updateTrilha,
  listModulos, createModulo,
  listAulas, listAulasByTrilha, getAula, createAula, updateAula,
  getProgresso, getProgressoAula, upsertProgresso,
  getCompromisso, upsertCompromisso, listCompromissosPendentes,
  getTrilhaStats,
} from "../db-trilhas";
import { seedTrilhasData } from "../seed-trilhas-data";

const ConteudoBlocoSchema = z.object({
  tipo: z.enum(["texto", "tabela", "destaque", "lista", "caso"]),
  titulo: z.string().optional(),
  conteudo: z.string().optional(),
  colunas: z.array(z.string()).optional(),
  linhas: z.array(z.array(z.string())).optional(),
});

export const trilhasRouter = router({
  // ─── Trilhas ────────────────────────────────────────────────────────────────

  list: protectedProcedure.query(async () => {
    return listTrilhas(true);
  }),

  listAdmin: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    return listTrilhas(false);
  }),

  get: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const trilha = await getTrilhaBySlug(input.slug);
      if (!trilha) throw new TRPCError({ code: "NOT_FOUND" });
      return trilha;
    }),

  // ─── Módulos e Aulas ────────────────────────────────────────────────────────

  getWithContent: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input, ctx }) => {
      const trilha = await getTrilhaBySlug(input.slug);
      if (!trilha) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ctx.user.role === "admin";
      const modulos = await listModulos(trilha.id);
      const modulosComAulas = await Promise.all(
        modulos.map(async (m) => {
          const aulas = await listAulas(m.id, !isAdmin);
          return { ...m, aulas };
        })
      );
      return { trilha, modulos: modulosComAulas };
    }),

  getAula: protectedProcedure
    .input(z.object({ aulaId: z.number() }))
    .query(async ({ input, ctx }) => {
      const aula = await getAula(input.aulaId);
      if (!aula) throw new TRPCError({ code: "NOT_FOUND" });
      // Gestores só veem aulas publicadas
      if (ctx.user.role !== "admin" && aula.status !== "publicada") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return aula;
    }),

  // ─── Progresso ──────────────────────────────────────────────────────────────

  getProgresso: protectedProcedure
    .input(z.object({ trilhaId: z.number() }))
    .query(async ({ input, ctx }) => {
      return getProgresso(ctx.user.id, input.trilhaId);
    }),

  iniciarAula: protectedProcedure
    .input(z.object({ aulaId: z.number(), trilhaId: z.number(), storeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const existing = await getProgressoAula(ctx.user.id, input.aulaId);
      if (existing && existing.status === "concluida") return; // já concluída, não regride
      await upsertProgresso({
        user_id: ctx.user.id,
        store_id: input.storeId,
        aula_id: input.aulaId,
        trilha_id: input.trilhaId,
        status: "em_andamento",
      });
    }),

  concluirAula: protectedProcedure
    .input(z.object({
      aulaId: z.number(),
      trilhaId: z.number(),
      storeId: z.number(),
      pontuacaoQuiz: z.number().optional(),
      totalQuestoes: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await upsertProgresso({
        user_id: ctx.user.id,
        store_id: input.storeId,
        aula_id: input.aulaId,
        trilha_id: input.trilhaId,
        status: "concluida",
        pontuacao_quiz: input.pontuacaoQuiz,
        total_questoes: input.totalQuestoes,
      });
    }),

  // ─── Compromissos ───────────────────────────────────────────────────────────

  getCompromisso: protectedProcedure
    .input(z.object({ aulaId: z.number() }))
    .query(async ({ input, ctx }) => {
      return getCompromisso(ctx.user.id, input.aulaId);
    }),

  registrarCompromisso: protectedProcedure
    .input(z.object({
      aulaId: z.number(),
      trilhaId: z.number(),
      storeId: z.number(),
      feito: z.boolean(),
      resultado: z.string().optional(),
      resultadoNumerico: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await upsertCompromisso({
        user_id: ctx.user.id,
        store_id: input.storeId,
        aula_id: input.aulaId,
        trilha_id: input.trilhaId,
        feito: input.feito,
        resultado: input.resultado,
        resultado_numerico: input.resultadoNumerico,
      });
    }),

  compromissosPendentes: protectedProcedure.query(async ({ ctx }) => {
    return listCompromissosPendentes(ctx.user.id);
  }),

  // ─── Stats ──────────────────────────────────────────────────────────────────

  stats: protectedProcedure
    .input(z.object({ trilhaId: z.number() }))
    .query(async ({ input, ctx }) => {
      return getTrilhaStats(ctx.user.id, input.trilhaId);
    }),

  // ─── Admin: CRUD ────────────────────────────────────────────────────────────

  adminCreateTrilha: protectedProcedure
    .input(z.object({
      slug: z.string().min(2),
      titulo: z.string().min(2),
      descricao: z.string().optional(),
      publico: z.enum(["gestor", "admin", "todos"]).optional(),
      status: z.enum(["rascunho", "publicada", "arquivada"]).optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const id = await createTrilha(input);
      return { id };
    }),

  adminUpdateTrilha: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().optional(),
      descricao: z.string().optional(),
      publico: z.enum(["gestor", "admin", "todos"]).optional(),
      status: z.enum(["rascunho", "publicada", "arquivada"]).optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { id, ...data } = input;
      await updateTrilha(id, data);
    }),

  adminCreateModulo: protectedProcedure
    .input(z.object({
      trilhaId: z.number(),
      titulo: z.string().min(2),
      descricao: z.string().optional(),
      ordem: z.number().optional(),
      mesLabel: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const id = await createModulo({
        trilha_id: input.trilhaId,
        titulo: input.titulo,
        descricao: input.descricao,
        ordem: input.ordem,
        mes_label: input.mesLabel,
      });
      return { id };
    }),

  adminCreateAula: protectedProcedure
    .input(z.object({
      moduloId: z.number(),
      trilhaId: z.number(),
      numeroSemana: z.number().optional(),
      titulo: z.string().min(2),
      subtitulo: z.string().optional(),
      objetivo: z.string().optional(),
      porQue: z.string().optional(),
      duracaoMin: z.number().optional(),
      conteudo: z.array(ConteudoBlocoSchema).optional(),
      indicadorFoco: z.string().optional(),
      compromissoTexto: z.string().optional(),
      materialApoio: z.array(z.string()).optional(),
      notaFacilitador: z.string().optional(),
      status: z.enum(["rascunho", "publicada"]).optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const id = await createAula({
        modulo_id: input.moduloId,
        trilha_id: input.trilhaId,
        numero_semana: input.numeroSemana,
        titulo: input.titulo,
        subtitulo: input.subtitulo,
        objetivo: input.objetivo,
        por_que: input.porQue,
        duracao_min: input.duracaoMin,
        conteudo: input.conteudo,
        indicador_foco: input.indicadorFoco,
        compromisso_texto: input.compromissoTexto,
        material_apoio: input.materialApoio,
        nota_facilitador: input.notaFacilitador,
        status: input.status,
        ordem: input.ordem,
      });
      return { id };
    }),

  adminUpdateAula: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().optional(),
      subtitulo: z.string().optional(),
      objetivo: z.string().optional(),
      porQue: z.string().optional(),
      duracaoMin: z.number().optional(),
      conteudo: z.array(ConteudoBlocoSchema).optional(),
      indicadorFoco: z.string().optional(),
      compromissoTexto: z.string().optional(),
      materialApoio: z.array(z.string()).optional(),
      notaFacilitador: z.string().optional(),
      status: z.enum(["rascunho", "publicada"]).optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { id, porQue, duracaoMin, indicadorFoco, compromissoTexto, materialApoio, notaFacilitador, ...rest } = input;
      await updateAula(id, {
        ...rest,
        por_que: porQue,
        duracao_min: duracaoMin,
        indicador_foco: indicadorFoco,
        compromisso_texto: compromissoTexto,
        material_apoio: materialApoio,
        nota_facilitador: notaFacilitador,
      });
    }),

  adminPublishAula: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateAula(input.id, { status: "publicada" });
    }),

  adminUnpublishAula: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateAula(input.id, { status: "rascunho" });
    }),

  // ─── Seed ─────────────────────────────────────────────────────────────────
  seed: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    return seedTrilhasData();
  }),
});
