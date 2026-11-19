/**
 * escala-assistente.ts — lógica pura do "Assistente de configuração" (Task 6)
 *
 * Funções puras, sem React e sem I/O, usadas por
 * `client/src/components/escala/AssistenteConfiguracao.tsx`. Mesma razão de
 * `escala-config-ui.ts` (Task 5) — testável em `environment: "node"`, sem
 * jsdom/@testing-library/react — ver ruling R19 do controlador em
 * `.superpowers/sdd/2026-11-19-escala-configuracao/task-6-brief.md`.
 *
 * O assistente amarra 4 passos que o gerente preenche sozinho, pelo app,
 * sem depender de admin: horário de funcionamento, blocos de turno,
 * funções da loja e regras legais vigentes. Este módulo decide, para cada
 * passo, se está completo ou não — e por quê (a razão é o que o gerente lê
 * na tela) — e se o conjunto todo já libera o botão "Gerar escala".
 *
 * Aprendizado acumulado do plano (24 achados em 6 rounds): o defeito mais
 * comum é o sistema dar uma resposta plausível e ERRADA sem avisar — passo
 * marcado como completo quando não está, aviso de UF engolido, regra
 * DEPENDE_CCT tratada como confirmada sem o gerente ter confirmado. Por
 * isso toda função aqui prefere FALHAR ALTO (passo incompleto, razão
 * visível) a assumir em silêncio que "deve estar tudo bem".
 */

// ─── Tipos compartilhados com o servidor (duplicados por design — ver nota) ───
//
// Os tipos abaixo espelham formas que já existem no servidor
// (`server/escala-catalogo-seed.ts`, `server/escala-regras.ts`,
// `server/routers/escala.ts`, `server/routers/pessoas.ts`), mas este arquivo
// NÃO importa de `server/*`: é lib de cliente, não deve puxar código de
// servidor (drizzle/pg) para o bundle do navegador, e os testes rodam em
// `environment: "node"` isolados de qualquer I/O. A duplicação é só de
// FORMA (nomes de campo), nunca de REGRA — nenhum valor legal, nenhuma data
// de vigência, nenhuma lista de drivers é reinventada aqui.

export type TipoRegra = "DURA" | "MOLE" | "DEPENDE_CCT";
export type EscopoRegra = "loja" | "uf" | "rede";

/** Forma mínima de uma regra já resolvida (`escala.getRegrasVigentes`). */
export interface RegraResolvidaLike {
  chave: string;
  valor: unknown;
  tipo: TipoRegra;
  fonte: string;
  escopo: EscopoRegra;
}

/** Forma mínima de uma entrada do catálogo legal (`escala.getCatalogo`). */
export interface EscalaCatalogoItem {
  codigo: string;
  nome: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  /** `string | null` porque a coluna é nullable no banco (`server/drizzle/schema.ts`)
   * — o seed sempre preenche (ver `server/escala-catalogo-seed.ts`), mas o
   * tipo não pode fingir uma garantia que o schema não dá. */
  observacaoLegal: string | null;
}

export interface EscalaDisponibilidade {
  codigo: string;
  nome: string;
  disponivel: boolean;
  /** Sempre preenchida — mesmo quando disponível, para nunca deixar a UI
   * sem explicação (requisito de produto já aplicado nas Tasks anteriores). */
  razao: string;
}

// ─── Validação de data ISO ────────────────────────────────────────────────────

const FORMATO_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lançado quando uma data recebida não está no formato ISO "AAAA-MM-DD".
 * Mesma razão de `server/escala-regras.ts`: comparação de data como string
 * só é correta sob essa forma exata — "20/01/2028" compararia "por acaso" e
 * poderia devolver disponibilidade errada sem avisar (Task 2: o defeito que
 * este plano nasceu para não repetir).
 */
export class FormatoDataInvalidoError extends Error {
  constructor(campo: string, valor: string) {
    super(
      `${campo} inválida: "${valor}" — esperado formato ISO "AAAA-MM-DD" (exatamente 10 caracteres, ex.: "2026-11-19").`
    );
    this.name = "FormatoDataInvalidoError";
  }
}

function validarDataIso(valor: string, campo: string): void {
  if (typeof valor !== "string" || !FORMATO_DATA_ISO.test(valor)) {
    throw new FormatoDataInvalidoError(campo, valor);
  }
}

// ─── Passo 4: regras pendentes de confirmação ─────────────────────────────────

/**
 * As regras `DEPENDE_CCT` existem porque dependem da convenção coletiva de
 * cada praça (ex.: quantos domingos de folga por mês) — o gerente CONFIRMA
 * que o valor do catálogo de rede vale para a loja dele; ele não edita o
 * valor legal. "Confirmar" é salvar uma regra de escopo LOJA com a mesma
 * chave (via `escala.salvarRegraLoja`) — a partir daí `resolverRegras`
 * (Task 2: loja > uf > rede) passa a devolver essa regra com `escopo:
 * "loja"` para esta loja, e ela sai da lista de pendentes.
 *
 * Uma regra DEPENDE_CCT ainda resolvida com escopo "uf" ou "rede" é, por
 * definição, ainda NÃO confirmada por este gerente — mesmo que o VALOR
 * mostrado na tela seja idêntico ao que ele confirmaria. Tratar "mesmo
 * valor" como "já confirmado" seria o mesmo defeito que este plano existe
 * para evitar: uma regra apresentada como resolvida quando, na verdade,
 * ninguém desta loja decidiu nada ainda.
 */
export function regrasPendentesDeConfirmacao(
  regras: readonly RegraResolvidaLike[]
): RegraResolvidaLike[] {
  return regras.filter((regra) => regra.tipo === "DEPENDE_CCT" && regra.escopo !== "loja");
}

// ─── Passo 1-4: avaliação de completude ───────────────────────────────────────

export type Passo = "horario" | "blocos" | "funcoes" | "regras";

export interface AvaliacaoPasso {
  passo: Passo;
  titulo: string;
  completo: boolean;
  /** Sempre preenchida — por que está completo, ou por que ainda não está. */
  razao: string;
  /**
   * Aviso adicional que precisa aparecer na tela INDEPENDENTE do passo
   * estar completo ou não (ex.: loja sem UF cadastrada no passo de
   * regras). `null` quando não há nada a avisar.
   */
  avisoExtra: string | null;
}

/** Estado de uma consulta tRPC — mesma forma de `useQuery` (`isLoading` +
 * `data`), para que o componente possa passar o resultado da query quase
 * direto, sem adaptação. */
export interface QueryEstado<T> {
  isLoading: boolean;
  data: T | undefined;
}

export interface HorarioFuncionamento {
  operationStartHour: number;
  operationEndHour: number;
}

export interface BlocoTurno {
  id: number;
}

export interface FuncaoLoja {
  id: number;
}

export interface RegrasVigentesResposta {
  regras: readonly RegraResolvidaLike[];
  avisoUfAusente: boolean;
  aviso: string | null;
}

export interface EstadoAssistente {
  horario: QueryEstado<HorarioFuncionamento>;
  blocos: QueryEstado<readonly BlocoTurno[]>;
  funcoes: QueryEstado<readonly FuncaoLoja[]>;
  regras: QueryEstado<RegrasVigentesResposta>;
}

function avaliarHorario(estado: QueryEstado<HorarioFuncionamento>): AvaliacaoPasso {
  const titulo = "Horário de funcionamento";
  if (estado.isLoading) {
    return { passo: "horario", titulo, completo: false, razao: "Carregando o horário de funcionamento da loja...", avisoExtra: null };
  }
  if (!estado.data) {
    return {
      passo: "horario",
      titulo,
      completo: false,
      razao: "Não foi possível carregar o horário de funcionamento da loja.",
      avisoExtra: null,
    };
  }
  const { operationStartHour, operationEndHour } = estado.data;
  const valoresValidos =
    Number.isFinite(operationStartHour) &&
    Number.isFinite(operationEndHour) &&
    operationStartHour >= 0 &&
    operationEndHour > operationStartHour;
  if (!valoresValidos) {
    return {
      passo: "horario",
      titulo,
      completo: false,
      razao: `O horário de funcionamento cadastrado é inválido (abertura ${operationStartHour}h, fechamento ${operationEndHour}h) — o fechamento precisa ser depois da abertura.`,
      avisoExtra: null,
    };
  }
  return {
    passo: "horario",
    titulo,
    completo: true,
    razao: `A loja funciona das ${operationStartHour}h às ${operationEndHour}h.`,
    avisoExtra: null,
  };
}

function avaliarBlocos(estado: QueryEstado<readonly BlocoTurno[]>): AvaliacaoPasso {
  const titulo = "Blocos de turno";
  if (estado.isLoading) {
    return { passo: "blocos", titulo, completo: false, razao: "Carregando os blocos de turno da loja...", avisoExtra: null };
  }
  if (!estado.data) {
    return { passo: "blocos", titulo, completo: false, razao: "Não foi possível carregar os blocos de turno da loja.", avisoExtra: null };
  }
  if (estado.data.length === 0) {
    return {
      passo: "blocos",
      titulo,
      completo: false,
      razao: "Nenhum bloco de turno cadastrado ainda. Cadastre ao menos um (ex: Abertura, Almoço, Fechamento).",
      avisoExtra: null,
    };
  }
  return {
    passo: "blocos",
    titulo,
    completo: true,
    razao: `${estado.data.length} bloco(s) de turno cadastrado(s).`,
    avisoExtra: null,
  };
}

function avaliarFuncoes(estado: QueryEstado<readonly FuncaoLoja[]>): AvaliacaoPasso {
  const titulo = "Funções";
  if (estado.isLoading) {
    return { passo: "funcoes", titulo, completo: false, razao: "Carregando as funções da loja...", avisoExtra: null };
  }
  if (!estado.data) {
    return { passo: "funcoes", titulo, completo: false, razao: "Não foi possível carregar as funções da loja.", avisoExtra: null };
  }
  if (estado.data.length === 0) {
    return {
      passo: "funcoes",
      titulo,
      completo: false,
      razao: "Nenhuma função cadastrada ainda. Cadastre ao menos uma (ex: Atendente, Cozinheiro).",
      avisoExtra: null,
    };
  }
  return {
    passo: "funcoes",
    titulo,
    completo: true,
    razao: `${estado.data.length} função(ões) cadastrada(s).`,
    avisoExtra: null,
  };
}

function avisoUfParaExibir(resposta: RegrasVigentesResposta): string | null {
  if (!resposta.avisoUfAusente) return null;
  return (
    resposta.aviso ??
    "Esta loja não tem estado (UF) cadastrado; regras estaduais não estão sendo aplicadas — somente as regras de rede."
  );
}

function avaliarRegras(estado: QueryEstado<RegrasVigentesResposta>): AvaliacaoPasso {
  const titulo = "Regras";
  if (estado.isLoading) {
    return { passo: "regras", titulo, completo: false, razao: "Carregando as regras legais vigentes...", avisoExtra: null };
  }
  if (!estado.data) {
    return { passo: "regras", titulo, completo: false, razao: "Não foi possível carregar as regras legais vigentes.", avisoExtra: null };
  }
  // 🔴 R13 (mesma regra do servidor): o aviso de UF ausente NUNCA pode ser
  // engolido — precisa aparecer na tela independente do passo estar
  // completo ou não.
  const avisoExtra = avisoUfParaExibir(estado.data);
  const pendentes = regrasPendentesDeConfirmacao(estado.data.regras);
  if (pendentes.length > 0) {
    const chaves = pendentes.map((p) => p.chave).join(", ");
    return {
      passo: "regras",
      titulo,
      completo: false,
      razao: `${pendentes.length} regra(s) dependem da convenção coletiva (CCT) da sua praça e ainda não foram confirmadas para esta loja: ${chaves}.`,
      avisoExtra,
    };
  }
  return {
    passo: "regras",
    titulo,
    completo: true,
    razao: "Todas as regras legais vigentes foram revisadas, e as que dependem de CCT foram confirmadas para esta loja.",
    avisoExtra,
  };
}

/**
 * Avalia os 4 passos do assistente, nesta ordem fixa: horário de
 * funcionamento, blocos de turno, funções, regras. Cada passo vem com
 * `completo` e `razao` — a razão é obrigatória nos dois estados (completo
 * ou não), nunca só no caminho de erro, porque o gerente precisa poder
 * confirmar "está certo porque X", não só "está errado porque Y".
 */
export function avaliarPassos(estado: EstadoAssistente): AvaliacaoPasso[] {
  return [
    avaliarHorario(estado.horario),
    avaliarBlocos(estado.blocos),
    avaliarFuncoes(estado.funcoes),
    avaliarRegras(estado.regras),
  ];
}

/**
 * Só libera "Gerar escala" quando os 4 passos estão completos. Lista vazia
 * NUNCA libera — isso significaria que `avaliarPassos` não rodou, não que
 * "não há nada pendente".
 */
export function podeGerarEscala(passos: readonly AvaliacaoPasso[]): boolean {
  return passos.length > 0 && passos.every((p) => p.completo);
}

// ─── Catálogo de regimes de escala disponíveis ────────────────────────────────

/**
 * Filtra `catalogo` pela vigência em `data`, devolvendo para CADA entrada
 * (disponível ou não) se ela vale nesta data e por quê. Pura: não hardcoda
 * nenhum regime específico (não sabe o que é "6x1") — só aplica a mesma
 * regra de vigência da Task 2 (`vigeEmData` em `server/escala-regras.ts`):
 * `vigenciaInicio`/`vigenciaFim` nulos = sem limite daquele lado, ambos os
 * extremos inclusivos. A razão, quando indisponível, é a própria
 * `observacaoLegal` do catálogo — que já cita a norma (ex.: para "6x1",
 * cita a EC 141/2026) porque a explicação do PORQUÊ pertence ao dado legal
 * (parâmetro), não a este código (nunca duplicar conhecimento legal fora
 * do catálogo — mesma razão de `escala-catalogo-seed.ts`).
 */
export function escalasDisponiveis(
  catalogo: readonly EscalaCatalogoItem[],
  data: string
): EscalaDisponibilidade[] {
  validarDataIso(data, "data");
  for (const item of catalogo) {
    if (item.vigenciaInicio !== null) {
      validarDataIso(item.vigenciaInicio, `vigenciaInicio de "${item.codigo}"`);
    }
    if (item.vigenciaFim !== null) {
      validarDataIso(item.vigenciaFim, `vigenciaFim de "${item.codigo}"`);
    }
  }

  return catalogo.map((item) => {
    const antesDoInicio = item.vigenciaInicio !== null && data < item.vigenciaInicio;
    const depoisDoFim = item.vigenciaFim !== null && data > item.vigenciaFim;
    const disponivel = !antesDoInicio && !depoisDoFim;
    return {
      codigo: item.codigo,
      nome: item.nome,
      disponivel,
      razao: disponivel
        ? "Vigente nesta data."
        : item.observacaoLegal ?? `Fora de vigência nesta data (regime "${item.codigo}").`,
    };
  });
}
