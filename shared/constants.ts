// ─── Trail Modules ────────────────────────────────────────────────────────────
export const TRAIL_MODULES = [
  {
    id: "m01-projeto",
    num: "01",
    title: "Projeto e Comprometimento",
    desc: "Entenda o que é o Modo Dono, por que foi criado e o que muda na sua rotina como gestor.",
    contents: [
      { type: "video", label: "Apresentação do programa (8 min)" },
      { type: "text", label: "O que é pensar como dono" },
      { type: "exercise", label: "Exercício: Minha loja em 3 palavras" },
    ],
  },
  {
    id: "m02-comunidade",
    num: "02",
    title: "Comunidade dos Gestores",
    desc: "Você não está sozinho. Conheça o grupo, as leituras e o conselho de gestores.",
    contents: [
      { type: "video", label: "Como funciona o conselho (5 min)" },
      { type: "book", label: "Leitura: O Gerente Minuto" },
      { type: "exercise", label: "Apresentação no grupo" },
    ],
  },
  {
    id: "m03-orcamento",
    num: "03",
    title: "Orçamento e DRE",
    desc: "Aprenda a ler e construir o orçamento da sua loja. Entenda cada linha do DRE.",
    contents: [
      { type: "video", label: "Lendo o DRE da sua loja (12 min)" },
      { type: "spreadsheet", label: "Planilha modelo de orçamento" },
      { type: "exercise", label: "Preencher orçamento do trimestre", link: "orcamento" },
    ],
  },
  {
    id: "m04-experiencia",
    num: "04",
    title: "Experiência do Cliente",
    desc: "O eixo central do programa. O cliente é o motivo de tudo. Aprenda a medir, agir e treinar sua equipe.",
    contents: [
      { type: "video", label: "Por que a experiência vem primeiro (10 min)" },
      { type: "text", label: "Padrão de atendimento AMFoods" },
      { type: "video", label: "Como responder avaliações negativas (6 min)" },
      { type: "exercise", label: "Treinamento com a equipe esta semana" },
    ],
    highlight: true,
  },
  {
    id: "m05-salarios",
    num: "05",
    title: "Salários e Escala",
    desc: "Entenda como funciona a escala, o custo de pessoal e como otimizar sem prejudicar a operação.",
    contents: [
      { type: "video", label: "Custo de pessoal na prática (9 min)" },
      { type: "text", label: "Guia de escala inteligente" },
    ],
  },
  {
    id: "m06-faturamento",
    num: "06",
    title: "Faturamento",
    desc: "Estratégias para crescer a receita: horário de pico, mix de produtos, promoções inteligentes.",
    contents: [
      { type: "video", label: "Alavancas de faturamento (11 min)" },
      { type: "exercise", label: "Mapeie os 3 horários de pico da sua loja" },
    ],
  },
  {
    id: "m07-cmv",
    num: "07",
    title: "CMV e Estoque",
    desc: "Controle o custo de mercadoria. Aprenda a fazer contagem, interpretar o CMV e agir rápido.",
    contents: [
      { type: "video", label: "O que é CMV e por que importa (8 min)" },
      { type: "video", label: "Como fazer a contagem semanal (6 min)" },
      { type: "exercise", label: "Primeira contagem de estoque", link: "estoque" },
    ],
  },
  {
    id: "m08-preturno",
    num: "08",
    title: "Reunião de Pré-Turno",
    desc: "5 minutos antes de abrir que mudam o dia inteiro. Aprenda a conduzir o pré-turno.",
    contents: [
      { type: "video", label: "Como fazer o pré-turno (7 min)" },
      { type: "text", label: "Roteiro do pré-turno" },
      { type: "exercise", label: "Faça o pré-turno amanhã e registre" },
    ],
  },
  {
    id: "m09-operacoes",
    num: "09",
    title: "Operações e Análises",
    desc: "Casos reais, análises caso a caso. Como usar os dados para tomar decisões melhores.",
    contents: [
      { type: "video", label: "Análise de caso: CMV fora de controle (14 min)" },
      { type: "text", label: "Como ler o placar e agir" },
      { type: "exercise", label: "Análise da sua loja com o supervisor" },
    ],
  },
];

// ─── Action Categories ────────────────────────────────────────────────────────
export const ACTION_CATEGORIES = [
  { id: "cmv", label: "CMV", color: "#C8862B", desc: "Custo de mercadoria, contagem, ficha técnica, perdas" },
  { id: "experience", label: "Experiência do Cliente", color: "#710E2B", desc: "Atendimento, avaliações, padrão de serviço" },
  { id: "revenue", label: "Faturamento", color: "#1F6F3D", desc: "Ações para crescer vendas e ticket médio" },
  { id: "people", label: "Pessoas", color: "#5B6AF0", desc: "Equipe, escala, treinamento, clima" },
  { id: "discipline", label: "Disciplina", color: "#5A4F4A", desc: "Rotinas, pré-turno, lançamentos, reuniões" },
  { id: "other", label: "Outros", color: "#B3B3B3", desc: "Ações que não se encaixam nas categorias acima" },
] as const;

export const ACTION_STATUS_LABELS: Record<string, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluído",
  failed: "Não foi",
  cancelled: "Cancelado",
};

export const ACTION_TEMPLATES = [
  { category: "cmv", description: "Revisar ficha técnica dos 3 itens com maior custo", reason: "Reduzir desperdício e padronizar porcionamento" },
  { category: "cmv", description: "Auditar lixeiras e perdas no turno da noite", reason: "Identificar descarte excessivo" },
  { category: "experience", description: "Treinamento de atendimento com toda a equipe", reason: "Melhorar nota nas avaliações" },
  { category: "experience", description: "Responder todas as avaliações do Google desta semana", reason: "Mostrar presença e cuidado ao cliente" },
  { category: "revenue", description: "Ação de vendas no horário de pico (11h-13h)", reason: "Aumentar ticket médio" },
  { category: "revenue", description: "Treinar equipe em sugestão de complementos", reason: "Elevar venda por cliente" },
  { category: "people", description: "Conversa individual com colaborador com baixo desempenho", reason: "Entender causa e alinhar expectativas" },
  { category: "discipline", description: "Implementar reunião de pré-turno diária", reason: "Alinhar equipe antes da abertura" },
];

// ─── Occurrence Types ─────────────────────────────────────────────────────────
export const OCCURRENCE_TYPES = [
  { id: "complaint", label: "Reclamação", color: "#B73D2F" },
  { id: "compliment", label: "Elogio", color: "#1F6F3D" },
  { id: "suggestion", label: "Sugestão", color: "#C8862B" },
  { id: "google_review", label: "Avaliação Google", color: "#710E2B" },
] as const;
