/**
 * Seed data for the "Conselho das Operações" trilha.
 * Called from the tRPC seed.seedTrilhas procedure (server-side, has DB access).
 */
import {
  createTrilha, createModulo, createAula, getTrilhaBySlug,
  type ConteudoBloco,
} from "./db-trilhas";

export async function seedTrilhasData(): Promise<{ created: boolean; message: string }> {
  const existing = await getTrilhaBySlug("conselho-das-operacoes");
  if (existing) {
    return { created: false, message: "Trilha 'conselho-das-operacoes' já existe." };
  }

  const trilhaId = await createTrilha({
    slug: "conselho-das-operacoes",
    titulo: "Conselho das Operações",
    descricao: "Os 12 treinamentos semanais do piloto Modo Dono — uma progressão de 3 meses: ler os números → acionar as alavancas → liderar como dono.",
    publico: "gestor",
    status: "publicada",
    ordem: 1,
  });

  // ─── Mês 1 ──────────────────────────────────────────────────────────────────
  const mes1Id = await createModulo({
    trilha_id: trilhaId,
    titulo: "Mês 1 — Ler os números",
    descricao: "Junho · Entender a DRE, o CMV e a mão de obra.",
    mes_label: "Junho",
    ordem: 1,
  });

  // S01 — rascunho
  await createAula({
    modulo_id: mes1Id, trilha_id: trilhaId, numero_semana: 1,
    titulo: "Como funciona o Modo Dono",
    subtitulo: "Você é sócio do resultado",
    objetivo: "Ao fim da aula, cada gestor entende como funciona o Modo Dono e o que significa ser sócio do resultado da loja.",
    por_que: "Antes de aprender a ler os números, o gestor precisa entender por que isso importa para ele — o variável é a resposta.",
    duracao_min: 30,
    conteudo: [{ tipo: "texto", titulo: "Abertura", conteudo: "Conteúdo desta aula será adicionado em breve." }] as ConteudoBloco[],
    indicador_foco: "O resultado da sua loja",
    compromisso_texto: "Simular o variável de uma loja-exemplo, mês a mês — e trazer o cálculo para a próxima reunião.",
    material_apoio: ["Planilha de simulação do variável"],
    nota_facilitador: "Esta aula abre o piloto. O foco é criar o contrato psicológico: o gestor entende que seu ganho depende do resultado da loja.",
    status: "rascunho", ordem: 1,
  });

  // S02
  await createAula({
    modulo_id: mes1Id, trilha_id: trilhaId, numero_semana: 2,
    titulo: "Ler a DRE da loja",
    subtitulo: "Onde o dinheiro entra e onde vaza",
    objetivo: "Ao fim da aula, cada gestor sabe ler a DRE da loja dele — entende a cascata da receita até o resultado, separa o que controla do que não controla, e identifica as 2–3 linhas onde o dinheiro mais vaza.",
    por_que: "Na Semana 1 o gestor aprendeu que ganha 5% do resultado. Agora ele precisa saber ler esse resultado. A DRE é o mapa — sem ela, o gestor administra no escuro.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · A DRE é o raio-X da loja", conteudo: "A DRE mostra, em uma página, tudo que aconteceu no mês: quanto entrou, quanto cada coisa comeu, quanto sobrou. Quem sabe ler a DRE sabe **onde está perdendo dinheiro** — e onde dá pra ganhar." },
      { tipo: "tabela", titulo: "Bloco 1 · A cascata: de cima pra baixo", colunas: ["O que acontece", "% da receita (exemplo)"], linhas: [["Receita — tudo que a loja vendeu", "100%"], ["− Custo da comida (CMV)", "32%"], ["− Equipe (mão de obra)", "22%"], ["− Aluguel e utilidades (ocupação)", "16%"], ["− Impostos, taxas e franquia", "10%"], ["− Outras despesas", "12%"], ["= Resultado da loja", "8%"]] },
      { tipo: "destaque", conteudo: "Três blocos comem quase tudo: **CMV, mão de obra e ocupação**. É neles que mora o resultado — pra cima ou pra baixo.\n\nO variável do Modo Dono é 5% da última linha. Tudo que sobe a última linha, sobe o seu ganho." },
      { tipo: "tabela", titulo: "Bloco 2 · O que você mexe e o que você não mexe", colunas: ["Você controla", "Você não controla"], linhas: [["CMV — compra, ficha técnica, perdas", "Aluguel (contrato)"], ["Mão de obra — escala, produtividade", "Impostos e royalties"], ["Energia, água, gás — consumo", "Dívida da holding"], ["Manutenção, utensílios, desperdício", "Depreciação corporativa"]] },
      { tipo: "caso", titulo: "Bloco 3 · Caso da semana: abrir uma DRE linha a linha", conteudo: "Abrir a DRE real de uma loja, linha a linha. Para cada linha grande, perguntar:\n\n• Qual o **% sobre a receita**?\n• Está dentro da **faixa de referência**? *(CMV ~28–34% · mão de obra ~20–25% · ocupação ~12–18%)*\n• Se está acima — **ali vaza**.\n\nEm seguida, cada gestor abre a DRE da própria loja e marca as **2–3 linhas acima da referência**." },
    ] as ConteudoBloco[],
    indicador_foco: "Estrutura da DRE — cada gestor sabe de cabeça os % das linhas grandes da loja dele",
    compromisso_texto: "Trazer os 3 maiores % de despesa da loja e apontar qual vai atacar primeiro.",
    material_apoio: ["DRE da loja (mês mais recente fechado)", "Cartão de faixas de referência por linha"],
    nota_facilitador: "Não transformar em aula de contabilidade. O foco é prático: ler, comparar com a referência, achar o vazamento.",
    status: "publicada", ordem: 2,
  });

  // S03
  await createAula({
    modulo_id: mes1Id, trilha_id: trilhaId, numero_semana: 3,
    titulo: "CMV — o que é e como controlar",
    subtitulo: "O custo que decide o resultado",
    objetivo: "Ao fim da aula, cada gestor entende o que é o CMV, as fontes que o fazem subir e sabe acompanhar o CMV no dia a dia — sem esperar o fechamento do mês.",
    por_que: "Na Semana 2 o gestor viu que o CMV é o maior bloco da DRE. É a maior alavanca de resultado da maioria das lojas do piloto. Mas o CMV oficial só aparece no fechamento, 30 dias depois.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · O custo que decide o resultado", conteudo: "O CMV é o maior pedaço da DRE e a alavanca que mais mexe no resultado — logo, no seu variável. O problema: o número 'oficial' só sai no fechamento. Esta aula é sobre **controlar o CMV enquanto ele acontece**." },
      { tipo: "destaque", titulo: "Bloco 1 · O que é e quanto vale", conteudo: "**CMV** = quanto custou a comida e a bebida que a loja vendeu no mês. **CMV% = CMV ÷ receita.**\n\n**Quanto vale 1 ponto:** numa loja de R$ 370 mil/mês, 1 pp de CMV = **R$ 3.700 por mês**. Quatro pontos = ~R$ 15 mil. Todo mês.\n\nCada ponto de CMV que você fecha cai **direto no resultado** — e nos seus 5%." },
      { tipo: "tabela", titulo: "Bloco 2 · As 5 fontes: de onde o CMV sobe", colunas: ["Fonte", "O que é"], linhas: [["Compra", "Preço pago no insumo — compra mal feita já nasce com CMV alto"], ["Ficha técnica / porção", "Quanto vai no prato — mão pesada descontrola o custo"], ["Perdas e desperdício", "O que estraga, queima, cai, vence"], ["Furto / desvio", "Sumiço de estoque"], ["Mix de vendas", "Vender muito item de margem baixa puxa o CMV%"]] },
      { tipo: "caso", titulo: "Bloco 3 · Caso: fechar o gap de CMV", conteudo: "O CMV oficial sai no fechamento. No dia a dia, acompanha-se por:\n\n• **Curva ABC** — contar os ~10 itens que mais pesam no custo.\n• **CMV teórico × real** — o que a ficha técnica diz que deveria ter custado vs. o que o estoque mostra. A diferença denuncia perda, desvio ou porção.\n\n| Loja | CMV hoje | Referência | Gap | Valor do gap |\n|---|---|---|---|---|\n| Giraffas Confins | 36% | ~32% | 4 pp | ~R$ 15 mil/mês |\n| Giraffas Foz | 35% | ~32% | 3 pp | ~R$ 7 mil/mês |" },
    ] as ConteudoBloco[],
    indicador_foco: "CMV %",
    compromisso_texto: "Trazer a curva ABC da loja (os ~10 itens que mais pesam no CMV) e a primeira contagem desses itens.",
    material_apoio: ["Curva ABC de insumos por loja", "Planilha de CMV teórico × real", "Rotina de contagem de estoque"],
    nota_facilitador: "O ponto que precisa 'cair a ficha': o CMV não é destino, é resultado de decisões — compra, porção, perda.",
    status: "publicada", ordem: 3,
  });

  // S04
  await createAula({
    modulo_id: mes1Id, trilha_id: trilhaId, numero_semana: 4,
    titulo: "Mão de obra — escala e produtividade",
    subtitulo: "A gente certa, na hora certa, rendendo",
    objetivo: "Ao fim da aula, cada gestor sabe ler o custo de mão de obra e a produtividade da loja, e entende como ajustar a escala ao movimento.",
    por_que: "Mão de obra é o 2º maior bloco da DRE, depois do CMV. É controlável — mas é o tema mais sensível.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · Não é cortar gente", conteudo: "O tema não é 'enxugar a folha para inflar o resultado'. Cortar errado derruba o atendimento → derruba a venda → o multiplicador Qualidade te pune. O tema é **a gente certa, na hora certa, rendendo**." },
      { tipo: "destaque", titulo: "Bloco 1 · Os dois números", conteudo: "**% de mão de obra** = custo total de pessoal ÷ receita. Referência: ~20–25%.\n\n**Produtividade** = venda por pessoa (ou por hora trabalhada).\n\n**Quanto vale:** numa loja de R$ 300 mil/mês, 1 pp de mão de obra = R$ 3.000/mês." },
      { tipo: "tabela", titulo: "Bloco 2 · As alavancas", colunas: ["Alavanca", "O que o gestor faz"], linhas: [["Escala × movimento", "Gente no pico, enxuto na hora morta. O erro é a escala 'chapada', igual o dia todo."], ["Horas extras", "HE descontrolada é sintoma de escala mal feita — não de loja cheia."], ["Turnover", "Rotatividade custa caro: rescisão + admissão + treino + o novato rende menos."], ["Absenteísmo", "Falta vira hora extra ou buraco no atendimento."]] },
      { tipo: "caso", titulo: "Bloco 3 · Caso: a folha vs. as vendas", conteudo: "Pegar uma loja e cruzar:\n\n• **Folha × receita**, mês a mês — o % e a tendência.\n• A **curva de movimento do dia** (vendas por hora) contra a **escala** — onde há gente sobrando na hora morta ou faltando no pico." },
    ] as ConteudoBloco[],
    indicador_foco: "% de mão de obra e venda por pessoa",
    compromisso_texto: "Trazer a curva de movimento da loja (vendas por faixa de horário) e marcar onde a escala está descasada do movimento.",
    material_apoio: ["Folha da loja (mês fechado) + relatório de horas extras", "Vendas por faixa de horário", "Mapa de escala atual"],
    nota_facilitador: "Deixar claro desde a abertura: isto não é um treino de demissão. É de dimensionamento.",
    status: "publicada", ordem: 4,
  });

  // ─── Mês 2 ──────────────────────────────────────────────────────────────────
  const mes2Id = await createModulo({
    trilha_id: trilhaId,
    titulo: "Mês 2 — Acionar as alavancas",
    descricao: "Julho · Ficha técnica, compras, venda e qualidade.",
    mes_label: "Julho",
    ordem: 2,
  });

  // S05
  await createAula({
    modulo_id: mes2Id, trilha_id: trilhaId, numero_semana: 5,
    titulo: "Ficha técnica e rendimento",
    subtitulo: "Atacar o CMV pela cozinha",
    objetivo: "Ao fim da aula, cada gestor entende o que é a ficha técnica, como ela controla o CMV, e sabe revisar a ficha de um prato para recuperar margem.",
    por_que: "Na Semana 3, o CMV se mostrou a maior alavanca — e duas das suas 5 fontes (porção e compra) moram na ficha técnica.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · A receita de custo do prato", conteudo: "A ficha técnica define, para cada item do cardápio, **o que entra, quanto entra e quanto custa**. Quem não tem ficha viva não controla o CMV — administra no escuro." },
      { tipo: "tabela", titulo: "Bloco 1 · O que é e para que serve", colunas: ["Uso", "O que entrega"], linhas: [["Custo", "Quanto o prato custa de verdade"], ["Padronização", "Todo cozinheiro faz igual — mesma porção, mesmo custo"], ["Precificação", "Preço de venda com margem definida"], ["Rendimento", "Quanto um insumo rende depois de limpo e preparado"]] },
      { tipo: "destaque", titulo: "Bloco 2 · Os 3 conceitos que controlam o custo", conteudo: "**Gramatura / porção** — quanto vai no prato. Mão pesada estoura o custo.\n\n**Rendimento** — a perda natural do processamento. 1 kg de carne crua não vira 1 kg no prato.\n\n**Ficha desatualizada** — o preço do insumo mudou, a ficha não." },
      { tipo: "caso", titulo: "Bloco 3 · Caso: refazer a ficha de um prato", conteudo: "Pegar um prato real e **refazer a ficha do zero**:\n1. Pesar os insumos de verdade.\n2. Conferir o rendimento real.\n3. Atualizar os preços de compra.\n\n**Exemplo:** um prato custa R$ 18 na prática, mas o preço foi montado sobre R$ 14 — R$ 4 de vazamento por prato. Vende 600/mês → **R$ 2.400/mês escorrendo em um único item.**" },
    ] as ConteudoBloco[],
    indicador_foco: "CMV por item · ficha técnica atualizada",
    compromisso_texto: "Escolher os 3 pratos mais vendidos da loja, refazer a ficha (peso real, rendimento, preço atual) e trazer o ganho encontrado.",
    material_apoio: ["Modelo de ficha técnica", "Lista dos pratos mais vendidos por loja", "Balança de cozinha"],
    nota_facilitador: "O exercício só funciona com pesagem real. Feche cobrando o número: quanto cada gestor encontrou de ganho nos 3 pratos.",
    status: "publicada", ordem: 1,
  });

  // S06
  await createAula({
    modulo_id: mes2Id, trilha_id: trilhaId, numero_semana: 6,
    titulo: "Compras, estoque e perdas",
    subtitulo: "A contagem que protege a margem",
    objetivo: "Ao fim da aula, cada gestor entende como compras, controle de estoque e perdas afetam o CMV, e sabe usar a contagem de estoque como ferramenta de controle.",
    por_que: "A Semana 5 atacou o CMV pela ficha (porção do prato). Esta ataca a outra metade: comprar bem, guardar bem, perder pouco.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · O que não se conta, não se controla", conteudo: "Compra mal feita, estoque mal controlado, produto que estraga ou some — tudo cai no CMV. E o que revela isso é a **contagem**." },
      { tipo: "lista", titulo: "Bloco 1 · Comprar certo", conteudo: "• **Cotação** — comparar fornecedores.\n• **Negociação** — volume, prazo, parceria.\n• **Recebimento** — conferir o que chega: peso, qualidade, validade.\n• **Quantidade certa** — comprar demais é perda; comprar de menos é ruptura." },
      { tipo: "tabela", titulo: "Bloco 2 · Perdas e suas causas", colunas: ["Perda", "Causa típica", "Conserto"], linhas: [["Estrago", "Armazenamento, temperatura", "Organização e checagem"], ["Validade", "Pedido grande demais, sem giro", "Comprar pelo consumo real"], ["Furto / desvio", "Controle frouxo", "Contagem e conferência"]] },
      { tipo: "caso", titulo: "Bloco 3 · Caso: o que uma contagem revelou", conteudo: "A contagem é o raio-X. Com ela, faz-se o **CMV teórico × real**: o que a ficha diz que deveria ter saído vs. o que o estoque mostra que saiu. A diferença = perda + desvio + porção.\n\n**Exemplo:** contagem semanal aponta insumo com saída 12% acima do teórico. Investigando: pedido vinha grande demais e parte vencia. Conserto — ajustar o pedido ao consumo real." },
    ] as ConteudoBloco[],
    indicador_foco: "Perdas e acuracidade de estoque",
    compromisso_texto: "Fazer a contagem dos itens da curva ABC e trazer a maior diferença teórico × real encontrada — com a causa provável.",
    material_apoio: ["Mapa de contagem (curva ABC de insumos)", "Planilha de CMV teórico × real", "Checklist de recebimento"],
    nota_facilitador: "A contagem precisa ser vendida como ferramenta, não tarefa.",
    status: "publicada", ordem: 2,
  });

  // S07
  await createAula({
    modulo_id: mes2Id, trilha_id: trilhaId, numero_semana: 7,
    titulo: "Venda e ticket médio",
    subtitulo: "Vender mais para quem já entrou",
    objetivo: "Ao fim da aula, cada gestor entende o ticket médio, conhece as alavancas para aumentá-lo e sabe treinar a equipe para vender mais a quem já está na loja.",
    por_que: "As Semanas 3 a 6 atacaram o custo (CMV). Esta vira para o outro lado: a receita — pela porta mais barata: vender mais a quem já entrou.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · O cliente já está aqui", conteudo: "Aumentar o fluxo custa caro e é lento. Aumentar o **ticket médio** é imediato: o cliente já entrou, o custo fixo da loja já está pago. Cada real a mais no ticket cai quase inteiro no resultado." },
      { tipo: "destaque", titulo: "Bloco 1 · O que é e quanto vale", conteudo: "**Ticket médio** = receita ÷ número de pedidos.\n\n**Quanto vale:** uma loja com 5.000 pedidos/mês e ticket de R$ 35. Subir o ticket em **R$ 3** → **+R$ 15 mil/mês** de receita — quase toda em margem." },
      { tipo: "tabela", titulo: "Bloco 2 · As alavancas do ticket", colunas: ["Alavanca", "O que é"], linhas: [["Sugestão / upsell", "Oferecer ativamente bebida, sobremesa, acompanhamento, adicional"], ["Combos e mix", "Montar combos e destacar os itens de boa margem"], ["Sequência do atendimento", "O momento certo de cada oferta"], ["Cardápio e vitrine", "Como o produto é exposto e descrito"]] },
      { tipo: "caso", titulo: "Bloco 3 · Caso: a sugestão que vende", conteudo: "A maior parte do upsell perdido é simplesmente **o atendente não oferecer**.\n\n• *'Quer mais alguma coisa?'* — não vende.\n• *'A torta de limão saiu quentinha agora, vai uma?'* — vende.\n\nExercício: a turma constrói **2 frases de sugestão para bebida e 2 para sobremesa** — concretas, com nome do produto." },
    ] as ConteudoBloco[],
    indicador_foco: "Ticket médio",
    compromisso_texto: "Treinar com a equipe 2 frases de sugestão (bebida + sobremesa) e trazer o ticket médio da semana — antes e depois.",
    material_apoio: ["Ticket médio da loja — histórico mensal", "Curva de vendas do cardápio (itens de maior margem)", "Cartão com as frases de sugestão treinadas"],
    nota_facilitador: "O foco é o discurso da equipe. Feche cobrando as frases prontas: sem frase definida, a equipe não oferece.",
    status: "publicada", ordem: 3,
  });

  // S08
  await createAula({
    modulo_id: mes2Id, trilha_id: trilhaId, numero_semana: 8,
    titulo: "Qualidade e experiência do cliente",
    subtitulo: "O padrão que traz o cliente de volta",
    objetivo: "Ao fim da aula, cada gestor entende o que compõe a qualidade no Modo Dono, sabe ler a voz do cliente e entende por que a qualidade protege a receita futura.",
    por_que: "A qualidade é multiplicador do variável — levanta ou derruba o ganho inteiro. E é a alavanca da receita futura.",
    duracao_min: 30,
    conteudo: [
      { tipo: "destaque", titulo: "Abertura · Qualidade multiplica tudo", conteudo: "No Modo Dono, qualidade não é um pedacinho do variável — é **multiplicador**. Padrão mantido, o variável vem cheio. Padrão caiu, o variável inteiro encolhe." },
      { tipo: "tabela", titulo: "Bloco 1 · As 4 frentes da qualidade", colunas: ["Frente", "O que cuida"], linhas: [["Produto", "Padrão do prato, temperatura, apresentação"], ["Atendimento", "Simpatia, agilidade, resolução"], ["Ambiente", "Limpeza, organização, conforto"], ["Recuperação", "Como a loja reage quando algo dá errado"]] },
      { tipo: "lista", titulo: "Bloco 2 · Ler a voz do cliente", conteudo: "• **A nota do mês, não a histórica.** A nota acumulada do Google quase não se move.\n• **Ler o texto, não só a nota.** A nota diz que caiu; o texto diz **o que consertar**.\n• **Reclamação é informação grátis.** O cliente que reclama está ajudando." },
      { tipo: "caso", titulo: "Bloco 3 · Caso: a nota caiu, e aí?", conteudo: "Ciclo real de qualidade:\n1. A nota do Google **caiu** no mês.\n2. A equipe **leu as avaliações** — apareceu um padrão: 'demora no horário de pico'.\n3. **Agiu** — ajuste de escala e de processo no pico.\n4. **Mediu de novo** — a nota voltou.\n\nO ciclo: **medir → ler → agir → medir.**" },
    ] as ConteudoBloco[],
    indicador_foco: "Nota de qualidade · NPS",
    compromisso_texto: "Ler as avaliações do mês, trazer o padrão de reclamação mais frequente e 1 ação para atacá-lo.",
    material_apoio: ["Avaliações do Google / NPS da loja — do mês", "Última auditoria de padrão", "Resumo dos checklists operacionais"],
    nota_facilitador: "O erro comum é olhar só a nota. Force a turma a ler o texto das avaliações. Encerra o Mês 2.",
    status: "publicada", ordem: 4,
  });

  // ─── Mês 3 ──────────────────────────────────────────────────────────────────
  const mes3Id = await createModulo({
    trilha_id: trilhaId,
    titulo: "Mês 3 — Liderar como dono",
    descricao: "Agosto · Conduzir a equipe, criar rotinas e planejar o mês.",
    mes_label: "Agosto",
    ordem: 3,
  });

  // S09
  await createAula({
    modulo_id: mes3Id, trilha_id: trilhaId, numero_semana: 9,
    titulo: "Conduzir a equipe",
    subtitulo: "Feedback e conversas difíceis",
    objetivo: "Ao fim da aula, cada gestor sabe dar feedback (positivo e corretivo), conduzir uma conversa de desempenho e entende seu papel no clima e na retenção da equipe.",
    por_que: "As 8 aulas anteriores deram os números e as alavancas. Mas o gestor não aciona nada sozinho — quem baixa o CMV, sobe o ticket e cuida do cliente é a equipe.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · O gestor não faz, faz acontecer", conteudo: "Sozinho, o gestor não muda número nenhum. Ele conduz quem muda. A partir daqui, o tema é **gente** — e a ferramenta principal é o feedback." },
      { tipo: "lista", titulo: "Bloco 1 · Feedback: a ferramenta do dia a dia", conteudo: "• **Feedback positivo** — reconhecer o que foi bem feito. Específico vale mais que genérico.\n• **Feedback corretivo** — apontar o que precisa mudar. Sobre o **fato e o comportamento**, nunca sobre a pessoa.\n• Feedback é **contínuo** — não se guarda para a avaliação anual." },
      { tipo: "lista", titulo: "Bloco 2 · A conversa de desempenho", conteudo: "**Estrutura de uma conversa de desempenho:**\n1. **Fato concreto** — o que aconteceu, sem rodeio e sem julgar a pessoa.\n2. **Impacto** — o efeito daquilo na loja, na equipe, no cliente.\n3. **O que se espera** — claro e específico.\n4. **Combinar e acompanhar** — prazo e próximo ponto de conversa." },
      { tipo: "caso", titulo: "Bloco 3 · Clima, retenção e o caso", conteudo: "• **Turnover custa caro**: rescisão + admissão + treino + o novato rende menos.\n• **'As pessoas não saem da empresa — saem do gestor.'**\n\nA turma ensaia uma conversa de desempenho real — em duplas, um conduz, o outro observa." },
    ] as ConteudoBloco[],
    indicador_foco: "Clima e turnover",
    compromisso_texto: "Dar 1 feedback positivo específico e ter 1 conversa de desempenho que estava adiando.",
    material_apoio: ["Roteiro da conversa de desempenho (a estrutura de 4 passos)", "Dados de turnover e absenteísmo da loja"],
    nota_facilitador: "O Bloco 3 (ensaio) é o coração da aula — conversa difícil se aprende praticando, não ouvindo.",
    status: "publicada", ordem: 1,
  });

  // S10
  await createAula({
    modulo_id: mes3Id, trilha_id: trilhaId, numero_semana: 10,
    titulo: "Rotina e cadência",
    subtitulo: "Checklists e a reunião de turno",
    objetivo: "Ao fim da aula, cada gestor entende por que a rotina sustenta o resultado e sabe montar e cobrar a rotina da loja — checklists, reunião de turno e cadência.",
    por_que: "As 9 aulas anteriores deram os números, as alavancas e como conduzir gente. Mas tudo isso só vira resultado se for repetido todo dia.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · Fazer uma vez × fazer sempre", conteudo: "Qualquer gestor consegue, num dia, fazer a loja girar bem. O **dono** faz a loja girar bem **todo dia — mesmo quando não está**. A diferença tem nome: rotina." },
      { tipo: "tabela", titulo: "Bloco 1 · Os elementos da rotina", colunas: ["Elemento", "O que faz"], linhas: [["Checklists", "Abertura, fechamento, limpeza, temperatura — garantem o básico sem depender de memória"], ["Reunião de turno", "Pré-turno (alinhar movimento e foco) e passagem de turno (o que ficou pendente)"], ["Cadência", "O ritmo: diário (checklists, pré-turno), semanal (números, Conselho), mensal (fechamento)"]] },
      { tipo: "lista", titulo: "Bloco 2 · O papel do gestor na rotina", conteudo: "• **Criar** — definir os checklists essenciais e os horários.\n• **Cobrar** — checklist preenchido sem ter sido feito não vale nada.\n• **Dar o exemplo** — gestor que não segue a rotina não tem como cobrá-la.\n\n**Cuidado:** rotina boa é curta, prática e termina em ação." },
      { tipo: "caso", titulo: "Bloco 3 · Caso: a loja que virou pela disciplina", conteudo: "Uma loja melhorou o resultado **sem nenhuma grande sacada** — só passou a fazer o básico, todo dia, com disciplina:\n\n• O CMV caiu porque a **contagem virou semanal de verdade**.\n• A qualidade subiu porque o **checklist de temperatura passou a ser feito**.\n\nResultado de **repetição**, não de genialidade." },
    ] as ConteudoBloco[],
    indicador_foco: "Aderência aos checklists",
    compromisso_texto: "Revisar a rotina da loja — definir/ajustar os checklists essenciais e o pré-turno — e cobrar durante a semana.",
    material_apoio: ["Modelos de checklist (abertura, fechamento, temperatura, limpeza)", "Roteiro de pré-turno e de passagem de turno"],
    nota_facilitador: "O risco da aula é a turma confundir rotina com papelada. Insista: rotina boa é curta e gera ação.",
    status: "publicada", ordem: 2,
  });

  // S11
  await createAula({
    modulo_id: mes3Id, trilha_id: trilhaId, numero_semana: 11,
    titulo: "Planejar o mês",
    subtitulo: "Orçamento, metas e plano de ação",
    objetivo: "Ao fim da aula, cada gestor sabe planejar o mês da loja — ler o orçamento como meta, escolher as prioridades e montar um plano de ação concreto.",
    por_que: "As 10 aulas anteriores deram tudo — números, alavancas, gente, rotina. Agora o gestor junta tudo num plano.",
    duracao_min: 30,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · Reagir × conduzir o mês", conteudo: "O gestor sem plano corre atrás do que aparece. O gestor com plano sabe, no **dia 1**, o que vai atacar e como vai medir." },
      { tipo: "lista", titulo: "Bloco 1 · Os elementos do planejamento", conteudo: "• **O orçamento é a meta** — a régua do mês: receita, CMV e resultado esperados.\n• **Ler o mês anterior** — onde bateu, onde furou.\n• **Escolher as prioridades** — **2 ou 3 alavancas** no mês. Foco vence dispersão." },
      { tipo: "destaque", titulo: "Bloco 2 · O plano de ação concreto", conteudo: "*'Melhorar o CMV'* não é plano — é intenção. Plano tem cinco partes:\n\n**Prioridade → Ação concreta → Responsável → Prazo → Como medir.**\n\n| Intenção | Plano de ação |\n|---|---|\n| 'Melhorar o CMV' | Refazer a ficha dos 5 pratos mais vendidos até dia 10 *(chefe de cozinha)* · contagem dos itens ABC toda segunda *(estoquista)* · **meta: CMV de 36% → 34%** |" },
      { tipo: "caso", titulo: "Bloco 3 · Caso: montar o plano do mês ao vivo", conteudo: "Cada gestor monta, ao vivo, o **plano de ação da loja dele** para o próximo mês:\n1. Lê o orçado do mês.\n2. Escolhe 2–3 prioridades.\n3. Escreve as ações concretas — com responsável, prazo e medida.\n\nO ciclo do mês: **planejar → executar e acompanhar (Conselho) → fechar e aprender**." },
    ] as ConteudoBloco[],
    indicador_foco: "Realizado vs. orçado",
    compromisso_texto: "Trazer o plano de ação do próximo mês pronto — prioridades, ações, responsáveis, prazos e medidas.",
    material_apoio: ["Orçamento da loja para o mês seguinte", "DRE do mês anterior (realizado vs. orçado)", "Modelo de plano de ação (as 5 colunas)"],
    nota_facilitador: "O erro a corrigir é o plano vago. Force a turma a transformar intenção em ação mensurável.",
    status: "publicada", ordem: 3,
  });

  // S12
  await createAula({
    modulo_id: mes3Id, trilha_id: trilhaId, numero_semana: 12,
    titulo: "Fechamento do piloto",
    subtitulo: "O que cada loja entregou e aprendeu",
    objetivo: "Fechar o piloto: cada gestor apresenta o que a loja entregou nos 3 meses, o grupo extrai os aprendizados e a decisão sobre escalar / ajustar / descontinuar ganha insumo.",
    por_que: "Esta não é uma aula de conteúdo — é a colheita. Três meses atrás o piloto começou com uma pergunta: dá para um gestor virar dono?",
    duracao_min: 45,
    conteudo: [
      { tipo: "texto", titulo: "Abertura · Não é despedida, é colheita", conteudo: "O piloto começou com uma aposta. Agora se mede o que ela rendeu — sem suavizar e sem inflar. Os números falam." },
      { tipo: "lista", titulo: "Bloco 1 · Cada gestor apresenta (~20 min)", conteudo: "Cada gestor das 6 lojas apresenta, com **número**:\n\n• **Resultado da loja** — o trimestre do piloto vs. o trimestre anterior.\n• **Alavancas acionadas** — CMV, ticket, qualidade, mão de obra: o que mexeu e quanto rendeu.\n• **O variável conquistado** — quanto o Modo Dono pagou.\n• **Um aprendizado** — a maior virada na forma de trabalhar." },
      { tipo: "tabela", titulo: "Bloco 2 · Os 5 critérios de sucesso do piloto (~12 min)", colunas: ["Critério", "Pergunta"], linhas: [["Resultado", "As lojas evoluíram?"], ["ROI", "O ganho pagou o variável?"], ["Engajamento", "O Conselho funcionou? A liderança se sentiu dona?"], ["Justiça", "O ganho refletiu o desempenho?"], ["Operacional", "A apuração rodou sem virar inviável?"]] },
      { tipo: "destaque", titulo: "Bloco 3 · O que vem agora (~7 min)", conteudo: "O piloto alimenta a decisão: **escalar · ajustar e estender · descontinuar**.\n\nSe escalar — as próximas lojas (onda 2) e o que muda.\n\n**Reconhecimento** — foi um trimestre de dedicação real, com a dor que se prometeu lá no começo." },
    ] as ConteudoBloco[],
    indicador_foco: "Resultado do trimestre",
    compromisso_texto: "Apresentar: resultado da loja (piloto vs. trimestre anterior), alavancas acionadas e ganho de cada uma, variável total conquistado nos 3 meses, e o maior aprendizado pessoal.",
    material_apoio: ["DRE do trimestre por loja", "Histórico de variável pago mês a mês", "Resumo das alavancas acionadas por loja"],
    nota_facilitador: "O Bloco 1 é o coração — garanta que todos os 6 apresentem, com tempo justo. Corte discurso, cobre número.",
    status: "publicada", ordem: 4,
  });

  return { created: true, message: "Trilha 'Conselho das Operações' criada com 12 aulas (S01 rascunho, S02–S12 publicadas)." };
}
