# Runbook de deploy — Módulo Gestor de Escala (Plano 1: Configuração)

> Branch `feat/escala-configuracao` · 23 commits · suíte 823 → 994 testes
> ⚠️ **A ordem abaixo não pode ser invertida.** O passo 1 derruba o app inteiro se for pulado.

## Antes de qualquer coisa: conferir a convenção de colunas
O código usa **camelCase citado** (`"storeId"`). Há indício de que partes antigas do banco usem minúsculas (`db-pessoas.ts:229` faz `INSERT INTO employees (storeId...)` em SQL cru, sem aspas — em Postgres isso resolve para `storeid`).

```sql
\d employees
```
Se as colunas vierem minúsculas, **PARE** — as migrations 0032-0036 precisam ser reescritas antes de aplicar.

## 🔴 NÃO use `npm run db:push`
O journal do Drizzle está em `dialect: "mysql"` e para na `0010` (herança da migração MySQL→Postgres). O comando **não aplica** as nossas migrations e pode gerar migration espúria a partir de snapshot obsoleto. **Aplique os `.sql` à mão, em ordem.**

## Ordem de execução

| # | Passo | Por que nesta ordem |
|---|---|---|
| 1 | **Aplicar `0033_stores_uf.sql`** | 🔴 `schema.ts` já lista a coluna `uf`, então **todo** `select().from(stores)` a inclui. Sem ela, `getStoresByUserId` quebra — e ela sustenta `assertPodeAcessarLoja`. **Resultado de pular: todas as procedures protegidas de todos os módulos param para todo usuário não-admin.** Não é só Escala; é o app. |
| 2 | **Aplicar `0032_escala_config.sql`** | cria `funcoes_loja`, `escalas_catalogo`, `regras_escala` |
| 3 | **Aplicar `0036`** (`excecoesLegais`) | o seed grava esse campo; tem que existir antes |
| 4 | **Aplicar `0034`** (`confirmacoes_regra_loja`) | `getRegrasVigentes` faz `Promise.all` e **500a inteira** sem a tabela |
| 5 | **Aplicar `0035`** (`horarioConfirmadoEm`) | passo 1 do assistente exige o carimbo |
| 6 | **`npm run escala:seed`** | sem isso as tabelas nascem vazias. Tem `--dry-run`. Aborta se faltar `DATABASE_URL`. É idempotente. |
| 7 | **Backfill de `stores.uf`** nas 39 lojas | sem UF, **nenhuma regra estadual se aplica** e a tela exibe aviso permanente. Dá para fazer pela tela de admin (campo novo) ou por SQL. |
| 8 | **Deploy do código** | só depois de 1-7 |

Todas as migrations são idempotentes (`IF NOT EXISTS`).

## Verificação manual da tela (não há teste automatizado de componente)

**Aba "Configuração da Escala" — funções**
1. Cadastrar função nova: escolher driver → **a produtividade tem que vir pré-preenchida** com rótulo de origem. Campo vazio é defeito.
2. Driver `pratos` ou `cobertos` → o rótulo tem que avisar que a base é o total de atendimentos da loja, não contagem específica.
3. Editar função cuja produtividade veio de sugestão → se a sugestão nova divergir do valor salvo, a tela deve **mostrar os dois** com botões "Manter X" / "Usar a sugestão (Y)". **Substituir sozinha é defeito.**
4. Salvar com `minPorBloco = 0`, produtividade `0`, ou `maxPorBloco < minPorBloco` → tem que recusar com mensagem.
5. Produtividade exibida com **1 decimal**, nunca `11.333333333333334`.

**Aba "Assistente de Configuração"**
6. Loja virgem → passo 1 (horário) **incompleto** até confirmar, mesmo com 8h-23h aparecendo.
7. Fechamento ≤ abertura → recusado, com mensagem.
8. Loja **sem UF cadastrada** → aviso visível de que regras estaduais não estão sendo aplicadas.
9. Passo de regras: se o seed não rodou, tem que dizer **incompleto** citando `npm run escala:seed`.
10. Regras `DEPENDE_CCT` → exigem confirmação explícita.
11. "Gerar escala" só libera com os 4 passos completos.
12. Data a partir de **16/12/2026** → a escala **6x1 não pode aparecer** como opção, e a razão deve citar a EC 141/2026.

## ⚖️ Pendente de validação jurídica
Os **números de artigo da EC 141/2026** gravados no campo `fonte` (`art. 1º` alterando CF art. 7º XIII/XV; `art. 3º` como transição) vieram de pesquisa, **não do texto promulgado**. Estão marcados no código. Conferir com o trabalhista — corrigir é `UPDATE` de parâmetro, não deploy.

Vale também validar com ele o **catálogo de escalas** inteiro antes de liberar para as lojas.
