/**
 * O `SUPABASE_URL` do .env às vezes vem com o sufixo `/rest/v1` (copiado da
 * seção "Connection string" do painel REST do Supabase). O SDK
 * `@supabase/supabase-js` (usado para Auth) espera a URL "nua" do projeto
 * (`https://<ref>.supabase.co`) — ele mesmo monta `/auth/v1/...` por baixo.
 * Normalizamos aqui para aceitar as duas formas sem quebrar.
 */
function normalizeSupabaseUrl(raw: string): string {
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Supabase — usado pelo novo login (server/_core/context.ts) e pelo script
  // scripts/create-admin.ts. A service role key NUNCA deve ser exposta ao client.
  supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL ?? ""),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // IA (Claude/Anthropic) — usado por server/_core/llm.ts. Os campos forgeApiUrl/forgeApiKey
  // acima continuam em uso por outros módulos (maps, heartbeat, notification,
  // imageGeneration[geração de imagem], voiceTranscription) e não devem ser removidos.
  // OBS: server/storage.ts NÃO usa mais forge — foi migrado para Supabase Storage.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
