# Orçamento — Fonte SharePoint (puxar DRE direto) — Plan

**Goal:** O gerente não sobe arquivo: escolhe a loja e o app puxa a DRE mais recente do SharePoint (via Microsoft Graph app-only) e alimenta o MESMO fluxo de proposta do orçamento.

**Architecture:** Conector Graph no servidor (token client_credentials + API /shares pra resolver URL de pasta + download). Config por loja (pasta + filtro de nome). Nova procedure `importarDoSharePoint` que devolve o MESMO `{rascunho, dre}` do `proporDaDre`, reusando `extrairGruposPorMes`/`proporOrcamento`. Começa pelo formato **multi-mês** (um arquivo com vários meses); formato **por-mês** (ex. Bella Gula) fica pra task seguinte.

**Tech Stack:** Node fetch + Microsoft Graph. Creds em env: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (já no .env local; precisam ir no Render). Referência validada que FUNCIONA: `scripts/sp-pull-test.mjs` (token + /shares + list). Site: amfoods534.sharepoint.com/sites/AmFoods.

## Global Constraints
- Creds SÓ via env (`process.env.MS_*`), NUNCA hardcoded/commitadas/logadas. Nada de valores de segredo em teste/chat.
- Leitura 100% por código (o conector só baixa bytes; a extração é o parser determinístico que já existe). IA não entra aqui.
- `importarDoSharePoint` NÃO grava (igual proporDaDre — só propõe). Autorização: protectedProcedure + assertPodeAcessarLoja.
- Migration nova em Postgres puro, idempotente, aplicada manualmente/por mim depois.

## Tasks
- S1: `server/sharepoint.ts` — conector Graph (token + list + download + pickLatest).
- S2: colunas `dre_sharepoint_url` + `dre_file_filter` em `stores` (migration 0030 + schema).
- S3: procedure `orcamento.importarDoSharePoint` (pull multi-mês → parse → {rascunho,dre}).
- S4: UI botão "Puxar do SharePoint" em OrcamentoPage + mostra qual arquivo veio.
- (futuro S5: formato por-mês — juntar últimos N arquivos mensais.)
