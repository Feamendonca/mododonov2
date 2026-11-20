# Plano 2 — Demanda e Quadro Ideal · Desenho para aprovação

> Data: 2026-11-19 · Status: **aguardando aprovação do Fernando**
> Revisão importante: a análise do Escala Fácil inverteu a prioridade original. O caminho principal deixa de ser curva de demanda e passa a ser **meta declarada**.

## Intenção

Responder **"de quantas pessoas esta loja precisa?"** — e fazer isso com dado que o gerente **realmente tem**.

O Plano 1 entregou a configuração (funções, regras, blocos). Este plano entrega o **quadro ideal** e o **diagnóstico de cobertura**. O motor de alocação (quem trabalha quando) é o Plano 3.

## 🔄 A inversão

O desenho original pedia contagem por bloco → driver → produtividade → necessidade. É mais correto **e depende de dado que o gerente não tem e não vai manter**. O sistema de referência resolveu eliminando a pergunta: o gerente declara a meta por dia×turno, 14 números, definidos uma vez.

**Decisão: dois caminhos, nesta ordem de prioridade.**

| | Caminho A — META DECLARADA (principal) | Caminho B — DEMANDA (evolução) |
|---|---|---|
| O que o gerente faz | declara quantas pessoas quer por dia×turno | informa contagem (tickets/pratos) por bloco |
| Esforço | 14 números, uma vez | recorrente |
| Precisão | o julgamento dele | derivada do movimento |
| Quando usar | sempre; é a porta de entrada | quando houver histórico confiável |

**B não substitui A — B critica A.** Quando houver dado de demanda, o sistema mostra: *"você pede 8 na segunda de manhã; o movimento sustenta 5."* A meta continua sendo do gerente; o dado vira **argumento**, não imposição. É o mesmo princípio do Orçamento.

## Modelo de dados

```
metas_cobertura                      ← Caminho A (principal)
  storeId · diaSemana (0-6) · turnoId
  meta int · metaMinima int?         ← piso de segurança
  origem: declarada | sugerida_demanda | ajustada_critica
  vigenciaInicio · vigenciaFim

demanda_bloco                        ← Caminho B (evolução)
  storeId · shiftBlockId · data
  driver: tickets|pratos|cobertos
  quantidade · origem: digitado|distribuido_curva|pdv

fatores_dia                          ← aprendido do Escala Fácil
  storeId · diaSemana
  diaRecebimento bool                ← dia de entrega consome gente
  observacao text
```

`turnos` reaproveita `shift_blocks` do Plano 1.

## Cálculo do Quadro Ideal

```
1. Para cada dia×turno: pessoas necessárias = meta declarada
   (ou, no caminho B: demanda ÷ produtividade-alvo, respeitando minPorBloco)
2. Aplicar fatores do dia (ex.: +1 em dia de recebimento)
3. Converter pessoas-turno em QUADRO:
     pessoas-turno da semana ÷ turnos que uma pessoa cobre por semana
     (vem da escala vigente — 5x2 cobre 5, 12x36 cobre 3,5)
4. Aplicar regras DURAS vigentes na data (Plano 1)
5. Arredondar para cima por função
→ QUADRO IDEAL, por função
```

## Diagnóstico de cobertura

Tabela por dia × turno: `META | ATUAL | GAP`, com **três estados**:
- 🔴 **abaixo** da meta — risco de operação
- 🟢 **atende**
- 🟡 **acima** da meta — 🔑 **desperdício de folha**, e é o que o Fernando quer matar

Mais: **"Períodos 100% cobertos: X de 14"** e **"Maior gap: Segunda Diurno −6"** (aponta o pior ponto pelo nome, não só percentual).

> O estado 🟡 é a razão de ser do módulo. A análise das DREs mostrou lojas com folha a 31% contra outras a 13% na mesma operação — a diferença mora no amarelo.

## Modos de operação

1. **Mínimo** — "qual o menor quadro que atende as metas?"
2. **Quadro desejado** (inverso) — "quero 12 pessoas; o que consigo cobrir e o que fica descoberto?"
3. **Cenários salvos e comparáveis** — ex.: *"5x2 puro"* × *"5x2 + jornada partida"* × *"com 12x36 no fim de semana"*. Alimenta a pauta de negociação sindical.

## Simulador separado da escala real

Como no sistema de referência: **simular nunca toca a escala oficial.** O gestor explora cenários sem medo, e só promove quando decidir.

## O que NÃO entra
Alocação de pessoas por nome (Plano 3) · upload de CCT e pauta sindical (Plano 4) · contrato intermitente e extras (backlog).


---

# ✅ MODELO FINAL (definido com o Fernando em 19/11) — substitui o desenho de bloco acima

## Turnos escalonados, não blocos

**Turno = o horário de trabalho de uma pessoa.** A loja tem vários, com entradas diferentes:

```
Turno A   05:00 ──────────── 14:00
Turno B      06:00 ──────────── 15:00
Turno C            10:00 ──────────── 19:00
Turno D                  14:00 ──────────── 23:00
```

Não são pedaços do dia — são **modelos de jornada**. O escalonamento das entradas dá a granularidade. **A cobertura por hora é consequência** do empilhamento dos turnos, não algo declarado.

A tabela `shift_blocks` do Plano 1 **já serve** (nome, hora início, hora fim, por loja). Só precisa ganhar **intervalo** para suportar jornada partida: `11:00–15:00 + 18:00–22:00`.

## A meta é por MOMENTO da operação

Nas palavras do Fernando: *"quantos na abertura, quantos no fechamento, quantos nos horários de pico"*.

| Momento | Meta |
|---|---|
| Abertura | 2 |
| Pico almoço | 6 |
| Vale da tarde | 2 |
| Pico jantar | 5 |
| Fechamento | 2 |

4-5 números por dia da semana, com a loja nomeando os momentos dela. Natural, e muito mais barato que faixa rígida.

> O piso de segurança deixa de ser campo separado: **vira a meta do momento mais fraco.**

## 🔑 E o sistema PROPÕE tudo isso

O gerente **nunca encara formulário em branco**:

1. **O sistema identifica os momentos** olhando a curva de movimento — acha picos e vales sozinho e propõe os cortes de horário.
2. **Propõe a meta de cada momento** — demanda daquele horário ÷ produtividade-alvo da função.
3. **O gerente corrige** o que não bate com a realidade dele. A correção é o que vale.
4. **O motor procura** a combinação de turnos que cobre os momentos com o menor quadro.

Mesmo princípio sagrado do app: **propõe, humano confirma, nunca grava sozinho.**

### O ovo-e-galinha do dia 1, resolvido
Para sugerir é preciso demanda, e no dia 1 não há dado por hora. A `estimarPorCurva` (já existe no código) pega o **total do dia** — que o gerente já lança — e distribui por curva padrão de restaurante. Conforme a loja acumula histórico, a curva deixa de ser genérica e vira a dela.

**O dia 1 funciona com zero dado novo.**

## Dia de recebimento: OPCIONAL
Marcador por dia que a loja pode simplesmente não usar. Nada de campo obrigatório que ninguém preenche.

## Decisões originais (resolvidas acima)
1. **Turno como unidade** (diurno/noturno, como o Escala Fácil) ou **bloco de turno** (mais granular, já modelado no Plano 1)? O bloco permite jornada partida; o turno é mais simples de alimentar.
2. Dia de recebimento soma **pessoa fixa** (+1) ou **percentual** sobre a meta?
3. O piso `metaMinima` é por dia×turno ou herda o `minPorBloco` da função?
