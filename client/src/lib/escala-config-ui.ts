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
  if (entrada.produtividadeAlvo != null && entrada.produtividadeAlvo <= 0) {
    erros.push("A produtividade alvo deve ser maior que zero.");
  }

  if (!Number.isInteger(entrada.minPorBloco) || entrada.minPorBloco < 1) {
    erros.push("O mínimo de pessoas por bloco deve ser um número inteiro de, no mínimo, 1.");
  }

  // I7: min=5/max=2 era aceito antes e virava restrição insatisfazível em
  // silêncio (nenhum número de pessoas por bloco atende as duas travas ao
  // mesmo tempo).
  if (entrada.maxPorBloco != null && entrada.maxPorBloco < entrada.minPorBloco) {
    erros.push("O máximo de pessoas por bloco não pode ser menor que o mínimo.");
  }

  return erros;
}

/**
 * Texto que o gerente lê para cada origem da produtividade sugerida/salva.
 * `null` significa que ainda não há origem (campo em branco, sem sugestão
 * disponível e sem valor definido ainda) — devolve string vazia para que
 * quem renderiza decida o que fazer (ex.: mostrar a mensagem de
 * indisponibilidade em vez de um rótulo).
 */
export function rotuloOrigemProdutividade(origem: ProdutividadeOrigem | null): string {
  switch (origem) {
    case "sugerida_historico":
      return "histórico da loja";
    case "sugerida_benchmark":
      return "melhor loja da rede";
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
