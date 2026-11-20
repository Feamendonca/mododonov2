/**
 * scripts/escala-seed.ts — executor do seed do catálogo legal de Escala
 *
 * 🔴 R27 (C2 da review final): `semearParametrosEscala`
 * (server/escala-seed-db.ts) existia desde o R14 e NÃO tinha um único
 * chamador — nem npm script, nem hook de boot. A função que existe para
 * "as tabelas de parâmetro não nascerem vazias" não tinha como ser
 * executada, e tabela vazia é o pior estado possível deste módulo: o
 * resolvedor não acha regra nenhuma, e o assistente (até o R28) dizia que
 * estava tudo revisado. Este script é o executor que faltava.
 *
 * Uso:
 *   npm run escala:seed
 *   npm run escala:seed -- --dry-run     (mostra o que faria, sem gravar)
 *
 * Requer `DATABASE_URL` no ambiente/.env — SEM ela o script FALHA ALTO
 * (exit 1) em vez de "rodar com sucesso" sem ter gravado nada: `getDb()`
 * devolve `null` em silêncio quando a variável não existe, e um seed que
 * não semeia nada sem avisar é exatamente a classe de defeito que este
 * módulo existe para evitar.
 *
 * Idempotente: a idempotência é da própria `semearParametrosEscala` (ela
 * lê as chaves lógicas já presentes e só insere o que falta) — rodar duas
 * vezes seguidas imprime `inseridos: 0` na segunda. Este script não
 * duplica essa lógica, só imprime o resultado.
 *
 * Ordem de execução no deploy: DEPOIS da migration 0032 (que cria
 * `escalas_catalogo`/`regras_escala`) e ANTES de liberar a aba de Escala
 * para os gerentes. Ver o runbook em
 * .superpowers/sdd/2026-11-19-escala-configuracao/onda-final-report.md.
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { semearParametrosEscala } from "../server/escala-seed-db";
import { catalogoParaInserir, regrasParaInserir } from "../server/escala-seed-db";
import { CATALOGO_INICIAL, REGRAS_LEGAIS_INICIAIS } from "../server/escala-catalogo-seed";
import { escalasCatalogo, regrasEscala } from "../drizzle/schema";

const DRY_RUN = process.argv.slice(2).includes("--dry-run");

function abortar(mensagem: string): never {
  console.error(`[escala:seed] ${mensagem}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    abortar(
      "DATABASE_URL não está definida — abortando SEM semear nada.\n" +
        "            Defina DATABASE_URL no .env (mesma string usada pelo app) e rode de novo."
    );
  }

  const db = await getDb();
  if (!db) {
    abortar(
      "não foi possível conectar ao banco com a DATABASE_URL informada (ver o aviso de conexão acima)."
    );
  }

  if (DRY_RUN) {
    const catalogoExistente = await db
      .select({ codigo: escalasCatalogo.codigo, vigenciaInicio: escalasCatalogo.vigenciaInicio })
      .from(escalasCatalogo);
    const regrasExistentes = await db
      .select({
        storeId: regrasEscala.storeId,
        uf: regrasEscala.uf,
        cct: regrasEscala.cct,
        chave: regrasEscala.chave,
        vigenciaInicio: regrasEscala.vigenciaInicio,
      })
      .from(regrasEscala);

    const catalogoNovo = catalogoParaInserir(catalogoExistente as any);
    const regrasNovas = regrasParaInserir(regrasExistentes as any);

    console.log("[escala:seed] DRY RUN — nada foi gravado.");
    imprimirResultado({
      catalogo: {
        inseridos: catalogoNovo.length,
        ignorados: CATALOGO_INICIAL.length - catalogoNovo.length,
      },
      regras: {
        inseridos: regrasNovas.length,
        ignorados: REGRAS_LEGAIS_INICIAIS.length - regrasNovas.length,
      },
    });
    for (const linha of catalogoNovo) {
      console.log(`  + escalas_catalogo: ${linha.codigo} (vigência desde ${linha.vigenciaInicio ?? "sempre"})`);
    }
    for (const linha of regrasNovas) {
      console.log(`  + regras_escala:    ${linha.chave} = ${JSON.stringify(linha.valor)} [${linha.tipo}] (desde ${linha.vigenciaInicio ?? "sempre"})`);
    }
    process.exit(0);
  }

  const resultado = await semearParametrosEscala(db);
  console.log("[escala:seed] Seed concluído.");
  imprimirResultado(resultado);
  process.exit(0);
}

function imprimirResultado(resultado: {
  catalogo: { inseridos: number; ignorados: number };
  regras: { inseridos: number; ignorados: number };
}): void {
  console.log(
    `[escala:seed] escalas_catalogo: ${resultado.catalogo.inseridos} inserida(s), ` +
      `${resultado.catalogo.ignorados} já existia(m) (de ${CATALOGO_INICIAL.length} no catálogo).`
  );
  console.log(
    `[escala:seed] regras_escala:    ${resultado.regras.inseridos} inserida(s), ` +
      `${resultado.regras.ignorados} já existia(m) (de ${REGRAS_LEGAIS_INICIAIS.length} no seed legal).`
  );
}

main().catch((erro) => {
  console.error("[escala:seed] Erro inesperado — NADA garante que o seed tenha sido aplicado:", erro);
  process.exit(1);
});
