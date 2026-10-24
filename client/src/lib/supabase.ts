import { createClient } from "@supabase/supabase-js";

// Client do Supabase usado no browser — SEMPRE com a chave anon (nunca a
// service_role, que só existe no servidor). Usado para login (e-mail+senha),
// logout e para ler o access_token que vai no header Authorization das
// chamadas tRPC (ver client/src/main.tsx).

// Alguns .env copiam a URL com o sufixo `/rest/v1` (da seção REST do painel
// Supabase). O SDK de Auth espera a URL "nua" do projeto — normalizamos aqui.
function normalizeSupabaseUrl(raw: string): string {
  return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

const supabaseUrlRaw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const supabaseUrl = supabaseUrlRaw ? normalizeSupabaseUrl(supabaseUrlRaw) : "";

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas. Login não vai funcionar."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey ?? "");
