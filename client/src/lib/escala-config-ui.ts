/**
 * escala-config-ui.ts — lógica pura da tela "Configuração da Escala" (Task 5)
 *
 * Funções puras, sem React e sem I/O, usadas por
 * `client/src/components/escala/ConfiguracaoFuncoes.tsx`. Existem para que
 * a lógica da tela seja testável em `environment: "node"` sem precisar de
 * jsdom/@testing-library/react — ver ruling R19 do controlador em
 * `.superpowers/sdd/2026-11-19-escala-configuracao/task-5-brief.md`.
 *
 * `validarFuncao` é VALIDAÇÃO DE TELA, não de segurança: ela espelha —
 * sem relaxar nada — as mesmas regras que `server/routers/escala.ts`
 * (procedure `salvarFuncao`) já impõe. O servidor continua sendo a
 * tranca; isto aqui só evita a viagem de rede pra um erro que a tela já
 * sabia que ia acontecer.
 */

export type DriverFuncao = "tickets" | "pratos" | "cobertos";

export type ProdutividadeOrigem = "sugerida_historico" | "sugerida_benchmark" | "definida_gestor";

const DRIVERS_VALIDOS: readonly DriverFuncao[] = ["tickets", "pratos", "cobertos"];

export interface EntradaValidarFuncao {
  nome: string;
  driver: DriverFuncao;
  /** `null`/`undefined`: ainda sem sugestão nem valor definido pelo gestor. */
  produtividadeAlvo?: number | null;
  /**
   * `minPorBloco` é sempre >= 1 — mesma razão do servidor (R13 do brief da
   * Task 4): 0 "funções" num bloco não é configuração, é a função não
   * existir no bloco (não cadastrar).
   */
  minPorBloco: number;
  maxPorBloco?: number | null;
}

/**
 * Devolve a lista de erros legíveis em português — vazia quando a entrada
 * está válida. Acumula TODOS os erros encontrados (não para no primeiro),
 * para que a tela possa mostrar tudo de uma vez.
 */
export function validarFuncao(entrada: EntradaValidarFuncao): string[] {
  const erros: string[] = [];

  if (entrada.nome.trim().length === 0) {
    erros.push("Informe o nome da função.");
  } else if (entrada.nome.length > 64) {
    erros.push("O nome da função pode ter no máximo 64 caracteres.");
  }

  if (!DRIVERS_VALIDOS.includes(entrada.driver)) {
    erros.push('O indicador de demanda deve ser "tickets", "pratos" ou "cobertos".');
  }

  // I7 do fix loop da Task 4: 0 passava antes (`.min(0)`), e o
  // dimensionamento faz `demanda ÷ produtividade` — 0 vira `Infinity`.
  // M4 (pós-revisão): `NaN <= 0` é sempre `false` — `NaN` passava direto
  // sem cair em nenhuma das duas checagens. `!Number.isFinite` captura
  // `NaN` e `Infinity` dos dois lados, mesmo padrão de defesa que
  // `!Number.isInteger` já usa para `minPorBloco` abaixo.
  if (entrada.produtividadeAlvo != null && (!Number.isFinite(entrada.produtividadeAlvo) || entrada.produtividadeAlvo <= 0)) {
    erros.push("A produtividade alvo deve ser maior que zero.");
  }

  if (!Number.isInteger(entrada.minPorBloco) || entrada.minPorBloco < 1) {
    erros.push("O mínimo de pessoas por bloco deve ser um número inteiro de, no mínimo, 1.");
  }

  // I7: min=5/max=2 era aceito antes e virava restrição insatisfazível em
  // silêncio (nenhum número de pessoas por bloco atende as duas travas ao
  // mesmo tempo).
  // I2 (pós-revisão): o servidor exige `z.number().int()` em `maxPorBloco`
  // — a tela só checava `< minPorBloco`, então `maxPorBloco = 2.5` com
  // `minPorBloco = 1` passava na tela e quebrava no servidor (o gerente
  // preenche, clica, e toma um erro que a tela devia ter pego antes).
  if (entrada.maxPorBloco != null) {
    if (!Number.isInteger(entrada.maxPorBloco)) {
      erros.push("O máximo de pessoas por bloco deve ser um número inteiro.");
    } else if (entrada.maxPorBloco < entrada.minPorBloco) {
      erros.push("O máximo de pessoas por bloco não pode ser menor que o mínimo.");
    }
  }

  return erros;
}

/**
 * Drivers para os quais a contagem de `atendimentos` (hoje a ÚNICA fonte
 * de volume que o histórico tem — ver `server/db-escala-config.ts`) É a
 * própria unidade de demanda, não uma aproximação. `tickets` está nesta
 * lista; `pratos`/`cobertos` não — um atendimento pode render várias
 * mesas ou pessoas (R22: "na Casa do Pão de Queijo 1 ticket ≈ 1
 * atendimento; no Pecorino um ticket pode ter 5 ou 10 pessoas na mesa").
 * A contagem segregada por driver é o trabalho do próximo plano
 * (`demanda_bloco`) — aqui só precisamos SABER quando o número que
 * estamos mostrando não é a medida certa, e dizer isso.
 */
const DRIVERS_COM_CONTAGEM_ESPECIFICA: readonly DriverFuncao[] = ["tickets"];

/**
 * R22 (pós-revisão): mesma família de defeito que apareceu outras vezes
 * no plano — o sistema dar uma resposta plausível e errada, sem
 * sinalizar. Uma sugestão para "Garçom" (driver `cobertos`) aparecia
 * rotulada só como "histórico da loja", e o gerente confiaria — mas o
 * número vem de `atendimentos` genéricos, que para o salão não mede
 * quase nada. Esta ressalva não muda o CÁLCULO nem o CONTRATO (ambos
 * corretos, R20) — é só a tela deixar de implicar uma precisão que a
 * sugestão não tem, para qualquer driver fora da lista acima.
 */
const RESSALVA_BASE_GENERICA =
  " — baseado no total de atendimentos da loja, ainda sem contagem específica para esta função; confira se faz sentido antes de usar";

/**
 * Texto que o gerente lê para cada origem da produtividade sugerida/salva.
 * `null` significa que ainda não há origem (campo em branco, sem sugestão
 * disponível e sem valor definido ainda) — devolve string vazia para que
 * quem renderiza decida o que fazer (ex.: mostrar a mensagem de
 * indisponibilidade em vez de um rótulo).
 *
 * `driver` é usado só para decidir se a ressalva de base genérica (R22)
 * entra ou não — uma sugestão (`sugerida_*`) para um driver fora de
 * `DRIVERS_COM_CONTAGEM_ESPECIFICA` leva a ressalva; um valor que o
 * próprio gestor digitou (`definida_gestor`) nunca leva, porque ele já
 * sabe a base do número que escreveu.
 */
export function rotuloOrigemProdutividade(origem: ProdutividadeOrigem | null, driver: DriverFuncao): string {
  const ressalva = DRIVERS_COM_CONTAGEM_ESPECIFICA.includes(driver) ? "" : RESSALVA_BASE_GENERICA;
  switch (origem) {
    case "sugerida_historico":
      return `histórico da loja${ressalva}`;
    case "sugerida_benchmark":
      return `melhor loja da rede${ressalva}`;
    case "definida_gestor":
      return "definida por você";
    case null:
      return "";
  }
}

/**
 * Quando `escala.sugerirProdutividade` devolve `valor: null`, a tela NUNCA
 * pode deixar o campo em branco sem explicação (requisito de produto: a
 * produtividade nunca aparece como campo vazio sem motivo). Esta função
 * monta a frase que explica o motivo recebido do servidor e pede o número
 * ao gestor.
 */
export function mensagemProdutividadeIndisponivel(motivo: string | undefined): string {
  const base = motivo && motivo.trim().length > 0 ? motivo : "Ainda não há sugestão de produtividade para esta função.";
  return `${base} Informe quantos atendimentos por hora uma pessoa entrega nesta função.`;
}

export interface ParametrosAvisoProdutividadeIndisponivel {
  /** `sugestaoQuery.isLoading` — enquanto carrega, não há veredito ainda. */
  carregandoSugestao: boolean;
  /** `sugestaoQuery.data?.valor` — `null`/`undefined` quando o servidor não tem base suficiente. */
  valorSugerido: number | null | undefined;
  /** O gestor já digitou um valor manualmente nesta sessão de edição. */
  produtividadeTocada: boolean;
  /** Valor atual do campo (string do input) — pode já ter um valor salvo antes, mesmo sem ter sido "tocado" agora. */
  produtividadeAtual: string;
}

/**
 * I1 (pós-revisão): decide se o aviso âmbar "sugestão indisponível, informe
 * o número" deve aparecer. Antes, esse cálculo olhava só para
 * `sugestaoQuery.data` — então numa loja nova, sem histórico, o aviso
 * aparecia AO MESMO TEMPO que "Origem: definida por você" (quando o
 * campo já tinha um valor, tocado ou pré-existente), contradizendo a tela
 * na cara do gerente: "já está definido" e "ainda falta definir"
 * simultaneamente. O aviso só faz sentido quando NÃO há sugestão E o
 * campo está genuinamente vazio — se já existe um valor (o gestor digitou
 * agora, ou a função já tinha um valor salvo antes), não há nada
 * "indisponível" para avisar.
 */
export function deveExibirAvisoProdutividadeIndisponivel(
  params: ParametrosAvisoProdutividadeIndisponivel,
): boolean {
  if (params.carregandoSugestao) return false;
  if (params.produtividadeTocada) return false;
  if (params.produtividadeAtual !== "") return false;
  return (params.valorSugerido ?? null) == null;
}
