# Proposto Inteligente (motor da IA) — Desenho para aprovação

**Data:** 2026-11-05 · Pedido do Fernando (opção B). Esta é a peça-chave: a IA transforma a DRE num PLANO viável, linha a linha, que desdobra no 4DX.

## Intenção
Hoje o "Proposto" é a média dos 3 meses. Vira um **plano de melhoria**: o gestor define uma **meta** e a IA monta a **rampa viável** linha a linha pra chegar lá — ancorada na realidade dos 3 meses (nunca promete o impossível) — com o **porquê** e uma **ação prática** por linha ajustada. Tudo **editável** (o gestor julga a coerência). A IA **propõe, o humano confirma** — nunca grava sozinha.

## Como o gestor define a meta (entrada)
Um campo simples no topo, com 3 jeitos de dizer o alvo (escolhe um):
- **EBITDA R$** (ex.: "quero R$ 100.000 de EBITDA")
- **EBITDA %** (ex.: "quero 18% de margem")
- **Melhoria %** sobre o melhor/média (ex.: "+15% de resultado")

## O que a IA faz (determinístico + IA, separados)
1. **Código (determinístico) monta o retrato dos 3 meses por linha:** melhor mês, pior mês, média, tendência. Isso NÃO é a IA — é cálculo, pra a IA receber números confiáveis (mesma regra: IA nunca lê número cru).
2. **IA recebe:** os 3 meses por linha (já extraídos) + a meta + as regras de viabilidade escalonada (abaixo). E devolve, **por linha ajustada**:
   - `propostoIA`: o valor sugerido (número).
   - `porque`: 1 frase curta ("CMV foi 26% no seu melhor mês e 31% na média — dá pra travar em 27%").
   - `confianca`: alta/média/baixa (quão viável é, pela regra escalonada).
   E, SEPARADO, um **plano de batalha** (bloco de ações consolidado — DECISÃO FERNANDO: não é ação por linha):
   - `planoBatalha`: lista de ações práticas `{ titulo, descricao, linhasAfetadas: codigo[], impactoEstimadoRs, prioridade }` — cada ação explica uma ou mais mudanças de linha. É o "o que fazer pra chegar na meta".
3. **Fecha a conta:** o conjunto das linhas tem que BATER a meta. Se a soma viável não alcança, a IA retorna o **máximo atingível** + diz na cara ("com ajustes realistas chega em R$ 92k, não R$ 100k — o gap é no faturamento").

## Regras de viabilidade (o que trava a IA de inventar) — DECISÃO FERNANDO
- **O melhor mês NÃO é teto** — a IA PODE mirar além do melhor realizado (senão nunca há crescimento). MAS com juízo escalonado:
  - Ajuste dentro da faixa histórica (entre pior e melhor mês) → `confianca: alta`, sem exigir justificativa forte.
  - Ajuste que SUPERA o melhor mês → permitido, mas EXIGE uma ação concreta no plano de batalha que sustente, e `confianca: média`.
  - Ajuste MUITO além do histórico (ex.: faturamento >+20% do melhor mês, ou custo cortado >X% abaixo do melhor) → permitido só com ação forte + `confianca: baixa` + aviso explícito ("meta agressiva").
  - Nunca "número maluco" sem lastro: toda melhoria agressiva tem que ter uma ação que a explique, senão a IA recua pro realista e avisa.
- Linha sem base nos 3 meses → fica null (sem chute).
- Derivados/subtotais **não** são propostos (são soma das folhas).

## Tela
- Botão **"Gerar plano da IA"** (ao lado de "Puxar do SharePoint"), aparece depois que a DRE está carregada.
- A coluna "Proposto" passa a mostrar o `propostoIA` (quando gerado), com um **ícone de info** que abre o `porque` + a `acao`. Badge de `confianca`.
- Tudo continua **editável** no "Seu valor" — o gestor aceita, ajusta ou ignora cada linha.
- Um resumo no topo: "Meta: R$ X · Plano da IA alcança: R$ Y" (verde se bate, âmbar se fica abaixo, com o motivo).
- **Fallback:** IA falhar/retornar inválido → mantém a média no Proposto, sem quebrar (como já é hoje).

## Ponte com o 4DX (próximos módulos, NÃO neste build)
Cada `acao` + `porque` que o gestor aceitar vira semente de **objetivo/ação** no módulo de Metas (4DX). Este build só GERA e deixa editável; a persistência das ações no 4DX é o módulo seguinte. Aqui a gente só garante que a IA produz `acao`/`porque`/`confianca` por linha (o insumo do 4DX).

## O que fica pro builder (quando aprovado)
- `server/orcamento-plano-ia.ts`: `gerarPlanoIA({ linhasPorMes, anoMeses, meta })` → `{ linhas: {codigo, propostoIA, porque, acao, confianca}[], meta: {alvo, alcancado, atingiuMeta, motivo} }`. Usa `invokeLLM` (MODEL_DEEP, response_format json_schema). Determinístico monta o retrato; IA só sugere; fallback silencioso.
- Endpoint `orcamento.gerarPlanoIA` (protectedProcedure + assertPodeAcessarLoja; NÃO grava).
- Tela: botão + coluna Proposto com info/badge + resumo meta.
- Validar ao vivo nas lojas (plano coerente, viável, bate ou explica o gap).

## Decisões que preciso confirmar com o Fernando
1. **Entrada da meta:** os 3 jeitos (EBITDA R$ / % / melhoria %) servem, ou você quer só um?
2. **"Melhor mês" como âncora de viabilidade** faz sentido (custo não melhor que o melhor realizado sem ação)?
3. **Ação por linha** — 1 ação curta por linha ajustada está bom, ou você quer um bloco de ações separado no fim?
