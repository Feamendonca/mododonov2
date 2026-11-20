# Gestor de Escala — Desenho para aprovação

> Data: 2026-11-19 · Autor: Claude (tech lead) · Status: **aguardando aprovação do Fernando**
> Contexto novo e urgente: **EC 141/2026 acaba com a 6x1 em 16/12/2026** (27 dias). Este módulo deixa de ser ganho de produtividade e vira defesa de margem.

## Intenção

Hoje o módulo de Pessoas **registra e diagnostica**: o gerente monta a escala à mão e o app diz depois se a produtividade ficou boa. A virada é o app **propor a escala** — menor quadro possível que cumpra a lei, cubra a demanda e respeite as regras da loja — com o gestor julgando e corrigindo até chegar na melhor opção.

Mesmo princípio sagrado do Orçamento: **a IA propõe, o humano confirma, a IA nunca grava nem chuta sozinha.**

## O que já existe (não reconstruir)

| Peça | Onde |
|---|---|
| `employees`, `shift_blocks`, `schedules`, `staff_movements`, `store_people_config` | `drizzle/schema.ts` |
| `hourly_revenue` + `estimarPorCurva` / `distribuirPorCurva` / `parsePdvPaste` | `server/routers/pessoas.ts` |
| Escala semanal, copiar semana, copiar dia | `db-pessoas.ts` |
| Heatmap, produtividade por bloco e por pessoa, folha, turnover | `db-pessoas.ts` |
| Tela com Equipe · Blocos · Escala · Produtividade · Movimentações | `PessoasPage.tsx` (1.519 linhas) |

**Lacunas:** não há contagem por bloco/hora (só receita), não há cadastro de funções por loja, não há catálogo de escalas legais, e não há motor de dimensionamento.

---

## 1. O marco legal (EC 141/2026) — por que vira parâmetro, não constante

| Data | Regra |
|---|---|
| até 15/12/2026 | 44h/semana · 1 repouso semanal (6x1 válida) |
| **16/12/2026** | **2 repousos semanais** · **42h/semana** · cláusulas coletivas incompatíveis perdem efeito |
| **16/12/2027** | **40h/semana** |

Sem redução de salário. ACT/CCT pode ampliar a jornada **diária** para acomodar as 42h, desde que preservados os dois repousos. A **12x36 sobrevive** (art. 59-A CLT), mas dá média de 42h/semana e tende a precisar adaptação em dez/2027.

> 🔒 **Decisão de arquitetura:** toda regra legal é **parâmetro com data de vigência**, nunca constante no código. O motor pergunta *"qual regra vale nesta data, nesta loja, nesta CCT"*. Em dez/2027 muda um registro, não o código.

### Impacto estimado na AMFoods
Para cobrir 7 dias de operação: na 6x1 cada pessoa cobria 6 dias; agora cobre 5. Isso dá da ordem de **+20% de headcount por posição**, com salário mantido. Numa rede com folha de 30%+ em 8 lojas, empurra para perto de 36% sem ninguém errar nada. **É o que este módulo tem que combater.**

---

## 2. As três tabelas de parâmetro

### 2.1 `funcoes_loja` — quem faz o quê e o que mede o trabalho dela
Cadastro **por loja**, preenchido incrementalmente conforme cada operação entra no app.

```
funcoes_loja
  id · storeId · nome                      ex.: "Atendente", "Garçom", "Cozinha", "Caixa"
  driver                                   enum: tickets | pratos | cobertos
  produtividadeAlvo   numeric              unidades do driver por pessoa/hora
  produtividadeOrigem enum                 sugerida_historico | sugerida_benchmark | definida_gestor
  minPorBloco         int                  piso de segurança (nunca abaixo disso)
  maxPorBloco         int?                 teto físico (nº de PDVs, praça)
  ativo · createdAt · updatedAt
```

**Por que o driver é por FUNÇÃO e não por marca:** um ticket de R$ 500 com dez pessoas no Pecorino gera **1** atendimento no caixa e **10** no salão e na cozinha. Driver único por loja acerta uma ponta e erra a outra. Na Casa do Pão de Queijo os três colapsam no mesmo número (1 ticket ≈ 1 atendimento) — e tudo bem, o modelo comporta os dois casos.

**Produtividade-alvo nunca nasce vazia.** O app propõe a partir de (a) histórico da própria loja — `atendimentos` do dia ÷ pessoas-hora escaladas — e (b) benchmark da melhor loja da rede na mesma função. O gestor julga se está folgado ou apertado e corrige. Campo vazio trava o gerente e mata a adoção.

### 2.2 `escalas_catalogo` — o que a lei permite, com data de vigência

```
escalas_catalogo
  id · codigo                  5x2 | 4x3 | 6x1 | 12x36 | 5x1 | 6x2 | turno_revezamento
  nome · diasTrabalho · diasFolga
  horasDiaPadrao   numeric
  horasSemanaMedia numeric
  vigenciaInicio · vigenciaFim   date?     ← 6x1 recebe vigenciaFim = 2026-12-15
  exigeAcordoIndividual  bool
  exigeCCT               bool
  observacaoLegal        text
```

Catálogo inicial (a validar com o trabalhista):

| Código | Dias | Jornada/dia | h/sem | Situação a partir de 16/12/2026 |
|---|---|---|---|---|
| **5x2** | 5 on / 2 off | 8h24 | 42 | ✅ padrão novo |
| **4x3** | 4 on / 3 off | 10h | 40 | ✅ requer acordo de compensação |
| **6x1** | 6 on / 1 off | 7h20 | 44 | ⛔ **encerra em 15/12/2026** |
| **12x36** | alternado | 12h | ~42 | ✅ art. 59-A; adaptar em dez/2027 |
| **6x2** | 6 on / 2 off | 7h | 42 | ✅ ciclo de 8 dias |

### 2.3 `regras_escala` — as travas e as preferências, por loja e por praça

```
regras_escala
  id · storeId? · uf? · cct?        escopo: rede, praça ou loja
  chave                             ver lista abaixo
  valor       jsonb
  tipo        enum                  DURA (trava) | MOLE (sugere) | DEPENDE_CCT (marca o plano)
  vigenciaInicio · vigenciaFim
  fonte       text                  "EC 141/2026 art. X" | "CCT SINDHA 2026" | "política interna"
```

Chaves iniciais:

| Chave | Tipo | Valor exemplo |
|---|---|---|
| `jornada_max_semanal` | DURA | 42 (→ 40 em 16/12/2027) |
| `repousos_por_semana` | DURA | 2 |
| `interjornada_min_horas` | DURA | 11 |
| `intervalo_intrajornada` | DURA | 1h acima de 6h (30min se CCT permitir) |
| `jornada_max_diaria` | DURA | 10h (8 + 2 extras) |
| `domingos_folga_mulher_mes` | **DEPENDE_CCT** | 2 |
| `domingos_folga_homem_mes` | **DEPENDE_CCT** | 1 |
| `adicional_noturno_inicio` | DURA | 22h |
| `max_dias_consecutivos` | DURA | 6 |
| `folga_preferencial` | MOLE | por pessoa |

> ⚠️ **`domingos_folga_*` entra como DEPENDE_CCT de propósito.** O art. 386 da CLT (domingo quinzenal para mulheres) está em disputa — o TST trata como direito indisponível, o STF já decidiu que é negociável. E a AMFoods opera em RS, SC, PR, SP, MG e RJ, com CCTs diferentes. Nunca hardcodar.

> ⚠️ **Sobre o mix 6x1 + 4x3 para fechar 8 folgas no mês:** a EC fala em dois repousos **SEMANAIS**, não oito mensais. Compensar na média do mês só é defensável se a CCT da praça autorizar essa apuração. O motor pode propor, mas **marca a escala como `DEPENDE_CCT`** em vez de entregar como segura. É otimização que economiza folha e pode virar passivo.

---

## 3. A demanda: como alimentar sem matar o gerente

**O problema:** 15 horas × 7 dias = **105 números por semana por loja**. Ninguém sustenta. Módulo morre em três semanas.

**O princípio que salva** (já provado no `estimarPorCurva` de receita): **a curva é estável, o que varia é o total do dia.**

1. **Calibração** — uma vez por loja (e a cada mudança de estação), o gerente informa **uma semana típica por bloco de turno**. O sistema aprende o *formato* da demanda daquela operação.
2. **Rotina** — daí em diante ele informa **só o total do dia**, que **já digita hoje** em `daily_entries.atendimentos`. O sistema distribui pela curva aprendida.
3. **Recalibração** — o sistema avisa quando o desvio entre previsto e realizado passar do limite.

> **Decisão: começar por BLOCO, não por hora.** 4-5 números em vez de 15, casa com a unidade em que a escala já é montada (`shift_blocks`), e se faltar precisão dá pra descer pra hora sem jogar nada fora.

```
demanda_bloco
  id · storeId · shiftBlockId · data
  driver            tickets | pratos | cobertos
  quantidade        numeric
  origem            enum: digitado | distribuido_curva | pdv
  createdAt · updatedAt
```

---

## 4. O motor (`server/escala-motor.ts`) — determinístico, sem IA

```
entrada:  loja, período, curva de demanda por bloco/driver,
          funções + produtividade-alvo, catálogo de escalas vigente,
          regras (DURA/MOLE/DEPENDE_CCT), equipe disponível

1. DIMENSIONAR   demanda do bloco ÷ produtividade-alvo da função
                 → pessoas-hora necessárias por função, por bloco, por dia
                 → aplica minPorBloco (piso) e maxPorBloco (teto)

2. QUADRO MÍNIMO  soma pessoas-hora da semana ÷ jornada média legal vigente
                  → menor headcount teórico por função

3. ALOCAR         distribui as pessoas nos blocos combinando escalas do catálogo
                  (o mix 4x3 + 5x2 é onde mora a eficiência: 4x3 nos dias de pico,
                  5x2 nos dias fracos)

4. FOLGAS         aplica repousos, domingos, interjornada, máx. dias consecutivos

5. VALIDAR        toda regra DURA é trava: viola → rejeita a solução
                  toda MOLE entra como custo na função objetivo
                  toda DEPENDE_CCT → gera a escala MARCADA, nunca silenciosa

6. CUSTEAR        folha projetada + encargos + extras
                  → % sobre a venda projetada do período
                  → confronta com payrollTargetPercent da loja

saída:  proposta de escala + quadro mínimo + custo + lista de violações
        e de pontos "depende de CCT"
```

**A IA entra só em dois lugares**, nunca no cálculo:
- **Explicar** a proposta em linguagem de gerente ("coloquei três no almoço de sábado porque a demanda dobra entre 12h e 14h")
- **Receber a crítica do gestor** em texto livre ("ficou apertado no jantar de sexta") e traduzir em ajuste de parâmetro para rodar de novo

## 5. O laço com o gestor (o que o Fernando pediu)

```
app propõe  →  gestor olha e diz o que ficou bom e o que ficou ruim
            →  app ajusta e repropõe  →  converge  →  gestor aprova
```

A crítica do gestor **vira parâmetro persistido**, não ajuste perdido. Se ele disser três vezes que sexta à noite está apertada, a produtividade-alvo daquele bloco é recalibrada. **O sistema aprende com o gestor, não só com o dado.**

## 6. Tela
Nova aba em `PessoasPage`, ao lado de "Escala de Trabalho":
**Funções** (cadastro + produtividade sugerida) · **Demanda** (calibração e total do dia) · **Gerar Escala** (proposta + violações + custo + crítica do gestor).

## 7. O que NÃO entra neste build
Ponto eletrônico · banco de horas · férias e afastamentos · integração com folha · app do funcionário.

---

## Decisões que preciso confirmar com o Fernando

1. **Começar por bloco** (4-5 números/dia) em vez de hora — confirmado em conversa, registrar aqui.
2. **Qual loja é o piloto?** Sugiro uma de driver simples (Casa do Pão de Queijo ou Bella Gula) para validar o motor, antes de encarar o Pecorino com três drivers.
3. **Situação das CCTs** nas praças — há negociação em curso por causa do prazo de 16/12?
4. **Como a AMFoods vai absorver a EC 141:** contratar, alongar jornada diária via acordo, ou migrar turnos para 12x36? A decisão muda o peso de cada escala no catálogo.
5. **Validação do catálogo legal com o trabalhista** antes de o motor entrar em produção.

---

# Visão completa do módulo (registrada 2026-11-19)

> Decisão do Fernando: isto não é um gerador de escala — é **o sistema de gestão de pessoas da operação**, robusto e confiável. E **todo o acesso é pelo app**, de propósito: planilha paralela mata o hábito.

## O princípio que vale para tudo abaixo
🔑 **A melhor prática não vem de fora — está dentro de casa.** A análise das DREs mostrou lojas rodando folha a **11-17%** (Pecorino GRU T2, Mania Men14, CPQ P9, família Bob's) contra outras a **30-38%** na mesma operação, mesmas marcas, mesmo país. O benchmark é interno, e é mais defensável que qualquer referência de mercado: ninguém pode dizer "aqui é diferente" quando a loja comparada é do mesmo grupo.

⚠️ **Com a EC 141, parte dessa referência fica obsoleta.** As lojas boas chegaram em 13% sob 6x1 e 44h. A régua precisa ser recalculada no regime de 42h — e o sistema é justamente quem vai descobrir a nova melhor prática, observando quem se adaptar melhor.

## As cinco camadas

| # | Camada | Entrega | Status |
|---|---|---|---|
| 1 | **Configuração** | o gerente cadastra funções, drivers, regras e blocos da loja dele | 🔵 em execução |
| 2 | **Demanda** | curva calibrada por bloco; total do dia distribui pela curva aprendida | ⬜ planejado |
| 3 | **Geração** | motor: dimensiona → quadro mínimo → aloca → folgas → valida → custeia | ⬜ planejado |
| 4 | **Análise e insights** | lê a escala montada e diz o que está errado nela | ⬜ a planejar |
| 5 | **Custo e estratégia de folha** | projeção, simulação de cenários e comparação com a melhor loja | ⬜ a planejar |

### Camada 4 — Análise e insights
Roda sobre a escala já montada (gerada pelo motor **ou** feita à mão pelo gerente — as duas precisam ser analisáveis).

- **Cobertura × demanda por bloco:** onde sobra gente e onde falta. Pico descoberto é venda perdida; vale ociosa é folha queimada.
- **Produtividade realizada × alvo**, por função e por pessoa.
- **Risco legal:** interjornada violada, dias consecutivos no limite, domingos fora da regra, jornada semanal estourando — **antes** de a escala virar realidade, não depois.
- **Concentração:** quando a operação depende demais de uma pessoa só num bloco (risco de falta).
- **Desvio de hábito:** o gerente sempre escala mais gente na sexta do que a demanda justifica? O sistema mostra o padrão.

### Camada 5 — Custo e estratégia de folha
- **Folha projetada da escala** × meta da loja × realizado da DRE — fechando o ciclo orçado→executado que o módulo de Orçamento já faz para as outras linhas.
- **Simulação de cenários:** quanto custa migrar de 5x2 para 4x3 nesta loja? E contratar meio período em vez de hora extra?
- **Comparação com a melhor loja da rede** na mesma faixa de faturamento e mesmo segmento — os campos `faixaFaturamento` e `segmento` já existem em `stores`.
- **Impacto da EC 141 por loja:** quanto headcount a mais, quanto de folha a mais, e qual arranjo de escalas minimiza o golpe.
- **Horas extras × contratação:** a partir de que ponto sai mais barato contratar.

## Regra de acesso (decisão do Fernando)
**Tudo pelo app.** Nada de planilha paralela, nada de relatório por e-mail que substitua a tela. O gerente entra no app para montar, para analisar e para justificar. É assim que o hábito se forma — e é o hábito que faz o dado chegar, não o contrário.

## Como isto se liga ao resto do app
O módulo não vive sozinho: a folha projetada alimenta o **Orçamento** (linha de pessoal), as metas alimentam o **4DX**, e os desvios viram **ações** e **treinamentos** — a mesma cadeia que o Orçamento já percorre.

---

# Extensão (2026-11-19, tarde) — Jornada partida, CCTs e pauta de negociação

> Origem: conversa com o Fernando. Três pedidos novos, em ordem crescente de valor e de risco.

## O achado que motiva tudo

Simulação com curva de restaurante de dois picos (almoço e jantar), otimizador buscando o quadro mínimo:

| | Pessoas/dia | Pessoas-hora | Desperdício |
|---|---|---|---|
| Só turno corrido (6-8h) | 6 | 45 | **114%** |
| **Com jornada partida** | **4** | **28** | **33%** |

**−33% de pessoas, −38% de horas pagas.** Causa: no turno corrido, cobrir o jantar obriga a manter gente parada no vale da tarde. Na partida, a **mesma pessoa** cobre os dois picos.

🔑 **A EC 141 custa +20%. A jornada partida devolve −33%. O saldo é negativo** — dá para cumprir a lei nova com MENOS gente do que hoje. Esse é o norte do módulo.

⚠️ **Distinção que importa juridicamente:** o que o Fernando descreveu é **intrajornada** (pausa dentro do dia), não interjornada. A **interjornada de 11h entre dias continua valendo** — quem sai às 23h não volta antes das 10h — e trava combinações. O motor precisa das duas.

## 1. Intervalo intrajornada parametrizável

A regra hoje é `{minutos:60, condicaoJornadaAcimaHoras:6, minutosReduzidoComCct:30}` — só tem piso. Passa a ter:

```
intervalo_intrajornada = {
  minutoMinimo, minutoMinimoComCct,
  minutoMaximo,            // 120 = teto legal do art. 71 CLT
  minutoMaximoComCct,      // ampliado por convenção — é o que libera a partida
  jornadaPartidaPermitida, // bool
  maxFracoesPorDia         // 2 = um retorno
}
```
Escopo por rede/UF/loja, igual às demais — **a tabela de regras já suporta.** Pausa acima do teto legal sem respaldo de CCT é marcada `DEPENDE_CCT`, nunca oferecida como segura.

## 2. Upload de convenções coletivas

Nova tabela `convencoes_coletivas`: arquivo, UF, sindicato, vigência, texto extraído. O app lê o PDF e a **IA propõe** as cláusulas relevantes a escala — intervalo, domingos, jornada diária, banco de horas, turno partido.

🔒 **Trava inegociável:** cláusula extraída por IA **NUNCA vira regra ativa sozinha.** Ela nasce como **proposta**, aparece ao lado do texto original citado, e só entra na resolução depois de **confirmação humana**. É o mesmo princípio do Orçamento — a IA propõe, o humano confirma — e aqui vale dobrado: uma cláusula mal lida vira escala ilegal em escala industrial.

Valor: a AMFoods opera em **6 estados com CCTs diferentes** e ninguém as lê. Hoje a regra de domingo está cravada como suposição; passa a sair do documento.

## 3. Pauta de negociação sindical (o mais valioso)

O motor já calcula o quadro mínimo. Rodando **análise de sensibilidade** sobre cada parâmetro negociável, ele responde quanto vale cada pedido:

> "Ampliar o intervalo para 4h nesta praça: **−2 pessoas por loja, R$ X/mês.**"
> "Reduzir o intervalo mínimo para 30min: −0 pessoas. **Não vale pedir.**"

Saída: a pauta **ordenada por retorno em reais**, com a simulação anexa — o que levar ao sindicato e o que não gastar capital político pedindo.

🔒 **Trava:** o sistema calcula **o que vale para a empresa**, nunca **o que é legal**. Toda proposta sai marcada como "sujeita a validação jurídica". Ele não opina sobre viabilidade legal — isso é do trabalhista.

> **Exemplo real desta conversa:** modular 6x1 com 4x3 (6 dias numa semana, 4 na outra) parecia economia. A conta mostrou **5 dias/semana na média — idêntico à 5x2, zero pessoa economizada.** Daria flexibilidade, não economia. Já a jornada partida dá −33%. **É exatamente esse tipo de erro que a pauta automática evita:** negociar a coisa errada custa capital político e não entrega nada.

## Onde entra
Item 1 no **Plano 2** (é parâmetro). Itens 2 e 3 viram o **Plano 4**, depois do motor existir — a pauta depende de o motor saber calcular o mínimo.

## 🔒 Guarda-corpo da pauta de negociação (decisão do Fernando)

A pauta **não pode otimizar cegamente**. Ela existe para achar o melhor arranjo **dentro** da lei e da convenção — não para descobrir o que dá mais dinheiro ignorando as duas.

Regras do gerador de propostas:
1. **Só propõe o que é plausível** — alteração de parâmetro que a lei admite negociar (intervalo, jornada diária, banco de horas, turno partido). Nunca pedido que contrarie direito indisponível.
2. **Parte do que a CCT vigente já permite.** Se a convenção da praça já autoriza 3h de intervalo, a proposta é ampliar para 4h — não começar do zero ignorando o que está acordado.
3. **Ordena por retorno, mas filtra por plausibilidade antes.** Proposta economicamente ótima e juridicamente absurda não entra na lista — nem como opção.
4. **Toda proposta sai marcada como sujeita a validação jurídica.** O sistema diz quanto vale, nunca se pode.

## Alavancas futuras de cobertura (backlog — NÃO agora)

O Fernando apontou duas, para depois do básico funcionar:
- **Contrato intermitente** (Lei 13.467/2017, art. 443 §3º e 452-A) — convocação com antecedência mínima, pagamento por período trabalhado. Encaixa em pico previsível.
- **Extras / freelancer em dias específicos** — cobertura pontual sem ampliar quadro fixo.

Ambas mudam a conta do quadro mínimo: deixam de ser "quantas pessoas fixas" e viram "qual mix de fixo + variável". **Entram só depois do motor básico estar rodando e validado.**

> Disciplina registrada pelo Fernando: *"vamos primeiro fazer o básico, depois incluímos mais coisas."* Sequência: Plano 2 (demanda) → Plano 3 (motor) → Plano 4 (CCT + pauta) → mix de contratos.
