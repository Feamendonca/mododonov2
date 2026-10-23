// seed-trilhas.mjs — popula trilhas, módulos e aulas com conteúdo real do Conselho das Operações
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const now = Date.now();

// Limpar dados existentes
await conn.execute("DELETE FROM trilha_aulas");
await conn.execute("DELETE FROM trilha_modulos");
await conn.execute("DELETE FROM trilhas WHERE slug IN ('mes-1-ler-os-numeros','mes-2-acionar-as-alavancas','mes-3-liderar-como-dono')");

// ─── Trilhas ──────────────────────────────────────────────────────────────────
const trilhasData = [
  { slug: "mes-1-ler-os-numeros", titulo: "Mês 1 — Ler os números", descricao: "Entenda a DRE, o CMV e a mão de obra. O gestor que lê os números enxerga onde o dinheiro entra e onde vaza.", publico: "gestor", status: "publicada", ordem: 1 },
  { slug: "mes-2-acionar-as-alavancas", titulo: "Mês 2 — Acionar as alavancas", descricao: "Ficha técnica, estoque, ticket médio e qualidade. As ferramentas que transformam leitura em resultado.", publico: "gestor", status: "publicada", ordem: 2 },
  { slug: "mes-3-liderar-como-dono", titulo: "Mês 3 — Liderar como dono", descricao: "Conduzir equipe, criar rotinas e planejar o mês. O gestor que lidera como dono constrói resultado consistente.", publico: "gestor", status: "publicada", ordem: 3 },
];

const trilhaIds = [];
for (const t of trilhasData) {
  const [r] = await conn.execute(
    "INSERT INTO trilhas (slug, titulo, descricao, publico, status, ordem, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [t.slug, t.titulo, t.descricao, t.publico, t.status, t.ordem, now, now]
  );
  trilhaIds.push(r.insertId);
  console.log(`✓ Trilha: ${t.titulo}`);
}
const [t1, t2, t3] = trilhaIds;

// ─── Módulos (um por trilha) ──────────────────────────────────────────────────
const modulosData = [
  { trilha_id: t1, titulo: "Semanas 1 a 4", descricao: "Leitura de números: DRE, CMV e mão de obra", ordem: 1, mes_label: "Junho" },
  { trilha_id: t2, titulo: "Semanas 5 a 8", descricao: "Alavancas: ficha técnica, estoque, ticket e qualidade", ordem: 1, mes_label: "Julho" },
  { trilha_id: t3, titulo: "Semanas 9 a 12", descricao: "Liderança: equipe, rotina e planejamento", ordem: 1, mes_label: "Agosto" },
];

const moduloIds = [];
for (const m of modulosData) {
  const [r] = await conn.execute(
    "INSERT INTO trilha_modulos (trilha_id, titulo, descricao, ordem, mes_label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [m.trilha_id, m.titulo, m.descricao, m.ordem, m.mes_label, now]
  );
  moduloIds.push(r.insertId);
}
const [m1, m2, m3] = moduloIds;

// ─── Aulas ────────────────────────────────────────────────────────────────────
const aulas = [
  // ── Trilha 1 ──────────────────────────────────────────────────────────────
  {
    modulo_id: m1, trilha_id: t1, numero_semana: 1, ordem: 1,
    titulo: "Como funciona o Modo Dono",
    subtitulo: "Entenda como o seu ganho é calculado",
    objetivo: "Ao fim da aula, cada gestor entende como o próprio ganho é calculado e sai sabendo simular o variável da loja dele.",
    por_que: "O gestor que entende o modelo pensa diferente — enxerga cada real como parte do próprio resultado.",
    duracao_min: 30,
    indicador_foco: "O resultado da sua loja — começar a olhar todo dia",
    compromisso_texto: "Cada gestor traz a estimativa do resultado da loja dele no mês e aponta os 2 maiores vazamentos que enxergou.",
    conteudo: [
      { tipo: "texto", titulo: "A virada", conteudo: "Qual é a diferença entre um funcionário e um dono?\n\nO funcionário entrega o combinado e recebe o combinado. O dono leva **uma fatia do que sobra** — e por isso pensa diferente: enxerga o desperdício, a venda perdida, o custo que escorre. Cada real que sobra é dele também.\n\nO Modo Dono coloca o gestor nesse lugar — **sem tirar a segurança do salário**." },
      { tipo: "texto", titulo: "Como o ganho é montado", conteudo: "O fixo continua igual — nada muda, nada se perde. É o piso.\n\nPor cima entra o **variável: 5% do resultado ajustado da loja**, todo mês.\n\n**Resultado ajustado** = o que a loja entrega, tirando o que o gestor não controla (dívida da holding, depreciação de obra corporativa). O gestor responde pelo que decide.\n\n**Não tem teto.** Quanto mais resultado, mais ele leva — proporcional à entrega." },
      { tipo: "destaque", titulo: "A fórmula", conteudo: "Variável = 5% × Resultado ajustado × multiplicador CMV × multiplicador Qualidade" },
      { tipo: "tabela", titulo: "Simulação do variável", colunas: ["Cenário", "Resultado ajustado", "5%", "CMV", "Qualidade", "Variável"], linhas: [["Mês bom", "R$ 50.000", "R$ 2.500", "×1,10", "×1,05", "R$ 2.888"], ["Mês mediano", "R$ 32.000", "R$ 1.600", "×1,00", "×1,00", "R$ 1.600"], ["Mês fraco", "R$ 18.000", "R$ 900", "×0,80", "×0,95", "R$ 684"]] },
      { tipo: "texto", titulo: "Os multiplicadores e os gatilhos", conteudo: "Dois **multiplicadores** ajustam o variável:\n\n• **CMV** — dentro da meta, multiplicador cheio. Estourou, o multiplicador cai. Estourou muito, zera o variável.\n• **Qualidade** — padrão mantido, multiplicador cheio. Padrão caiu, reduz. Problema sanitário grave, zera.\n\nAntes de tudo, os **3 gatilhos**: sem faltas injustificadas · avaliação ≥ 4,0 · sem sanção disciplinar. Falhou num gatilho → variável zero no mês." },
      { tipo: "caso", titulo: "Simular o seu variável", conteudo: "Cada gestor faz o exercício com a estimativa da própria loja. A turma vê a variação: o ganho **acompanha a entrega**." }
    ],
    quiz: [
      { pergunta: "Qual é a fórmula do variável no Modo Dono?", opcoes: ["Salário fixo + 10% de comissão sobre vendas", "5% do resultado ajustado × multiplicador CMV × multiplicador Qualidade", "5% da receita bruta da loja", "Bônus definido pelo dono no fim do mês"], correta: 1, explicacao: "O variável é 5% do resultado ajustado, multiplicado pelos dois multiplicadores (CMV e Qualidade)." },
      { pergunta: "O que acontece se o gestor tiver uma falta injustificada no mês?", opcoes: ["O variável é reduzido proporcionalmente", "O variável fica zerado no mês, independente do resultado da loja", "Nada muda — o variável é calculado normalmente", "O multiplicador de qualidade cai para 0,5"], correta: 1, explicacao: "Os 3 gatilhos são pré-requisitos. Falhou em qualquer um → variável zero no mês." },
      { pergunta: "O que é o 'resultado ajustado' no Modo Dono?", opcoes: ["A receita bruta da loja no mês", "O lucro da loja depois de todos os impostos e taxas", "O resultado da loja retirando o que o gestor não controla", "O EBITDA calculado pela franqueadora"], correta: 2, explicacao: "O resultado ajustado tira o que o gestor não decide — dívida da holding, depreciação de obra corporativa." }
    ]
  },
  {
    modulo_id: m1, trilha_id: t1, numero_semana: 2, ordem: 2,
    titulo: "Ler a DRE da loja",
    subtitulo: "Entenda a cascata da receita até o resultado",
    objetivo: "Ao fim da aula, cada gestor sabe ler a DRE da loja dele — entende a cascata da receita até o resultado, separa o que controla do que não controla, e identifica as 2–3 linhas onde o dinheiro mais vaza.",
    por_que: "Quem sabe ler a DRE sabe onde está perdendo dinheiro — e onde dá pra ganhar.",
    duracao_min: 30,
    indicador_foco: "A estrutura da DRE — cada gestor sabe de cabeça os % das linhas grandes da loja dele",
    compromisso_texto: "Cada gestor traz os 3 maiores % de despesa da loja e aponta qual vai atacar primeiro.",
    conteudo: [
      { tipo: "texto", titulo: "A DRE é o raio-X da loja", conteudo: "A DRE mostra, em uma página, tudo que aconteceu no mês: quanto entrou, quanto cada coisa comeu, quanto sobrou. Quem sabe ler a DRE sabe **onde está perdendo dinheiro** — e onde dá pra ganhar." },
      { tipo: "tabela", titulo: "A cascata: de cima pra baixo", colunas: ["O que acontece", "% da receita (exemplo)"], linhas: [["Receita — tudo que a loja vendeu", "100%"], ["− Custo da comida (CMV)", "32%"], ["− Equipe (mão de obra)", "22%"], ["− Aluguel e utilidades (ocupação)", "16%"], ["− Impostos, taxas e franquia", "10%"], ["− Outras despesas", "12%"], ["= Resultado da loja", "8%"]] },
      { tipo: "tabela", titulo: "O que você mexe e o que você não mexe", colunas: ["Você controla", "Você não controla"], linhas: [["CMV — compra, ficha técnica, perdas", "Aluguel (contrato)"], ["Mão de obra — escala, produtividade", "Impostos e royalties"], ["Energia, água, gás — consumo", "Dívida da holding"], ["Manutenção, utensílios, desperdício", "Depreciação corporativa"]] },
      { tipo: "caso", titulo: "Abrir uma DRE linha a linha", conteudo: "Para cada linha grande, perguntar:\n\n• Qual o **% sobre a receita**?\n• Está dentro da **faixa de referência**? *(CMV ~28–34% · mão de obra ~20–25% · ocupação ~12–18%)*\n• Se está acima — **ali vaza**." }
    ],
    quiz: [
      { pergunta: "Quais são os três blocos que consomem a maior parte da receita na DRE?", opcoes: ["Impostos, royalties e marketing", "CMV, mão de obra e ocupação", "Aluguel, energia e água", "Folha, benefícios e horas extras"], correta: 1, explicacao: "CMV, mão de obra e ocupação são os três maiores blocos." },
      { pergunta: "Qual é a faixa de referência para o CMV em uma loja saudável?", opcoes: ["15% a 20% da receita", "28% a 34% da receita", "40% a 45% da receita", "50% a 55% da receita"], correta: 1, explicacao: "A faixa de referência para CMV é ~28–34% da receita." },
      { pergunta: "Por que o gestor deve focar nas linhas que ele controla?", opcoes: ["Porque as outras linhas não aparecem na DRE", "Porque o resultado ajustado já desconta o que ele não controla", "Porque o aluguel e os impostos são sempre fixos", "Porque a franqueadora já cuida das outras linhas"], correta: 1, explicacao: "O resultado ajustado já tira o que o gestor não decide. Focar no que controla é focar no que constrói o próprio ganho." }
    ]
  },
  {
    modulo_id: m1, trilha_id: t1, numero_semana: 3, ordem: 3,
    titulo: "CMV: o que é e como controlar",
    subtitulo: "Controle o custo enquanto ele acontece",
    objetivo: "Ao fim da aula, cada gestor entende o que é o CMV, as fontes que o fazem subir e sabe acompanhar o CMV no dia a dia — sem esperar o fechamento do mês.",
    por_que: "O CMV é o maior pedaço da DRE e a alavanca que mais mexe no resultado — logo, no seu variável.",
    duracao_min: 30,
    indicador_foco: "CMV %",
    compromisso_texto: "Cada gestor traz a curva ABC da loja (os ~10 itens que mais pesam no CMV) e a primeira contagem desses itens.",
    conteudo: [
      { tipo: "destaque", titulo: "Quanto vale 1 ponto de CMV", conteudo: "Numa loja de R$ 370 mil/mês, 1 pp de CMV = R$ 3.700 por mês. Quatro pontos = ~R$ 15 mil. Todo mês." },
      { tipo: "tabela", titulo: "As 5 fontes: de onde o CMV sobe", colunas: ["Fonte", "O que é"], linhas: [["Compra", "Preço pago no insumo — compra mal feita já nasce com CMV alto"], ["Ficha técnica / porção", "Quanto vai no prato — mão pesada descontrola o custo"], ["Perdas e desperdício", "O que estraga, queima, cai, vence"], ["Furto / desvio", "Sumiço de estoque"], ["Mix de vendas", "Vender muito item de margem baixa puxa o CMV%"]] },
      { tipo: "tabela", titulo: "Fechar o gap de CMV", colunas: ["Loja", "CMV hoje", "Referência", "Gap", "Valor do gap"], linhas: [["Giraffas Confins", "36%", "~32%", "4 pp", "~R$ 15 mil/mês"], ["Giraffas Foz", "35%", "~32%", "3 pp", "~R$ 7 mil/mês"]] },
      { tipo: "caso", titulo: "CMV teórico × real", conteudo: "O CMV oficial sai no fechamento. No dia a dia, acompanha-se por:\n\n• **Curva ABC** — contar os ~10 itens que mais pesam no custo.\n• **CMV teórico × real** — o que a ficha técnica diz que deveria ter custado vs. o que o estoque mostra. A diferença denuncia perda, desvio ou porção." }
    ],
    quiz: [
      { pergunta: "O que significa CMV%?", opcoes: ["O lucro da loja dividido pela receita", "O custo da comida e bebida vendida dividido pela receita", "O total de despesas fixas dividido pela receita", "O custo de mão de obra dividido pela receita"], correta: 1, explicacao: "CMV% = CMV ÷ receita. Mede quanto do que entrou foi gasto com a comida e bebida." },
      { pergunta: "Qual é a principal vantagem de acompanhar o CMV teórico × real?", opcoes: ["Permite calcular o variável do gestor com mais precisão", "Revela perdas, desvios e problemas de porção sem esperar o fechamento do mês", "Substitui a necessidade de fazer a curva ABC", "Mostra quais fornecedores estão cobrando mais caro"], correta: 1, explicacao: "A diferença entre o CMV teórico e o real denuncia perda, desvio ou porção — sem esperar o fechamento." },
      { pergunta: "Numa loja com R$ 370 mil/mês de receita, quanto vale fechar 4 pontos de CMV?", opcoes: ["R$ 370 por mês", "R$ 3.700 por mês", "~R$ 15 mil por mês", "~R$ 37 mil por mês"], correta: 2, explicacao: "1 pp de CMV = R$ 3.700/mês nessa loja. 4 pp = ~R$ 14.800/mês ≈ R$ 15 mil." }
    ]
  },
  {
    modulo_id: m1, trilha_id: t1, numero_semana: 4, ordem: 4,
    titulo: "Mão de obra: escala e produtividade",
    subtitulo: "A gente certa, na hora certa, rendendo",
    objetivo: "Ao fim da aula, cada gestor sabe ler o custo de mão de obra e a produtividade da loja, e entende como ajustar a escala ao movimento.",
    por_que: "Folha enxuta com gente parada é tão ruim quanto folha cara. O tema é produtividade, não corte.",
    duracao_min: 30,
    indicador_foco: "% de mão de obra e venda por pessoa",
    compromisso_texto: "Cada gestor traz a curva de movimento da loja (vendas por faixa de horário) e marca onde a escala está descasada do movimento.",
    conteudo: [
      { tipo: "destaque", titulo: "Quanto vale 1 ponto de mão de obra", conteudo: "Numa loja de R$ 300 mil/mês, 1 pp de mão de obra = R$ 3.000/mês." },
      { tipo: "tabela", titulo: "As alavancas", colunas: ["Alavanca", "O que o gestor faz"], linhas: [["Escala × movimento", "Gente no pico, enxuto na hora morta. O erro é a escala 'chapada', igual o dia todo."], ["Horas extras", "HE descontrolada é sintoma de escala mal feita — não de loja cheia."], ["Turnover", "Rotatividade custa caro: rescisão + admissão + treino + o novato rende menos."], ["Absenteísmo", "Falta vira hora extra ou buraco no atendimento."]] },
      { tipo: "caso", titulo: "A folha vs. as vendas — Executive NVT", conteudo: "Pegar uma loja e cruzar:\n\n• **Folha × receita**, mês a mês — o % e a tendência.\n• A **curva de movimento do dia** (vendas por hora) contra a **escala** — onde há gente sobrando na hora morta ou faltando no pico.\n\nReferência: o **Executive NVT** roda com mão de obra ~29% — acima da faixa. Olhar de onde vem: escala, horas extras ou produtividade." }
    ],
    quiz: [
      { pergunta: "Qual é a faixa de referência para o % de mão de obra?", opcoes: ["10% a 15% da receita", "20% a 25% da receita", "30% a 35% da receita", "40% a 45% da receita"], correta: 1, explicacao: "A referência é ~20–25% da receita." },
      { pergunta: "O que é 'produtividade' no contexto de mão de obra?", opcoes: ["O número de funcionários por turno", "A venda por pessoa (ou por hora trabalhada)", "O custo total da folha no mês", "O percentual de absenteísmo da equipe"], correta: 1, explicacao: "Produtividade = venda por pessoa (ou por hora). A leitura certa não é 'quanto custa' — é 'quanto custa para quanto produz'." },
      { pergunta: "Por que horas extras descontroladas são um sinal de alerta?", opcoes: ["Porque aumentam o CMV da loja", "Porque indicam que a loja está crescendo rápido demais", "Porque são sintoma de escala mal feita, não de loja cheia", "Porque reduzem o multiplicador de qualidade"], correta: 2, explicacao: "HE descontrolada quase sempre indica escala mal dimensionada — gente na hora errada, não loja cheia." }
    ]
  },
  // ── Trilha 2 ──────────────────────────────────────────────────────────────
  {
    modulo_id: m2, trilha_id: t2, numero_semana: 5, ordem: 1,
    titulo: "Ficha técnica e rendimento",
    subtitulo: "A receita de custo do prato",
    objetivo: "Ao fim da aula, cada gestor entende o que é a ficha técnica, como ela controla o CMV, e sabe revisar a ficha de um prato para recuperar margem.",
    por_que: "Quem não tem ficha viva não controla o CMV — administra no escuro.",
    duracao_min: 30,
    indicador_foco: "CMV por item · ficha técnica atualizada",
    compromisso_texto: "Cada gestor escolhe os 3 pratos mais vendidos da loja, refaz a ficha (peso real, rendimento, preço atual) e traz o ganho encontrado.",
    conteudo: [
      { tipo: "tabela", titulo: "O que é e para que serve", colunas: ["Uso", "O que entrega"], linhas: [["Custo", "Quanto o prato custa de verdade"], ["Padronização", "Todo cozinheiro faz igual — mesma porção, mesmo custo"], ["Precificação", "Preço de venda com margem definida"], ["Rendimento", "Quanto um insumo rende depois de limpo e preparado"]] },
      { tipo: "texto", titulo: "Os 3 conceitos que controlam o custo", conteudo: "**Gramatura / porção** — quanto vai no prato. Mão pesada estoura o custo: cada grama a mais, multiplicada por milhares de pratos no mês, vira dinheiro.\n\n**Rendimento** — a perda natural do processamento. 1 kg de carne crua não vira 1 kg no prato. O rendimento real tem que estar na ficha, senão o custo está subestimado.\n\n**Ficha desatualizada** — o preço do insumo mudou, a ficha não. O custo real fica diferente do que a ficha diz — e ninguém percebe." },
      { tipo: "caso", titulo: "Refazer a ficha de um prato", conteudo: "Pegar um prato real e **refazer a ficha do zero**:\n1. Pesar os insumos de verdade — a porção praticada, não a teórica.\n2. Conferir o rendimento real de cada insumo.\n3. Atualizar os preços de compra.\n\nExemplo: um prato custa R$ 18 na prática, mas o preço foi montado sobre R$ 14 — R$ 4 de vazamento por prato. Vende 600/mês → R$ 2.400/mês escorrendo em um único item." }
    ],
    quiz: [
      { pergunta: "O que é a ficha técnica de um prato?", opcoes: ["O cardápio visual com foto e descrição do prato", "O documento que define o que entra, quanto entra e quanto custa cada item do cardápio", "O relatório de vendas por item do mês", "A receita de preparo para treinamento de novos cozinheiros"], correta: 1, explicacao: "A ficha técnica é a 'receita de custo' do prato — define insumos, quantidades, rendimento e custo." },
      { pergunta: "O que é 'rendimento' no contexto da ficha técnica?", opcoes: ["O lucro gerado por cada prato vendido", "A quantidade de pratos que um cozinheiro prepara por hora", "A perda natural do processamento — quanto um insumo rende depois de limpo e preparado", "O percentual de descarte permitido por turno"], correta: 2, explicacao: "Rendimento = quanto o insumo rende após processamento. Se não está na ficha, o custo está subestimado." },
      { pergunta: "Por que uma ficha técnica desatualizada é perigosa?", opcoes: ["Porque os clientes percebem que o prato mudou", "Porque o custo real fica diferente do que a ficha diz, e ninguém percebe o vazamento", "Porque a vigilância sanitária pode multar a loja", "Porque dificulta o treinamento de novos funcionários"], correta: 1, explicacao: "Se o preço do insumo subiu mas a ficha não foi atualizada, o CMV está errado — e o gestor não sabe." }
    ]
  },
  {
    modulo_id: m2, trilha_id: t2, numero_semana: 6, ordem: 2,
    titulo: "Compras, estoque e perdas",
    subtitulo: "O que não se conta, não se controla",
    objetivo: "Ao fim da aula, cada gestor entende como compras, controle de estoque e perdas afetam o CMV, e sabe usar a contagem de estoque como ferramenta de controle.",
    por_que: "Compra mal feita, estoque mal controlado, produto que estraga ou some — tudo cai no CMV.",
    duracao_min: 30,
    indicador_foco: "Perdas e acuracidade de estoque",
    compromisso_texto: "Cada gestor faz a contagem dos itens da curva ABC e traz a maior diferença teórico × real encontrada — com a causa provável.",
    conteudo: [
      { tipo: "texto", titulo: "Comprar certo", conteudo: "**Cotação** — comparar fornecedores. Não comprar no automático.\n\n**Negociação** — volume, prazo, parceria de longo prazo.\n\n**Recebimento** — conferir o que chega: peso, qualidade, validade.\n\n**Quantidade certa** — comprar demais é perda por validade e dinheiro parado; comprar de menos é ruptura e venda perdida." },
      { tipo: "tabela", titulo: "Estoque e perdas", colunas: ["Perda", "Causa típica", "Conserto"], linhas: [["Estrago", "Armazenamento, temperatura", "Organização e checagem"], ["Validade", "Pedido grande demais, sem giro", "Comprar pelo consumo real"], ["Furto / desvio", "Controle frouxo", "Contagem e conferência"]] },
      { tipo: "caso", titulo: "O que uma contagem revelou", conteudo: "A contagem semanal aponta um insumo com saída 12% acima do teórico. Investigando: o pedido vinha grande demais e parte vencia antes de girar. Conserto — ajustar o pedido ao consumo real. Vazamento estancado." }
    ],
    quiz: [
      { pergunta: "O que é 'acuracidade de estoque'?", opcoes: ["A velocidade com que os produtos giram no estoque", "Se o estoque físico bate com o que está registrado no sistema", "O percentual de produtos dentro do prazo de validade", "A quantidade de itens na curva ABC"], correta: 1, explicacao: "Acuracidade = estoque físico vs. sistema. A diferença denuncia erro de lançamento, perda não-registrada ou desvio." },
      { pergunta: "O que é o método PEPS no controle de estoque?", opcoes: ["Primeiro que Expira, Primeiro que Sai", "Primeiro que Entra, Primeiro que Sai", "Produto Especial, Pedido Semanal", "Percentual de Estoque, Perda e Sobra"], correta: 1, explicacao: "PEPS = Primeiro que Entra, Primeiro que Sai. Garante que o produto mais antigo seja usado primeiro." },
      { pergunta: "Por que comprar demais é um problema?", opcoes: ["Porque aumenta o ticket médio dos clientes", "Porque gera perda por validade e dinheiro parado em estoque", "Porque a franqueadora limita o volume de compras", "Porque dificulta a contagem semanal"], correta: 1, explicacao: "Comprar demais = produto que vence antes de girar (perda total) + capital imobilizado em estoque." }
    ]
  },
  {
    modulo_id: m2, trilha_id: t2, numero_semana: 7, ordem: 3,
    titulo: "Venda e ticket médio",
    subtitulo: "O cliente já está aqui",
    objetivo: "Ao fim da aula, cada gestor entende o ticket médio, conhece as alavancas para aumentá-lo e sabe treinar a equipe para vender mais a quem já está na loja.",
    por_que: "Aumentar o ticket médio é imediato: o cliente já entrou, o custo fixo da loja já está pago.",
    duracao_min: 30,
    indicador_foco: "Ticket médio",
    compromisso_texto: "Cada gestor treina com a equipe 2 frases de sugestão (bebida + sobremesa) e traz o ticket médio da semana — antes e depois.",
    conteudo: [
      { tipo: "destaque", titulo: "Quanto vale subir o ticket", conteudo: "Uma loja com 5.000 pedidos/mês e ticket de R$ 35. Subir o ticket em R$ 3 → +R$ 15 mil/mês de receita — quase toda em margem." },
      { tipo: "tabela", titulo: "As alavancas do ticket", colunas: ["Alavanca", "O que é"], linhas: [["Sugestão / upsell", "Oferecer ativamente bebida, sobremesa, acompanhamento, adicional"], ["Combos e mix", "Montar combos e destacar os itens de boa margem"], ["Sequência do atendimento", "O momento certo de cada oferta — bebida na chegada, sobremesa no fim"], ["Cardápio e vitrine", "Como o produto é exposto e descrito"]] },
      { tipo: "caso", titulo: "A sugestão que vende", conteudo: "❌ *'Quer mais alguma coisa?'* — não vende.\n✅ *'A torta de limão saiu quentinha agora, vai uma?'* — vende.\n\n**Não é empurrar.** Empurrar irrita o cliente e derruba a qualidade. É **sugerir bem**, no momento certo, o que faz sentido." }
    ],
    quiz: [
      { pergunta: "Como se calcula o ticket médio?", opcoes: ["Receita total ÷ número de funcionários", "Receita total ÷ número de pedidos", "Lucro líquido ÷ número de clientes", "CMV ÷ número de pratos vendidos"], correta: 1, explicacao: "Ticket médio = receita ÷ número de pedidos. Mede quanto cada cliente gasta em média por visita." },
      { pergunta: "Por que aumentar o ticket médio é mais eficiente do que aumentar o fluxo de clientes?", opcoes: ["Porque o marketing de fluxo é proibido pela franqueadora", "Porque o cliente já está na loja, o custo fixo já está pago — cada real a mais cai quase inteiro no resultado", "Porque o ticket médio é o único indicador que o gestor controla", "Porque aumentar fluxo exige contratar mais funcionários"], correta: 1, explicacao: "Com o cliente já na loja e o custo fixo coberto, cada real a mais no ticket tem margem muito alta." },
      { pergunta: "Qual é o risco de forçar o upsell de forma agressiva?", opcoes: ["O CMV da loja sobe automaticamente", "O cliente reclama e derruba o multiplicador de Qualidade", "A franqueadora pode cancelar o contrato", "O ticket médio cai porque os clientes pedem menos"], correta: 1, explicacao: "Upsell forçado irrita o cliente → derruba a qualidade → o multiplicador Qualidade pune o variável." }
    ]
  },
  {
    modulo_id: m2, trilha_id: t2, numero_semana: 8, ordem: 4,
    titulo: "Qualidade e experiência do cliente",
    subtitulo: "Qualidade multiplica tudo",
    objetivo: "Ao fim da aula, cada gestor entende o que compõe a qualidade no Modo Dono, sabe ler a voz do cliente e entende por que a qualidade protege a receita futura.",
    por_que: "No Modo Dono, qualidade não é um pedacinho do variável — é multiplicador.",
    duracao_min: 30,
    indicador_foco: "Nota de qualidade · NPS",
    compromisso_texto: "Cada gestor lê as avaliações do mês, traz o padrão de reclamação mais frequente e 1 ação para atacá-lo.",
    conteudo: [
      { tipo: "tabela", titulo: "O que é qualidade no Modo Dono", colunas: ["Frente", "O que cuida"], linhas: [["Produto", "Padrão do prato, temperatura, apresentação"], ["Atendimento", "Simpatia, agilidade, resolução"], ["Ambiente", "Limpeza, organização, conforto"], ["Recuperação", "Como a loja reage quando algo dá errado"]] },
      { tipo: "destaque", titulo: "Reclamação é informação grátis", conteudo: "O cliente que reclama está ajudando. O que não reclama simplesmente não volta — e você nunca soube por quê." },
      { tipo: "caso", titulo: "A nota caiu, e aí?", conteudo: "Ciclo real:\n1. A nota do Google **caiu** no mês.\n2. A equipe **leu as avaliações** — apareceu um padrão: 'demora no horário de pico'.\n3. **Agiu** — ajuste de escala e de processo no pico.\n4. **Mediu de novo** — a nota voltou.\n\nO ciclo: **medir → ler → agir → medir**. Qualidade não é sorte — é gestão." }
    ],
    quiz: [
      { pergunta: "Por que a qualidade é chamada de 'multiplicador' no Modo Dono?", opcoes: ["Porque multiplica o número de clientes da loja", "Porque ajusta o variável inteiro para cima ou para baixo — não é só uma parte", "Porque multiplica o CMV quando há problemas sanitários", "Porque é calculada multiplicando a nota do Google pelo NPS"], correta: 1, explicacao: "Qualidade é multiplicador: padrão mantido, variável cheio; padrão caiu, variável encolhe; problema sanitário grave, zera." },
      { pergunta: "Por que ler o texto das avaliações é mais importante do que só olhar a nota?", opcoes: ["Porque a nota do Google não é confiável", "Porque a nota diz que caiu, mas o texto diz o que consertar", "Porque o texto é o único dado que a franqueadora analisa", "Porque clientes que deixam texto são os mais fiéis"], correta: 1, explicacao: "A nota mostra o sintoma; o texto mostra a causa." },
      { pergunta: "Qual é o ciclo correto de gestão da qualidade?", opcoes: ["Treinar → avaliar → demitir → contratar", "Medir → ler → agir → medir", "Reclamar → investigar → punir → melhorar", "Auditar → corrigir → premiar → auditar"], correta: 1, explicacao: "Medir → ler → agir → medir. Qualidade não é sorte — é gestão." }
    ]
  },
  // ── Trilha 3 ──────────────────────────────────────────────────────────────
  {
    modulo_id: m3, trilha_id: t3, numero_semana: 9, ordem: 1,
    titulo: "Conduzir a equipe",
    subtitulo: "O gestor não faz, faz acontecer",
    objetivo: "Ao fim da aula, cada gestor sabe dar feedback (positivo e corretivo), conduzir uma conversa de desempenho e entende seu papel no clima e na retenção da equipe.",
    por_que: "Sozinho, o gestor não muda número nenhum. Ele conduz quem muda.",
    duracao_min: 30,
    indicador_foco: "Clima · turnover",
    compromisso_texto: "Cada gestor dá 1 feedback positivo específico e tem 1 conversa de desempenho que estava adiando.",
    conteudo: [
      { tipo: "texto", titulo: "Feedback: a ferramenta do dia a dia", conteudo: "**Feedback positivo** — reconhecer o que foi bem feito. Específico vale mais que genérico: *'você conduziu bem o pico de ontem'* > *'bom trabalho'*.\n\n**Feedback corretivo** — sobre o **fato e o comportamento**, nunca sobre a pessoa. Perto do fato, em privado.\n\nFeedback é **contínuo** — não se guarda para a avaliação anual." },
      { tipo: "texto", titulo: "A conversa de desempenho", conteudo: "Estrutura:\n1. **Fato concreto** — o que aconteceu, sem rodeio e sem julgar a pessoa.\n2. **Impacto** — o efeito daquilo na loja, na equipe, no cliente.\n3. **O que se espera** — claro e específico.\n4. **Combinar e acompanhar** — prazo e próximo ponto de conversa." },
      { tipo: "destaque", titulo: "Por que as pessoas saem", conteudo: "As pessoas não saem da empresa — saem do gestor. O gestor é o maior fator de clima da loja." }
    ],
    quiz: [
      { pergunta: "Qual é a diferença entre feedback positivo genérico e específico?", opcoes: ["O genérico é dado em público; o específico, em privado", "O específico ('você conduziu bem o pico de ontem') é mais poderoso porque conecta o reconhecimento a um comportamento real", "O genérico é para funcionários novos; o específico, para veteranos", "Não há diferença prática — o importante é dar feedback"], correta: 1, explicacao: "Feedback específico conecta o reconhecimento a um comportamento concreto, reforçando exatamente o que deve se repetir." },
      { pergunta: "Qual é a estrutura correta de uma conversa de desempenho?", opcoes: ["Advertência → punição → acompanhamento", "Fato concreto → impacto → o que se espera → combinar e acompanhar", "Elogio → crítica → elogio (sanduíche)", "Problema → causa → solução → prazo"], correta: 1, explicacao: "Fato concreto → impacto → o que se espera → combinar e acompanhar." },
      { pergunta: "Por que adiar uma conversa de desempenho é prejudicial?", opcoes: ["Porque a franqueadora pode penalizar o gestor", "Porque só piora — para a loja e para a própria pessoa", "Porque o colaborador pode pedir demissão antes da conversa", "Porque o RH exige que conversas sejam feitas em até 48h"], correta: 1, explicacao: "Adiar só piora: o comportamento continua, o impacto cresce, e a pessoa não tem chance de corrigir." }
    ]
  },
  {
    modulo_id: m3, trilha_id: t3, numero_semana: 10, ordem: 2,
    titulo: "Rotina e cadência",
    subtitulo: "Fazer uma vez × fazer sempre",
    objetivo: "Ao fim da aula, cada gestor entende por que a rotina sustenta o resultado e sabe montar e cobrar a rotina da loja — checklists, reunião de turno e cadência.",
    por_que: "Qualquer gestor consegue, num dia, fazer a loja girar bem. O dono faz girar bem todo dia — mesmo quando não está.",
    duracao_min: 30,
    indicador_foco: "Aderência aos checklists",
    compromisso_texto: "Cada gestor revisa a rotina da loja — define/ajusta os checklists essenciais e o pré-turno — e cobra durante a semana.",
    conteudo: [
      { tipo: "tabela", titulo: "Os elementos da rotina", colunas: ["Elemento", "O que faz"], linhas: [["Checklists", "Abertura, fechamento, limpeza, temperatura — garantem o básico sem depender de memória"], ["Reunião de turno", "Pré-turno (alinhar movimento, foco e quem faz o quê) e passagem de turno (o que aconteceu, o que ficou pendente)"], ["Cadência", "O ritmo: diário (checklists, pré-turno), semanal (números, Conselho), mensal (fechamento)"]] },
      { tipo: "destaque", titulo: "Padrão é repetição", conteudo: "Rotina não é burocracia. Checklist que ninguém olha e reunião que não decide nada são teatro. Rotina boa é curta, prática e termina em ação." },
      { tipo: "caso", titulo: "A loja que virou pela disciplina", conteudo: "Uma loja melhorou o resultado **sem nenhuma grande sacada** — só passou a fazer o básico, todo dia, com disciplina:\n\n• O CMV caiu porque a **contagem virou semanal de verdade**.\n• A qualidade subiu porque o **checklist de temperatura passou a ser feito**.\n\nResultado de **repetição**, não de genialidade." }
    ],
    quiz: [
      { pergunta: "Qual é a diferença entre um gestor e um dono no que diz respeito à rotina?", opcoes: ["O dono cria os checklists; o gestor os executa", "Qualquer gestor faz a loja girar bem num dia; o dono faz girar bem todo dia — mesmo quando não está", "O gestor segue a rotina; o dono a ignora porque confia na equipe", "O dono tem mais checklists; o gestor tem menos"], correta: 1, explicacao: "A diferença é consistência. O dono constrói a rotina que garante bons dias mesmo na sua ausência." },
      { pergunta: "Por que um checklist preenchido sem ter sido feito é perigoso?", opcoes: ["Porque a vigilância sanitária pode multar a loja", "Porque cria uma falsa sensação de controle — o problema existe mas está invisível", "Porque aumenta o tempo de abertura da loja", "Porque o sistema de gestão registra a inconsistência"], correta: 1, explicacao: "Checklist falso é pior que não ter checklist: o gestor acredita que o básico está feito quando não está." },
      { pergunta: "O que caracteriza uma 'rotina boa' no Modo Dono?", opcoes: ["Longa, detalhada e com muitos itens para garantir cobertura total", "Curta, prática e que termina em ação", "Feita apenas pelo gestor, sem delegar para a equipe", "Revisada mensalmente pela franqueadora"], correta: 1, explicacao: "Rotina boa é curta, prática e termina em ação. Burocracia sem resultado não é rotina — é teatro." }
    ]
  },
  {
    modulo_id: m3, trilha_id: t3, numero_semana: 11, ordem: 3,
    titulo: "Planejar o mês",
    subtitulo: "Reagir × conduzir o mês",
    objetivo: "Ao fim da aula, cada gestor sabe planejar o mês da loja — ler o orçamento como meta, escolher as prioridades e montar um plano de ação concreto.",
    por_que: "O gestor sem plano corre atrás do que aparece. O dono não espera o mês acontecer — ele conduz.",
    duracao_min: 30,
    indicador_foco: "Realizado vs. orçado",
    compromisso_texto: "Cada gestor traz o plano de ação do próximo mês pronto — prioridades, ações, responsáveis, prazos e medidas.",
    conteudo: [
      { tipo: "destaque", titulo: "Plano vs. intenção", conteudo: "'Melhorar o CMV' não é plano — é intenção. Plano tem cinco partes: Prioridade → Ação concreta → Responsável → Prazo → Como medir. Se não dá para medir, não é plano — é desejo." },
      { tipo: "tabela", titulo: "Intenção vs. plano de ação", colunas: ["Intenção", "Plano de ação"], linhas: [["'Melhorar o CMV'", "Refazer a ficha dos 5 pratos mais vendidos até dia 10 (chefe de cozinha) · contagem dos itens ABC toda segunda (estoquista) · meta: CMV de 36% → 34%"]] },
      { tipo: "caso", titulo: "Montar o plano do mês ao vivo", conteudo: "Cada gestor monta, ao vivo, o **plano de ação da loja dele** para o próximo mês:\n1. Lê o orçado do mês.\n2. Escolhe 2–3 prioridades.\n3. Escreve as ações concretas — com responsável, prazo e medida.\n\nO ciclo do mês: **planejar → executar e acompanhar (Conselho) → fechar e aprender**." }
    ],
    quiz: [
      { pergunta: "O que é um plano de ação concreto no Modo Dono?", opcoes: ["Uma lista de intenções de melhoria para o mês", "Uma meta com prioridade, ação concreta, responsável, prazo e como medir", "O orçamento aprovado pelo dono para o mês", "O relatório de resultado do mês anterior"], correta: 1, explicacao: "Plano tem 5 partes: prioridade → ação concreta → responsável → prazo → como medir." },
      { pergunta: "Por que o gestor deve escolher apenas 2 ou 3 prioridades no mês?", opcoes: ["Porque a franqueadora limita o número de ações por mês", "Porque foco vence dispersão — atacar tudo é não atacar nada", "Porque o Conselho só acompanha até 3 indicadores por reunião", "Porque mais de 3 prioridades aumenta o CMV"], correta: 1, explicacao: "Foco vence dispersão. Com muitas prioridades, nenhuma recebe atenção suficiente." },
      { pergunta: "Qual é o ciclo correto do planejamento mensal?", opcoes: ["Orçar → executar → ignorar → repetir", "Planejar → executar e acompanhar (Conselho) → fechar e aprender", "Medir → punir → corrigir → medir", "Definir metas → delegar → cobrar no fim do mês"], correta: 1, explicacao: "Planejar → executar e acompanhar (Conselho semanal) → fechar e aprender. O aprendizado do mês entra no plano do mês seguinte." }
    ]
  },
  {
    modulo_id: m3, trilha_id: t3, numero_semana: 12, ordem: 4,
    titulo: "Fechamento do piloto",
    subtitulo: "O que o trimestre construiu",
    objetivo: "Ao fim da aula, cada gestor apresenta o que a loja entregou e aprendeu no trimestre, e consolida os compromissos para o próximo ciclo.",
    por_que: "Três meses. Doze semanas. Doze temas. Esta aula é o fechamento — e o ponto de partida para o próximo ciclo.",
    duracao_min: 30,
    indicador_foco: "Resultado do trimestre",
    compromisso_texto: "Cada gestor apresenta o resultado da loja no trimestre e os 3 principais aprendizados que vai carregar.",
    conteudo: [
      { tipo: "texto", titulo: "A jornada das 12 semanas", conteudo: "**Mês 1 — Ler os números:** DRE, CMV, mão de obra. O gestor aprendeu onde o dinheiro entra e onde vaza.\n\n**Mês 2 — Acionar as alavancas:** ficha técnica, estoque, ticket médio, qualidade. O gestor aprendeu a mover os números.\n\n**Mês 3 — Liderar como dono:** equipe, rotina, planejamento. O gestor aprendeu a construir resultado consistente." },
      { tipo: "texto", titulo: "Apresentação final de cada gestor", conteudo: "Cada gestor apresenta:\n\n1. **O resultado do trimestre** — o que a loja entregou vs. o orçado.\n2. **As 3 maiores alavancas acionadas** — o que mudou de verdade.\n3. **O maior aprendizado** — o que vai carregar para o próximo ciclo.\n4. **O compromisso para o próximo trimestre** — 1 meta concreta." },
      { tipo: "destaque", titulo: "O que o Conselho constrói", conteudo: "Gestores que pensam como donos constroem operações que funcionam." }
    ],
    quiz: [
      { pergunta: "Qual é o tema central do Mês 1 do Conselho das Operações?", opcoes: ["Liderar como dono", "Acionar as alavancas", "Ler os números", "Planejar o trimestre"], correta: 2, explicacao: "Mês 1 (Junho) é 'Ler os números' — DRE, CMV e mão de obra." },
      { pergunta: "O que o gestor deve apresentar no fechamento do piloto?", opcoes: ["Apenas o resultado financeiro da loja", "Resultado do trimestre, 3 maiores alavancas acionadas, maior aprendizado e compromisso para o próximo ciclo", "O plano de ação do próximo mês", "A avaliação dos colegas gestores"], correta: 1, explicacao: "A apresentação final tem 4 partes: resultado vs. orçado, alavancas acionadas, maior aprendizado e compromisso." },
      { pergunta: "O que o Conselho das Operações representa para o Modo Dono?", opcoes: ["Uma reunião mensal de avaliação de desempenho", "O espaço semanal onde gestores aprendem, compartilham casos e se comprometem com ações concretas", "Uma auditoria trimestral da franqueadora", "O processo de aprovação do orçamento mensal"], correta: 1, explicacao: "O Conselho é o espaço semanal de aprendizado e comprometimento." }
    ]
  }
];

for (const aula of aulas) {
  const { quiz, conteudo, ...aulaData } = aula;
  await conn.execute(
    `INSERT INTO trilha_aulas (modulo_id, trilha_id, numero_semana, titulo, subtitulo, objetivo, por_que, duracao_min, conteudo, quiz, indicador_foco, compromisso_texto, status, ordem, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publicada', ?, ?, ?)`,
    [
      aulaData.modulo_id, aulaData.trilha_id, aulaData.numero_semana,
      aulaData.titulo, aulaData.subtitulo, aulaData.objetivo, aulaData.por_que,
      aulaData.duracao_min, JSON.stringify(conteudo), JSON.stringify(quiz),
      aulaData.indicador_foco, aulaData.compromisso_texto,
      aulaData.ordem, now, now
    ]
  );
  console.log(`  ✓ Semana ${aulaData.numero_semana}: ${aulaData.titulo}`);
}

await conn.end();
console.log("\n✅ Seed concluído — 3 trilhas, 3 módulos e 12 aulas inseridas.");
