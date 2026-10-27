# Desenho — Módulo Orçamento (Fase B, módulo 1)

**Data:** 2026-10-27 · **Status:** aprovado por Fernando (brainstorm/grilling) · **App:** Modo Dono v2 (mododonov2, já no ar)

## Intenção e o porquê
O orçamento é a **fundação** do Modo Dono: a **DRE é a raiz** de tudo — dela nasce o orçamento, e do orçamento/DRE nascem metas, ações e treino (módulos seguintes). Este módulo reconstrói o orçamento que foi escondido na Fase A (tabelas só existiam no Manus), **corrigindo o erro da v1**: a IA **propõe e o humano confirma** — nunca grava sozinha, nunca lê número via IA, nunca chuta default.

## Metas
- O gestor consegue **gerar um orçamento mensal/trimestral por loja** a partir da DRE histórica, **revisar/editar**, e **aprovar** como oficial.
- A IA **propõe um rascunho** (lendo a DRE com **código determinístico**, não via LLM) e **destaca as alavancas fracas**.
- Orçamento mensal **quebrado automático em metas diárias** (alimenta o placar).
- Loja em recuperação → **rampa de 3 meses** + marca **"em atenção" com prazo** + registro da decisão **virar/encerrar**.

## Não-metas (deste módulo)
- Não construir metas/ações/treino (são os próximos módulos — só deixamos as alavancas fracas **marcadas** pra eles consumirem).
- Não refazer o pipeline de IA pesado/frágil da v1 — IA só **propõe**, de forma simples.
- Não mexer no núcleo já no ar além de **reexibir** o item de menu Orçamento.

## Fonte da DRE (as duas entradas)
1. **Upload** de arquivo (Excel/.xlsb) — construir e testar primeiro (não depende de credencial externa).
2. **SharePoint** — reusar o acesso que já existe (app Azure "Automacao Financeiro AMFoods", Microsoft Graph, Sites.Selected no site AmFoods). Fernando aponta a **pasta das DREs** (por loja/mês). *(Fast-follow: liga depois do upload.)*
- **Leitura é DETERMINÍSTICA** (parser em código detecta colunas/linhas/mês — a IA NÃO lê número). Reaproveitar/limpar o `sheet-parser.ts` do histórico.
- Período analisado: **últimos 2–3 meses fechados** (+ orçado anterior pra comparar).

## O que a IA faz (e NÃO faz)
- **Faz:** a partir dos números já extraídos por código, **propõe** valores do orçamento do período (tendência dos 2–3 meses, com a rampa quando aplicável) e **classifica as alavancas fracas** (ex.: CMV acima do saudável, folha pesada) com uma frase curta de porquê.
- **NÃO faz:** não extrai número da planilha; não grava nada direto; não preenche buraco com chute (deixa **em branco** pra o humano).
- Modelo: Claude (via o `invokeLLM` já repontado). Saída estruturada = proposta por linha + flags de alavanca.

## Fluxo e telas
1. **Nova proposta:** escolhe loja + período + fonte (upload/SharePoint). Código extrai a DRE histórica.
2. **Tela de conferência** (coração): DRE **editável linha a linha** (receita, CMV, despesas fixas/variáveis, folha, resultado) com (a) histórico lido, (b) proposta da IA, (c) campo editável; brancos ficam brancos; **alavancas fracas destacadas**. Botão **"Aprovar orçamento"**.
3. **Aprovação:** o **gestor** monta/edita; **Fernando/regional aprova** → vira **oficial** do período. (Seguir o padrão de autorização já existente no app.)
4. **Quebra diária:** ao aprovar, o mensal é distribuído em **metas diárias** (uniforme por ora; ajuste por dia-da-semana/sazonalidade depois).
5. **Loja em atenção:** se a DRE histórica é negativa → a proposta vira **rampa de 3 meses** (marcos); a loja recebe flag **"em atenção"** com **prazo**; ao fim do prazo, registra-se **decisão: seguir / encerrar**. Positivou antes → volta ao modelo normal.

## Dados (tabelas a recriar, limpas)
- `orcamentos` (já existe) — cabeçalho: loja, período, status (rascunho/aprovado), aprovado_por/em.
- `orcamento_valores` — valor por **linha da DRE** × mês (histórico lido, proposto, aprovado; origem).
- `orcamento_premissas` — premissas/flags de alavanca (qual linha é fraca + nota curta).
- `orcamento_metas_diarias` — meta diária derivada do mensal aprovado.
- (opcional) `orcamento_colaboradores`/`linhas_custom` se o fluxo precisar — só se necessário.
- Definir as **linhas da DRE** a partir do template histórico (`dre_template_linhas`) — reconstruir limpo.

## O que fica pro builder
- Recriar as tabelas acima (migration, idempotente); reexibir o módulo no menu (tirar do HIDDEN da Fase A).
- Parser determinístico de DRE (upload primeiro; SharePoint reader depois).
- Endpoint de proposta (código extrai → IA propõe/flag → devolve rascunho; nunca grava).
- Tela de conferência editável + aprovar; quebra diária; flag "em atenção" + decisão.
- Testes: parser (fixture real anonimizada), proposta (IA mockada), aprovação (autorização), quebra diária.

## Pendências de input (do Fernando, na hora de construir)
- A **pasta das DREs no SharePoint** (p/ ligar a fonte 2) + confirmar que o acesso do app Azure serve.
- Confirmar as **linhas da DRE** (o template) — eu proponho a partir do histórico e você valida.

## Critério de aceite
Gestor sobe/puxa a DRE, a IA propõe um rascunho com alavancas destacadas (sem chutar), o gestor edita e aprova, vira orçamento oficial com metas diárias; loja negativa vira rampa + "em atenção" com prazo. A IA nunca gravou sozinha.
