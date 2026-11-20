# Análise — Escala Fácil (Mania de Churrasco) · aprendizados para o nosso módulo

> Navegado em 19/11/2026 com acesso do Fernando. Loja observada: P. AER. POA.
> **Uso: referência de solução.** Aprender padrão de fluxo e decisão de produto — não replicar tela nem texto.

## A arquitetura deles: duas etapas separadas

| Tela | Pergunta que responde |
|---|---|
| **Simulador de Quadro** | *quantas pessoas, de qual cargo, em qual turno e escala* |
| **Escala Oficial** ("finalização da equipe") | *quem, pelo nome, preenche esse quadro* |

O simulador é explicitamente **"INDEPENDENTE DA ESCALA OFICIAL"** — dá para simular à vontade sem tocar na escala real.

🔑 **Nós conflamos as duas coisas.** Separar é melhor: o gestor brinca com cenários sem medo, e só "promove" quando decidir.

## 🏆 O aprendizado que vale mais: eles contornaram o problema do dado

**Eles não têm curva de demanda. Não têm driver. Não têm produtividade.**

O gerente declara a **META por dia da semana × turno**:

| DIA | META DIURNO | META NOTURNO |
|---|---|---|
| Segunda | 8 | 4 |
| Sexta | 9 | 4 |
| Sábado | 6 | 4 |

São **14 números**, definidos uma vez, que mudam raramente. **Zero alimentação recorrente.**

Compare com o nosso desenho: contagem por bloco → driver → produtividade → necessidade. Tecnicamente mais correto, **mas depende de dado que o gerente não tem e não vai manter**. Foi exatamente o risco que eu levantei ("105 números por semana mata o módulo") e que tentei resolver com curva calibrada. **Eles resolveram eliminando a pergunta.**

> **Conclusão honesta: a abordagem deles é mais grosseira e mais provável de funcionar.** O certo para nós é oferecer os dois caminhos: meta declarada (entrada) e, quando houver dado, derivada da demanda (evolução).

## O que copiar (conceito, não pixel)

1. **"Quadro Ideal: 14 pessoas"** — um número grande, no topo, antes de qualquer detalhe. É a resposta que o gestor quer.
2. **Tabela de gap por dia × turno**, com `META | SIMULADO | GAP`. Legenda: *"Verde = meta atendida · Vermelho = abaixo · **Amarelo = acima da meta**"* — 🔑 **excesso também é sinalizado**. É exatamente o desperdício que o Fernando quer matar, e nós só modelamos a falta.
3. **"Períodos 100% cobertos: 0 de 14"** — métrica única de completude.
4. **"Maior gap: Segunda Diurno −6"** — aponta o pior ponto pelo nome. Diagnóstico acionável, não só percentual.
5. **Modo inverso: "Sugerir quadro" + "Quadro desejado" (opcional)** — o gestor pode dizer *"quero 12 pessoas, ajeita"* em vez de só receber o mínimo. **Não temos isso e deveríamos.**
6. **"Cenários salvos"** (ex.: *"Cenário EC141 + 12x36"*) — comparar arranjos lado a lado. Casa com a nossa pauta de negociação sindical.
7. **"Quantidade de mulheres"** como restrição explícita, e coluna `MULHERES` por cargo — a regra de domingo do art. 386 virou campo de primeira classe.
8. **"Dias de recebimento" (1º e 2º)** — dia de entrega como fator de dimensionamento. **Não tínhamos pensado nisso** e é real: dia de recebimento consome gente.
9. **Conservadorismo declarado:** *"Simulado = menor disponibilidade por dia da semana no mês"* — usam o pior caso do mês, não a média.

## O que nós temos e eles não

| Nosso | Deles |
|---|---|
| Motor de regras legais **com vigência** (44h→42h→40h automático) | "5x2 EC141" é só o **nome** de uma escala |
| Escopo rede/UF/loja para CCT diferente por praça | aparentemente único |
| Driver por função (tickets/pratos/cobertos) | só cargo |
| Produtividade derivada de histórico | não há |
| **Jornada partida** | não vi |
| Upload de CCT e pauta de negociação | não há |

**Força deles: operabilidade. Força nossa: rigor.** A síntese é onde está o produto bom.

## Ajustes propostos ao nosso plano

**No Plano 2 (demanda) — mudança de prioridade:**
- **Meta declarada por dia×turno passa a ser o caminho PRINCIPAL** de entrada. Curva de demanda vira a evolução, para quem tiver dado.
- Acrescentar **dias de recebimento** como fator.

**No Plano 3 (motor):**
- Separar **Simulador** de **Escala Oficial**, como eles.
- Tabela de gap por dia × turno com **três estados: falta, atende, excede**.
- Modo **"quadro desejado"** (inverso) além do "mínimo".
- **Cenários salvos** e comparáveis.

**Na tela:** um número grande de resposta no topo, diagnóstico que aponta o pior ponto pelo nome, e linguagem de operação — não de sistema.
