/**
 * auth-helpers.ts
 * Helpers de autorização reutilizáveis para procedures tRPC.
 */
import { TRPCError } from "@trpc/server";
import { getStoresByUserId } from "./db";

/**
 * Garante que o usuário pode acessar/modificar a loja informada.
 * - Admin: passa sempre.
 * - Não-admin: verifica vínculo em user_stores; lança FORBIDDEN se não vinculado.
 *
 * @param ctx  Contexto tRPC (deve ter ctx.user.id e ctx.user.role)
 * @param storeId  ID da loja a verificar
 */
export async function assertPodeAcessarLoja(
  ctx: { user: { id: number; role: string } },
  storeId: number
): Promise<void> {
  if (ctx.user.role === "admin") return; // admin acessa qualquer loja
  const lojas = await getStoresByUserId(ctx.user.id);
  const vinculado = lojas.some(l => l.id === storeId);
  if (!vinculado) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não tem permissão para acessar a loja ${storeId}.`,
    });
  }
}

/**
 * Regra "lançamento do dia": não-admin só pode excluir registros do dia atual.
 * Admin apaga qualquer coisa.
 */
export async function assertPodeExcluirLancamento(
  ctx: { user: { id: number; role: string } },
  storeId: number,
  dataDoRegistro: string // YYYY-MM-DD
): Promise<void> {
  if (ctx.user.role === "admin") return;
  await assertPodeAcessarLoja(ctx, storeId);
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date()); // formato YYYY-MM-DD
  if (dataDoRegistro !== hoje) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Só o administrador pode excluir lançamentos de dias anteriores. Peça ao ADM.",
    });
  }
}
