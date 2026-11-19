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
import { TRPCError } from "@trpc/server";
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
  RegraLojaNaoPermitidaError,
  sugerirProdutividade,
  updateFuncao,
  upsertRegraLoja,
} from "../db-escala-config";
import { normalizarUf, resolverRegras } from "../escala-regras";

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
      z
        .object({
          storeId: z.number(),
          id: z.number().optional(),
          // M3 (pós-revisão da Task 5): sem `.trim()`, `"   "` (só espaços)
          // passava aqui (min(1) conta os espaços) e a TELA rejeitava —
          // mais restritiva que o servidor, ao contrário da premissa
          // (tela espelha o servidor, nunca o contrário). Corrigido
          // apertando o servidor: nome só de espaços é lixo nos dois
          // lados, e `.trim()` roda antes de `.min(1)` — "   " trimado
          // vira "" e cai no mesmo erro de nome vazio.
          nome: z.string().trim().min(1).max(64),
          driver: driverSchema,
          // I7 do fix loop da Task 4: 0 PASSAVA antes (`.min(0)`), e o
          // dimensionamento faz `demanda ÷ produtividade` — 0 vira
          // `Infinity`. Mesma razão pela qual `minPorBloco=0` é proibido.
          produtividadeAlvo: z.number().positive().nullable().optional(),
          produtividadeOrigem: produtividadeOrigemSchema.nullable().optional(),
          // R13/brief: minPorBloco é sempre >= 1 — 0 "funções" num bloco não é
          // configuração, é a função não existir no bloco (não cadastrar).
          minPorBloco: z.number().int().min(1),
          maxPorBloco: z.number().int().min(1).nullable().optional(),
        })
        // I7: min=5/max=2 era aceito antes e virava restrição
        // insatisfazível silenciosa (nenhum número de pessoas por bloco
        // atende as duas travas ao mesmo tempo).
        .refine((input) => input.maxPorBloco == null || input.maxPorBloco >= input.minPorBloco, {
          message: "maxPorBloco não pode ser menor que minPorBloco.",
          path: ["maxPorBloco"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, id, ...data } = input;
      if (id !== undefined) {
        const atualizou = await updateFuncao(id, storeId, data);
        // Menor 9/10 do fix loop: antes, id de outra loja ou inexistente
        // respondia `{success: true}` tendo alterado 0 linhas.
        if (!atualizou) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Função ${id} não encontrada na loja ${storeId}.`,
          });
        }
        return { id, success: true };
      }
      const novoId = await createFuncao(storeId, data);
      return { id: novoId, success: true };
    }),

  desativarFuncao: protectedProcedure
    .input(z.object({ storeId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const desativou = await desativarFuncao(input.id, input.storeId);
      if (!desativou) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Função ${input.id} não encontrada na loja ${input.storeId}.`,
        });
      }
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
        // Menor 14 do fix loop: `z.unknown()` puro aceitava `null`, que
        // viola o `NOT NULL` da coluna `valor` (jsonb) e virava 500 do
        // Postgres em vez de um erro de validação claro na borda.
        valor: z.unknown().refine((v) => v !== null && v !== undefined, {
          message: "valor não pode ser nulo.",
        }),
        tipo: tipoRegraSchema,
        vigenciaInicio: dataIsoSchema.nullable().optional(),
        vigenciaFim: dataIsoSchema.nullable().optional(),
        fonte: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      const { storeId, ...data } = input;
      try {
        await upsertRegraLoja(storeId, data);
      } catch (erro) {
        // I6 do fix loop: `upsertRegraLoja` lança `RegraLojaNaoPermitidaError`
        // quando a loja tentaria sobrescrever (fora de MOLE) uma chave do
        // catálogo legal de rede — ex.: derrubar `jornada_max_semanal` da
        // EC 141 com uma regra de escopo loja, que venceria por precedência
        // (Task 2: loja > rede). Convertido pra FORBIDDEN, não 500.
        if (erro instanceof RegraLojaNaoPermitidaError) {
          throw new TRPCError({ code: "FORBIDDEN", message: erro.message });
        }
        throw erro;
      }
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
  // R20 (pós-revisão da Task 5): `funcaoId` era obrigatório, o que impedia
  // sugerir produtividade para uma função ainda não criada — o caso mais
  // comum (gestor cadastrando a loja do zero). A sugestão deriva do
  // histórico da loja por `driver`, não da identidade da função;
  // `funcaoId` agora é OPCIONAL e só refina (confirma que a função já
  // existe nesta loja) quando informado.
  sugerirProdutividade: protectedProcedure
    .input(z.object({ storeId: z.number(), driver: driverSchema, funcaoId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await assertPodeAcessarLoja(ctx, input.storeId);
      return sugerirProdutividade(input.storeId, input.driver, input.funcaoId);
    }),
});
