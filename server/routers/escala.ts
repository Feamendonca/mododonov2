/**
 * escala.ts — tRPC router do módulo de Escala (Task 4)
 *
 * Ponte entre a lógica pura das Tasks 1-3 (catálogo legal, resolvedor de
 * regras, produtividade sugerida) e o banco. Procedures finas: leem do
 * banco (server/db-escala-config.ts), chamam função pura quando precisa
 * compor, devolvem — nunca reimplementam regra de negócio aqui (R2).
 *
 * Regra não-negociável do app, sem exceção: toda procedure é
 * `protectedProcedure` e chama `await assertPodeAcessarLoja(ctx,
 * input.storeId)` como a primeira coisa — inclusive `getCatalogo`, cujo
 * dado não varia por loja: o gate de acesso é sobre "o usuário pode operar
 * esta loja", não sobre "o dado pertence a esta loja".
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { assertPodeAcessarLoja } from "../auth-helpers";
import { getStoreById } from "../db";
import {
  createFuncao,
  desativarFuncao,
  getCatalogoVigente,
  getFuncoes,
  getRegras,
  sugerirProdutividade,
  updateFuncao,
  upsertRegraLoja,
} from "../db-escala-config";
import { resolverRegras } from "../escala-regras";

// ─── Schemas compartilhados ───────────────────────────────────────────────────

const driverSchema = z.enum(["tickets", "pratos", "cobertos"]);
const produtividadeOrigemSchema = z.enum(["sugerida_historico", "sugerida_benchmark", "definida_gestor"]);
const tipoRegraSchema = z.enum(["DURA", "MOLE", "DEPENDE_CCT"]);

/** Formato ISO "AAAA-MM-DD" — exigido explicitamente para nunca repetir o
 * defeito da Task 2 (data em formato BR comparada como string devolve a
 * regra errada, em silêncio). Validar na borda é mais barato que validar
 * depois de já ter resolvido regra errada. */
const dataIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato ISO "AAAA-MM-DD".');

/** `uf` sempre normalizada (maiúscula, sem espaços) antes de qualquer
 * comparação — mesma convenção de `escala-regras.ts` (normalizarUf), pra
 * não repetir o defeito "sp" ≠ "SP" (achado I4 da Task 2). */
function normalizarUf(uf: string | null | undefined): string | null {
  if (uf === null || uf === undefined) return null;
  const limpa = uf.trim().toUpperCase();
  return limpa.length > 0 ? limpa : null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const escalaRouter = router({
  // ── Funções da loja ───────────────────────────────────────────────────────
  getConfig: protectedProcedure
    .input(z.object({ storeId: z.number(), includeInactive: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getFuncoes(input.storeId, input.includeInactive ?? false);
    }),

  salvarFuncao: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        id: z.number().optional(),
        nome: z.string().min(1).max(64),
        driver: driverSchema,
        produtividadeAlvo: z.number().min(0).nullable().optional(),
        produtividadeOrigem: produtividadeOrigemSchema.nullable().optional(),
        // R13/brief: minPorBloco é sempre >= 1 — 0 "funções" num bloco não é
        // configuração, é a função não existir no bloco (não cadastrar).
        minPorBloco: z.number().int().min(1),
        maxPorBloco: z.number().int().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, id, ...data } = input;
      if (id !== undefined) {
        await updateFuncao(id, storeId, data);
        return { id, success: true };
      }
      const novoId = await createFuncao(storeId, data);
      return { id: novoId, success: true };
    }),

  desativarFuncao: protectedProcedure
    .input(z.object({ storeId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      await desativarFuncao(input.id, input.storeId);
      return { success: true };
    }),

  // ── Regras ───────────────────────────────────────────────────────────────
  getRegrasVigentes: protectedProcedure
    .input(z.object({ storeId: z.number(), data: dataIsoSchema }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);

      const store = await getStoreById(input.storeId);
      const uf = normalizarUf(store?.uf);
      const avisoUfAusente = uf === null;

      const candidatas = await getRegras(input.storeId, uf);
      const resolvidas = resolverRegras(candidatas, {
        storeId: input.storeId,
        // ContextoResolucao.uf é string (não aceita null) — "" nunca bate
        // com nenhuma UF real de regra cadastrada, então o efeito é
        // exatamente o pedido pelo R13: só regras de rede se aplicam.
        uf: uf ?? "",
        data: input.data,
      });

      return {
        regras: Array.from(resolvidas.values()),
        // 🔴 R13: a ausência de UF NUNCA pode ser silenciosa — a tela
        // precisa deste campo pra avisar o gestor, não só devolver menos
        // regras sem dizer por quê.
        avisoUfAusente,
        aviso: avisoUfAusente
          ? "Esta loja não tem estado (UF) cadastrado; regras estaduais não estão sendo aplicadas — somente as regras de rede."
          : null,
      };
    }),

  salvarRegraLoja: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        chave: z.string().min(1).max(64),
        valor: z.unknown(),
        tipo: tipoRegraSchema,
        vigenciaInicio: dataIsoSchema.nullable().optional(),
        vigenciaFim: dataIsoSchema.nullable().optional(),
        fonte: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, ...data } = input;
      await upsertRegraLoja(storeId, data);
      return { success: true };
    }),

  // ── Catálogo legal ────────────────────────────────────────────────────────
  getCatalogo: protectedProcedure
    .input(z.object({ storeId: z.number(), data: dataIsoSchema }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return getCatalogoVigente(input.data);
    }),

  // ── Produtividade sugerida ────────────────────────────────────────────────
  sugerirProdutividade: protectedProcedure
    .input(z.object({ storeId: z.number(), funcaoId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return sugerirProdutividade(input.storeId, input.funcaoId);
    }),
});
