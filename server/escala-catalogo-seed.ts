/**
 * escala-catalogo-seed.ts — Catálogo legal de escalas + regras legais iniciais
 *
 * Dados puros (sem lógica, sem acesso a banco). Alimenta as tabelas
 * `escalas_catalogo` e `regras_escala` (drizzle/schema.ts) na primeira
 * carga do módulo de Escala, via os mappers `toInsertCatalogo`/`toInsertRegra`
 * no final deste arquivo.
 *
 * Decisão de arquitetura (spec seção 1): toda regra legal é PARÂMETRO com
 * data de vigência, nunca constante em código de lógica. O motor
 * (server/escala-motor.ts, task futura) pergunta "qual regra vale nesta
 * data, nesta loja, nesta CCT" — em dez/2027 muda um registro, não o código.
 *
 * Marco legal (EC 141/2026):
 *   até 15/12/2026 — 44h/semana · 1 repouso semanal (6x1 válida)
 *   16/12/2026     — 2 repousos semanais · 42h/semana
 *   16/12/2027     — 40h/semana
 *
 * Toda chave/código com mais de um registro cobre a linha do tempo sem
 * buraco nem sobreposição desde "sempre" (vigenciaInicio null no registro
 * mais antigo) até onde já sabemos o que vale — ver o teste genérico em
 * escala-catalogo-seed.test.ts (findings 2/3/5 da revisão de 2026-11-19:
 * uma versão anterior deste arquivo tinha 5x2/6x2 começando do nada em
 * 16/12/2026 e terminando no limbo em 16/12/2027; não fazer de novo).
 *
 * Ver docs/superpowers/specs/2026-11-19-gestor-de-escala-design.md,
 * seções "1. O marco legal" e "2. As três tabelas de parâmetro".
 */
import type { InsertEscalaCatalogo, InsertRegraEscala } from "../drizzle/schema";
// Import de VALOR (não `import type`) e, mesmo assim, sem ciclo em runtime:
// `escala-regras.ts` importa daqui só com `import type`, que o TS apaga na
// compilação. Normalizar UF em UM lugar só é regra deste módulo (Menor 11
// da Task 4) — ver `toInsertRegra`.
import { normalizarUf } from "./escala-regras";

export type DriverFuncao = "tickets" | "pratos" | "cobertos";
export type TipoRegra = "DURA" | "MOLE" | "DEPENDE_CCT";

/**
 * 🔴 R29 (I7 da review final) — marcador EXPLÍCITO de exceção legal.
 *
 * O catálogo contradizia as próprias regras: a 12x36 tem jornada de 12h/dia
 * e o seed cadastra `jornada_max_diaria: 10` como DURA. Sem este campo, o
 * motor do Plano 3 (que trata toda DURA como trava: viola → rejeita a
 * solução) descartaria a 12x36 — um regime legítimo, amparado pelo art.
 * 59-A da CLT — ou, pior, alguém "resolveria" afrouxando a DURA de 10h para
 * todo mundo, que é como uma exceção pontual vira buraco geral.
 *
 * O marcador é por CHAVE DE REGRA (não um booleano genérico "é exceção"):
 * diz exatamente QUAL trava este regime excepciona e com que fundamento —
 * é isso que o motor precisa saber, e é isso que defende a escala numa
 * reclamatória. Qualquer outra DURA continua valendo normalmente para o
 * regime.
 */
export interface ExcecaoLegalEscala {
  /** Chave da regra DURA excepcionada (ex.: "jornada_max_diaria"). */
  chaveRegra: string;
  /** Base legal da exceção (ex.: "CLT art. 59-A"). */
  fundamento: string;
}

export interface EscalaCatalogoSeed {
  codigo: string;
  nome: string;
  diasTrabalho: number;
  diasFolga: number;
  horasDiaPadrao: number;
  horasSemanaMedia: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  exigeAcordoIndividual: boolean;
  exigeCCT: boolean;
  observacaoLegal: string;
  /** R29: travas legais que ESTE regime excepciona, com fundamento. `null`
   * (ou ausente) = nenhuma exceção — o regime obedece a todas as DURAs. */
  excecoesLegais?: ExcecaoLegalEscala[] | null;
}

export interface RegraSeed {
  storeId: number | null;
  uf: string | null;
  cct: string | null;
  chave: string;
  valor: unknown;
  tipo: TipoRegra;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  fonte: string;
}

// ─── escalas_catalogo — spec seção 2.2 ────────────────────────────────────────
// Catálogo inicial (a validar com o trabalhista). 5x2 e 6x2 têm uma versão
// por regime de jornada — hoje só a 5x2, depois que a 6x2 pós-EC saiu
// (R29) —, igual ao que já fazíamos em regras_escala; ver nota acima.
// 4x3 já é 40h, cabe em qualquer regime; 6x1 morre em 15/12/2026; 12x36
// (art. 59-A) fecha em 15/12/2027 sem sucessora porque a própria lei ainda
// não diz como adaptar um turno de 12h a um teto de 40h/semana.
// R29 (review final): 6x2 também morre em 15/12/2026 — ciclo de 8 dias não
// garante 2 repousos por semana CIVIL (ver a nota na entrada dela).
export const CATALOGO_INICIAL: EscalaCatalogoSeed[] = [
  {
    codigo: "5x2",
    nome: "5x2 — 5 dias de trabalho, 2 de descanso (44h, regime anterior à EC 141)",
    diasTrabalho: 5,
    diasFolga: 2,
    horasDiaPadrao: 8.8, // 8h48
    horasSemanaMedia: 44,
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    exigeAcordoIndividual: false,
    exigeCCT: false,
    observacaoLegal: "Regime anterior à EC 141/2026: 44h/semana, 1 repouso semanal.",
  },
  {
    codigo: "5x2",
    nome: "5x2 — 5 dias de trabalho, 2 de descanso",
    diasTrabalho: 5,
    diasFolga: 2,
    horasDiaPadrao: 8.4, // 8h24
    horasSemanaMedia: 42,
    vigenciaInicio: "2026-12-16",
    vigenciaFim: "2027-12-15",
    exigeAcordoIndividual: false,
    exigeCCT: false,
    observacaoLegal: "Padrão novo pós-EC 141/2026: 42h/semana com 2 repousos semanais.",
  },
  {
    codigo: "5x2",
    nome: "5x2 — 5 dias de trabalho, 2 de descanso (40h, a partir de 16/12/2027)",
    diasTrabalho: 5,
    diasFolga: 2,
    horasDiaPadrao: 8, // 8h
    horasSemanaMedia: 40,
    vigenciaInicio: "2027-12-16",
    vigenciaFim: null,
    exigeAcordoIndividual: false,
    exigeCCT: false,
    observacaoLegal: "Teto cai para 40h/semana a partir de 16/12/2027 (EC 141/2026).",
  },
  {
    codigo: "4x3",
    nome: "4x3 — 4 dias de trabalho, 3 de descanso",
    diasTrabalho: 4,
    diasFolga: 3,
    horasDiaPadrao: 10,
    horasSemanaMedia: 40,
    vigenciaInicio: null,
    vigenciaFim: null,
    exigeAcordoIndividual: true,
    exigeCCT: false,
    observacaoLegal:
      "40h/semana — fica abaixo do teto de 42h/44h, então não depende da data da EC 141/2026. Requer acordo de compensação de jornada (CLT art. 59, §2º/§6º).",
  },
  {
    codigo: "6x1",
    nome: "6x1 — 6 dias de trabalho, 1 de descanso",
    diasTrabalho: 6,
    diasFolga: 1,
    horasDiaPadrao: 7.33, // 7h20
    horasSemanaMedia: 44,
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    exigeAcordoIndividual: false,
    exigeCCT: false,
    observacaoLegal:
      "Encerra em 15/12/2026: a EC 141/2026 torna obrigatório o 2º repouso semanal a partir de 16/12/2026, o que é incompatível com 1 dia de folga por semana.",
  },
  {
    codigo: "12x36",
    nome: "12x36 — jornada alternada de 12h por 36h de descanso",
    diasTrabalho: 1,
    diasFolga: 1,
    horasDiaPadrao: 12,
    horasSemanaMedia: 42,
    vigenciaInicio: null,
    vigenciaFim: "2027-12-15",
    exigeAcordoIndividual: true,
    exigeCCT: false,
    observacaoLegal:
      "Regime especial do art. 59-A da CLT; média de ~42h/semana. A jornada de 12h é EXCEÇÃO EXPRESSA ao teto diário de 10h (ver excecoesLegais). Sobrevive à EC 141/2026, mas encerra em 15/12/2027 sem sucessora cadastrada: ainda não há definição de como adaptar um turno de 12h ao teto de 40h/semana. Não inserir sucessora sem validação jurídica.",
    // R29: sem este marcador, o motor do Plano 3 rejeitaria a 12x36 por
    // violar a DURA `jornada_max_diaria: 10` — ou alguém afrouxaria a DURA
    // para todo mundo. A exceção é pontual, nominal e fundamentada.
    excecoesLegais: [{ chaveRegra: "jornada_max_diaria", fundamento: "CLT art. 59-A" }],
  },
  // 🔴 R29 (I6 da review final) — 6x2 SAI DO CATÁLOGO a partir de
  // 16/12/2026, e por isso aqui há UMA entrada só (as duas sucessoras —
  // 42h e 40h — foram removidas).
  //
  // Por quê: o ciclo de 8 dias não coincide com a semana civil, então ele
  // NÃO garante 2 repousos em toda semana civil (exemplo: trabalha dias
  // 1-6, folga 7-8; a semana civil formada pelos dias 1-7 tem UM repouso
  // só). Isso viola frontalmente a DURA `repousos_por_semana: 2` que este
  // mesmo arquivo cadastra a partir de 16/12/2026 — o catálogo estava
  // contradizendo as próprias regras, e um regime ilegal oferecido pela
  // tela é pior do que um regime legítimo a menos.
  //
  // Recuperável por UPDATE: se o trabalhista entender que a CCT da praça
  // pode apurar os repousos pela média do ciclo, basta inserir a sucessora
  // (com `exigeCCT: true`) — o módulo inteiro é parametrizado justamente
  // para isso. Enquanto não houver essa validação, não é oferecido.
  {
    codigo: "6x2",
    nome: "6x2 — 6 dias de trabalho, 2 de descanso (ciclo de 8 dias, até 15/12/2026)",
    diasTrabalho: 6,
    diasFolga: 2,
    horasDiaPadrao: 7.33, // 7h20
    // I6: dizia 44h, que é o total por CICLO de 8 dias, não por semana.
    // 6 × 7,33h = 44h a cada 8 dias ⇒ 44 ÷ 8 × 7 = 38,5h/semana. Esse
    // número alimenta o "quadro mínimo" do motor (pessoas-hora ÷ jornada
    // média): superestimá-lo em 14% encolhe o quadro na mesma proporção.
    horasSemanaMedia: 38.5,
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    exigeAcordoIndividual: false,
    exigeCCT: true,
    observacaoLegal:
      "Regime anterior à EC 141/2026. Ciclo de 8 dias (não coincide com a semana civil), por isso recomenda-se amparo de CCT. ENCERRA em 15/12/2026: a partir de 16/12/2026 a EC 141/2026 exige 2 repousos por SEMANA CIVIL, e um ciclo de 8 dias não garante isso em toda semana. Sucessora só com validação jurídica (CCT que autorize apuração por ciclo).",
  },
];

// ─── regras_escala — spec seção 2.3 ───────────────────────────────────────────
// Escopo rede (storeId/uf/cct nulos) — regras de loja/praça específicas entram
// depois, cadastradas pelo gestor ou pela CCT local.
//
// jornada_max_semanal e repousos_por_semana têm o regime anterior à EC
// 141/2026 (44h · 1 repouso, vigente até 15/12/2026) ALÉM dos regimes
// futuros — sem isso o resolvedor não acharia regra aplicável para hoje
// (19/11/2026). Ver nota de topo do arquivo.
//
// `fonte` CITA O ARTIGO, sempre (Menor da review final): é a citação que
// defende a escala numa reclamatória trabalhista — "EC 141/2026" sozinho não
// diz a ninguém o que foi alterado. ⚠️ Os números de artigo da EC 141/2026
// registrados aqui seguem a leitura da spec e PRECISAM ser conferidos com o
// trabalhista antes de o módulo ir a produção (a própria spec marca o
// catálogo como "a validar com o trabalhista"). Corrigir aqui é um UPDATE de
// parâmetro, nunca mudança de código.
//
// domingos_folga_mulher_mes e domingos_folga_homem_mes entram OBRIGATORIAMENTE
// como DEPENDE_CCT (ruling do controlador, 2026-11-19): o art. 386 da CLT está
// em disputa entre TST (indisponível) e STF (negociável), e a AMFoods opera em
// RS/SC/PR/SP/MG/RJ com CCTs diferentes. Nunca marcar como DURA.
export const REGRAS_LEGAIS_INICIAIS: RegraSeed[] = [
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "jornada_max_semanal",
    valor: 44,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    fonte: "CF art. 7º, XIII",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "jornada_max_semanal",
    valor: 42,
    tipo: "DURA",
    vigenciaInicio: "2026-12-16",
    vigenciaFim: "2027-12-15",
    fonte: "EC 141/2026, art. 1º (nova redação do art. 7º, XIII, da CF/88) c/c art. 3º (transição: 42h de 16/12/2026 a 15/12/2027)",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "jornada_max_semanal",
    valor: 40,
    tipo: "DURA",
    vigenciaInicio: "2027-12-16",
    vigenciaFim: null,
    fonte: "EC 141/2026, art. 1º (nova redação do art. 7º, XIII, da CF/88) — teto definitivo de 40h a partir de 16/12/2027",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "repousos_por_semana",
    valor: 1,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    fonte: "CF art. 7º, XV; Lei 605/1949; CLT art. 67",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "repousos_por_semana",
    valor: 2,
    tipo: "DURA",
    vigenciaInicio: "2026-12-16",
    vigenciaFim: null,
    fonte: "EC 141/2026, art. 1º (nova redação do art. 7º, XV, da CF/88) — dois repousos semanais remunerados",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "interjornada_min_horas",
    valor: 11,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "CLT art. 66",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "intervalo_intrajornada",
    valor: { minutos: 60, condicaoJornadaAcimaHoras: 6, minutosReduzidoComCct: 30 },
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "CLT art. 71",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "jornada_max_diaria",
    valor: 10,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "CLT art. 59, caput e §2º, c/c EC 141/2026 (ACT/CCT pode ampliar a jornada diária para acomodar as 42h, desde que preservados os dois repousos)",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "domingos_folga_mulher_mes",
    valor: 2,
    tipo: "DEPENDE_CCT",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "CLT art. 386 — divergência TST (indisponível) x STF (negociável); prevalece a CCT da praça",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "domingos_folga_homem_mes",
    valor: 1,
    tipo: "DEPENDE_CCT",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "Prática de mercado / CCT da praça — não há piso legal federal específico",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "adicional_noturno_inicio",
    valor: 22,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "CLT art. 73",
  },
  // 🔴 Menor (review final): `max_dias_consecutivos: 6` é o parâmetro que
  // CODIFICA a 6x1. Sem data de fim, ele autorizava 6 dias corridos de
  // trabalho depois de 16/12/2026 — exatamente o que a EC 141/2026 acaba —
  // e o motor teria uma trava dizendo "pode" enquanto outra dizia "dois
  // repousos por semana". Fechado em 15/12/2026, com sucessora.
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "max_dias_consecutivos",
    valor: 6,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: "2026-12-15",
    fonte: "CLT art. 67 c/c Lei 605/1949 (repouso semanal remunerado) — regime anterior à EC 141/2026",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "max_dias_consecutivos",
    // 5, e não 6, porque é a consequência direta de `repousos_por_semana:
    // 2` dentro da SEMANA CIVIL: 7 dias − 2 repousos = no máximo 5 dias de
    // trabalho. Encadeamentos entre semanas (folgas no início de uma e no
    // fim da seguinte) só são defensáveis com amparo de CCT — e, se a
    // praça tiver esse amparo, a regra entra como cadastro de UF/CCT com
    // vigência própria, não afrouxando o piso de rede para todo mundo.
    valor: 5,
    tipo: "DURA",
    vigenciaInicio: "2026-12-16",
    vigenciaFim: null,
    fonte: "EC 141/2026, art. 1º (nova redação do art. 7º, XV, da CF/88) — dois repousos na semana civil ⇒ no máximo 5 dias consecutivos de trabalho",
  },
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "folga_preferencial",
    valor: { escopo: "por_pessoa", default: null },
    tipo: "MOLE",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "política interna",
  },
];

// ─── mappers: EscalaCatalogoSeed/RegraSeed → tipo de inserção do Drizzle ──────
// Drizzle mapeia colunas `numeric` para `string` no tipo de inserção
// ($inferInsert) — inserir os literais de `CATALOGO_INICIAL` direto não
// compila contra `InsertEscalaCatalogo`. Os literais continuam `number`
// porque é o que os testes do brief e a leitura humana da spec exigem;
// quem grava no banco usa este mapper, nunca o literal cru.
export function toInsertCatalogo(seed: EscalaCatalogoSeed): InsertEscalaCatalogo {
  return {
    excecoesLegais: seed.excecoesLegais ?? null,
    codigo: seed.codigo,
    nome: seed.nome,
    diasTrabalho: seed.diasTrabalho,
    diasFolga: seed.diasFolga,
    horasDiaPadrao: String(seed.horasDiaPadrao),
    horasSemanaMedia: String(seed.horasSemanaMedia),
    vigenciaInicio: seed.vigenciaInicio,
    vigenciaFim: seed.vigenciaFim,
    exigeAcordoIndividual: seed.exigeAcordoIndividual,
    exigeCCT: seed.exigeCCT,
    observacaoLegal: seed.observacaoLegal,
  };
}

/**
 * 🔴 I5 (review final): a UF é NORMALIZADA na escrita (maiúsculas, sem
 * espaços). O outro lado — a query de candidatas (`getRegras`, via
 * `condicaoRegrasCandidatas`) — compara com `upper(trim(...))`. Os dois
 * lados precisam concordar: uma regra gravada "sp" que não casa com a loja
 * "SP" não dá erro nenhum, só devolve MENOS regra estadual — e, como a
 * loja tem UF, nem o `avisoUfAusente` aparece. Falha silenciosa é
 * exatamente o que este módulo existe para não produzir.
 */
export function toInsertRegra(seed: RegraSeed): InsertRegraEscala {
  return {
    storeId: seed.storeId,
    uf: normalizarUf(seed.uf),
    cct: seed.cct,
    chave: seed.chave,
    valor: seed.valor,
    tipo: seed.tipo,
    vigenciaInicio: seed.vigenciaInicio,
    vigenciaFim: seed.vigenciaFim,
    fonte: seed.fonte,
  };
}
