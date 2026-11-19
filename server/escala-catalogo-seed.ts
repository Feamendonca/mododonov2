/**
 * escala-catalogo-seed.ts — Catálogo legal de escalas + regras legais iniciais
 *
 * Dados puros (sem lógica, sem acesso a banco). Alimenta as tabelas
 * `escalas_catalogo` e `regras_escala` (drizzle/schema.ts) na primeira
 * carga do módulo de Escala.
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
 * Ver docs/superpowers/specs/2026-11-19-gestor-de-escala-design.md,
 * seções "1. O marco legal" e "2. As três tabelas de parâmetro".
 */

export type DriverFuncao = "tickets" | "pratos" | "cobertos";
export type TipoRegra = "DURA" | "MOLE" | "DEPENDE_CCT";

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
// Catálogo inicial (a validar com o trabalhista). Note que 5x2, 6x2 e 4x3
// só entram com os valores pós-EC 141 — ver decisão de seed em
// task-1-report.md ("jornada pré-16/12/2026 não é seedada por este módulo").
export const CATALOGO_INICIAL: EscalaCatalogoSeed[] = [
  {
    codigo: "5x2",
    nome: "5x2 — 5 dias de trabalho, 2 de descanso",
    diasTrabalho: 5,
    diasFolga: 2,
    horasDiaPadrao: 8.4, // 8h24
    horasSemanaMedia: 42,
    vigenciaInicio: "2026-12-16",
    vigenciaFim: null,
    exigeAcordoIndividual: false,
    exigeCCT: false,
    observacaoLegal: "Padrão novo pós-EC 141/2026: 42h/semana com 2 repousos semanais.",
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
    vigenciaFim: null,
    exigeAcordoIndividual: true,
    exigeCCT: false,
    observacaoLegal:
      "Regime especial do art. 59-A da CLT; média de ~42h/semana. Sobrevive à EC 141/2026, mas tende a precisar de adaptação em 16/12/2027, quando o teto cai para 40h.",
  },
  {
    codigo: "6x2",
    nome: "6x2 — 6 dias de trabalho, 2 de descanso (ciclo de 8 dias)",
    diasTrabalho: 6,
    diasFolga: 2,
    horasDiaPadrao: 7,
    horasSemanaMedia: 42,
    vigenciaInicio: "2026-12-16",
    vigenciaFim: null,
    exigeAcordoIndividual: false,
    exigeCCT: true,
    observacaoLegal:
      "Ciclo de 8 dias (não coincide com a semana civil); 42h/semana em média. Por isso recomenda-se amparo de CCT.",
  },
];

// ─── regras_escala — spec seção 2.3 ───────────────────────────────────────────
// Escopo rede (storeId/uf/cct nulos) — regras de loja/praça específicas entram
// depois, cadastradas pelo gestor ou pela CCT local.
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
    valor: 42,
    tipo: "DURA",
    vigenciaInicio: "2026-12-16",
    vigenciaFim: "2027-12-15",
    fonte: "EC 141/2026",
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
    fonte: "EC 141/2026",
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
    fonte: "EC 141/2026",
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
  {
    storeId: null,
    uf: null,
    cct: null,
    chave: "max_dias_consecutivos",
    valor: 6,
    tipo: "DURA",
    vigenciaInicio: null,
    vigenciaFim: null,
    fonte: "CLT art. 67 c/c Lei 605/1949 (repouso semanal remunerado)",
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
