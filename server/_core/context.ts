import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Client com a service_role key — só o servidor deve ter acesso a ela.
// Usada exclusivamente para verificar o access_token que o front manda no
// header Authorization (nunca para operações em nome do usuário).
const supabaseAdmin = ENV.supabaseUrl && ENV.supabaseServiceRoleKey
  ? createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Autentica a requisição via Supabase Auth.
 *
 * Fluxo:
 *  1. O front manda o access_token do Supabase no header `Authorization: Bearer <token>`.
 *  2. O servidor verifica o token de verdade contra o Supabase (`auth.getUser`),
 *     usando a service_role key — nunca confia em claim nenhuma vinda do client.
 *  3. O e-mail retornado pelo Supabase é usado para localizar a linha correspondente
 *     na tabela local `users` (coluna `email`).
 *  4. Se o token for inválido/expirado, ou não existir usuário local com aquele
 *     e-mail, o resultado é `null` — equivalente ao comportamento anterior de
 *     "sessão inválida" (autenticação é opcional; quem exige usuário é o
 *     `protectedProcedure`/`adminProcedure` em server/_core/trpc.ts).
 */
async function authenticateViaSupabase(req: Request): Promise<User | null> {
  if (!supabaseAdmin) return null;

  const token = extractBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.email) return null;

  const localUser = await db.getUserByEmail(data.user.email);
  return localUser ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateViaSupabase(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
