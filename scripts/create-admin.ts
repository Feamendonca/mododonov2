/**
 * scripts/create-admin.ts
 *
 * Cria o primeiro usuário admin do Modo Dono pós-migração para Supabase Auth.
 *
 * O que faz:
 *  1. Cria (ou localiza, se já existir) o usuário no Supabase Auth via
 *     `supabase.auth.admin.createUser` (service_role key — nunca a anon key).
 *     O e-mail é criado já confirmado (`email_confirm: true`), então o login
 *     funciona imediatamente, sem precisar de link de confirmação por e-mail.
 *  2. Garante a linha correspondente na tabela local `users` (Postgres/Supabase
 *     DB) com `email` preenchido e `role = 'admin'` — é esse `email` que
 *     server/_core/context.ts usa para mapear o access_token do Supabase pro
 *     usuário local em cada requisição.
 *
 *  Idempotente: pode rodar de novo com o mesmo e-mail sem duplicar nada —
 *  se o usuário já existir no Supabase Auth, só garante a senha e a linha local.
 *
 * Uso:
 *   npx tsx scripts/create-admin.ts --email=voce@amfoods.com.br --password="SenhaForte123!" --name="Seu Nome"
 *
 * Variáveis necessárias no .env (já devem estar lá — ver Task 6):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 *
 * IMPORTANTE: este script cria uma conta real no Supabase Auth e um usuário
 * admin real no banco. Não rode em produção sem ter certeza do e-mail/senha.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../server/_core/env";
import * as db from "../server/db";

function parseArgs(): { email?: string; password?: string; name?: string } {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main() {
  const { email, password, name } = parseArgs();

  if (!email || !password) {
    console.error(
      [
        "Uso: npx tsx scripts/create-admin.ts --email=<email> --password=<senha> [--name=<nome>]",
        "",
        "Exemplo:",
        '  npx tsx scripts/create-admin.ts --email=fernando@amfoods.com.br --password="SenhaForte123!" --name="Fernando"',
      ].join("\n")
    );
    process.exit(1);
  }

  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    console.error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas no .env. Abortando."
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Supabase Auth — cria o usuário (ou reaproveita se já existir).
  let supabaseUserId: string | null = null;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { name } : undefined,
  });

  if (createError) {
    const alreadyExists = /already.*registered|already.*exists/i.test(createError.message ?? "");
    if (!alreadyExists) {
      console.error("[create-admin] Falha ao criar usuário no Supabase Auth:", createError.message);
      process.exit(1);
    }
    console.log(`[create-admin] Usuário ${email} já existe no Supabase Auth — localizando...`);
    // listUsers não filtra por e-mail diretamente — paginamos até achar.
    let page = 1;
    const perPage = 200;
    while (!supabaseUserId) {
      const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (listError) {
        console.error("[create-admin] Falha ao listar usuários do Supabase Auth:", listError.message);
        process.exit(1);
      }
      const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        supabaseUserId = found.id;
        break;
      }
      if (list.users.length < perPage) break; // última página, não achou
      page += 1;
    }
    if (!supabaseUserId) {
      console.error(`[create-admin] Não foi possível localizar o usuário ${email} no Supabase Auth.`);
      process.exit(1);
    }
    // Garante a senha atualizada mesmo se o usuário já existia.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
      password,
      email_confirm: true,
    });
    if (updateError) {
      console.warn("[create-admin] Aviso: não foi possível atualizar a senha:", updateError.message);
    }
  } else {
    supabaseUserId = created.user.id;
    console.log(`[create-admin] Usuário criado no Supabase Auth: ${email} (id=${supabaseUserId})`);
  }

  // 2) Banco local — garante a linha em `users` com role='admin' e email preenchido.
  // openId é NOT NULL/UNIQUE no schema (legado do login antigo); usamos o id
  // do Supabase prefixado para garantir unicidade e rastreabilidade.
  const openId = `supabase_${supabaseUserId}`;
  const existingByEmail = await db.getUserByEmail(email);

  if (existingByEmail) {
    console.log(`[create-admin] Usuário local já existe (id=${existingByEmail.id}) — promovendo a admin.`);
    await db.upsertUser({
      openId: existingByEmail.openId,
      name: name ?? existingByEmail.name,
      email,
      lastSignedIn: new Date(),
    });
    await db.setUserRole(existingByEmail.openId, "admin");
  } else {
    console.log(`[create-admin] Criando usuário local para ${email} (openId=${openId}).`);
    await db.upsertUser({
      openId,
      name: name ?? email,
      email,
      loginMethod: "supabase",
      lastSignedIn: new Date(),
    });
    await db.setUserRole(openId, "admin");
  }

  console.log(`[create-admin] OK — ${email} agora é admin. Pode logar na LoginPage com essa senha.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[create-admin] Erro inesperado:", err);
  process.exit(1);
});
