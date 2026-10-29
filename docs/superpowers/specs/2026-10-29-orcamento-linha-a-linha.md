# Orçamento linha a linha (espelho da DRE) — Desenho

**Data:** 2026-10-29 · Pedido do Fernando: "o orçamento tem que refletir EXATAMENTE a DRE puxada" + "orçar linha a linha o mais completo possível".

## Intenção
Hoje a tela usa um molde FIXO de campos (aluguel, energia…) herdado do app antigo → custos que não encaixam (Ocupação total, Serviços de Terceiros, Despesas Operacionais) somem da tela. A reforma faz o orçamento **espelhar a DRE puxada**: mostra **todas as linhas** da DRE daquela loja (grupos + sub-linhas), com os valores lidos.

## Modelo: ÁRVORE da DRE (evita dupla contagem)
A DRE é uma árvore: grupos nível-1 (ex.: "10 - Custos de ocupação") com filhos nível-2 (Aluguel, Energia, Água…). Regras:
- **Folhas** = linhas sem filhos (nível-2, ou nível-1 que não tem sub-linha). **Editáveis.**
- **Subtotais** = nível-1 que TEM filhos (= soma dos filhos) + linhas DERIVADAS da DRE (Receita Líquida, Margem Bruta, Resultado/EBITDA, Lucro). **Travados/calculados** (read-only).
- **EBITDA / resultado recalcula a partir das FOLHAS** (nunca somar grupo + seus filhos = dupla contagem). Operacional = folhas de receita − folhas de custo; exclui não-operacional (Despesas/Receitas Não Operacionais, Investimentos) e pró-labore do EBITDA operacional.
- Natureza por sinal/nome: receita (positivo / "receita"), custo (negativo), subtotal (derivada ou tem filhos).
- Tudo em **R$** (como a DRE), com **%** da receita ao lado pra referência. Campo sem valor na DRE = branco (sem chute).

## Dados
- `orcamento_linhas` (orcamento_id, codigo, label, nivel, valor numeric(14,2), ordem, editavel bool). Guarda as FOLHAS editadas (+ opcionalmente subtotais pra histórico). Substitui o uso dos campos fixos de `orcamentos` pro detalhe (os campos fixos ficam pra compat, mas o detalhe vive aqui).

## Tarefas
- L1: parser `extrairArvoreDre` — extrai a árvore completa (grupos+sub-linhas, ordem, nível, valor, derivada) por mês; `proporLinhas` = média dos meses → linhas propostas (folha/subtotal/derivada, natureza, histórico, proposto), sem chutar.
- L2: migration `orcamento_linhas` + schema + save (`salvarLinhas`).
- L3: endpoints — `proporDaDre`/`importarDoSharePoint` devolvem as linhas (árvore); `salvarRascunho` persiste as folhas; EBITDA/ponto/meta recalculam das folhas; aprovar/metas seguem.
- L4: UI `DreEditavel` — renderiza a árvore (sub-linhas indentadas, subtotais travados, folhas editáveis), resumo (EBITDA/ponto/meta) vivo.

## Validação
Ao vivo nas 6 lojas: a tabela mostra TODAS as linhas da DRE de cada uma, soma bate com a DRE (receita − custos = resultado ≈ linha "Resultado Operacional" da DRE), sem dupla contagem.
