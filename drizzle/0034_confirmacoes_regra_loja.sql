-- Migration 0034: confirmacoes_regra_loja — confirmação de regra DEPENDE_CCT
-- pelo gerente, por loja. Postgres/Supabase. Idempotente. Colunas camelCase
-- entre aspas (mesma convenção das migrations 0027-0033).
--
-- R24 (revisão da Task 6, .superpowers/sdd/2026-11-19-escala-configuracao/):
-- a versão anterior "confirmava" uma regra DEPENDE_CCT gravando uma cópia
-- dela em `regras_escala` com escopo loja — por precedência (Task 2,
-- server/escala-regras.ts: loja > uf > rede), essa cópia venceria PARA
-- SEMPRE, inclusive depois que a regra de rede mudasse (a EC 141/2026 tem
-- duas viradas programadas: 16/12/2026 e 16/12/2027). Toda loja que
-- confirmasse hoje ficaria presa no valor antigo quando o teto mudar.
--
-- Esta tabela registra só QUE o gerente confirmou uma chave para a loja
-- dele — nunca o valor legal (nenhuma coluna `valor`/`tipo`/`vigencia`
-- aqui: guardar o valor duplicaria o dado legal em dois lugares, e um dos
-- dois ficaria desatualizado em silêncio). `resolverRegras` nunca lê esta
-- tabela — nenhuma query de resolução a consulta.

CREATE TABLE IF NOT EXISTS confirmacoes_regra_loja (
  id SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  chave VARCHAR(64) NOT NULL,
  "confirmadoEm" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmacoes_regra_loja_store_chave
  ON confirmacoes_regra_loja ("storeId", chave);
