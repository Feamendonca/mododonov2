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

  // CC4 (review final): a comparação era contra `nome.length` (não-trimado)
  // enquanto o servidor é `z.string().trim().max(64)` — ou seja, o servidor
  // mede o nome JÁ TRIMADO. Um nome de 65 caracteres terminando em espaço
  // (64 úteis) era ACEITO pelo servidor e REJEITADO pela tela: proibição
  // fantasma, com a tela mais restritiva que a tranca real — o inverso da
  // premissa deste módulo (a tela espelha o servidor, nunca o contrário).
  // Mesmo defeito que o M3 da Task 5 corrigiu na direção oposta.
  const nomeTrimado = entrada.nome.trim();
  if (nomeTrimado.length === 0) {
    erros.push("Informe o nome da função.");
  } else if (nomeTrimado.length > 64) {
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

// ─── 🔴 R32 (CC1 da review final): sugestão nunca sobrescreve em silêncio ────
//
// O defeito: `openEdit` só marcava "não sobrescrever" quando a origem salva
// era `definida_gestor`. Para `sugerida_historico`/`sugerida_benchmark` — o
// caso MAIS COMUM — o formulário nascia "livre", a query de sugestão já
// estava habilitada, e quando a resposta chegava o `useEffect` TROCAVA o
// valor salvo pela sugestão nova, mantendo o mesmo rótulo de origem. O
// gestor abria a função para mudar `minPorBloco`, salvava, e gravava uma
// produtividade que nunca viu.
//
// Isso viola o princípio-âncora do app — "a IA propõe, o humano confirma, a
// IA nunca grava sozinha" — no módulo que deveria ser o exemplo dele. A
// decisão agora é função pura, testada, e o comportamento mudou: quando a
// sugestão DIVERGE do valor salvo, a tela mostra OS DOIS e deixa o gestor
// escolher; nunca substitui por conta própria.

/**
 * Pode a sugestão do servidor preencher o campo automaticamente, sem
 * perguntar? Só quando NÃO existe produtividade salva para esta função —
 * isto é, quando não há nada do gestor para sobrescrever.
 *
 * `origemSalva` é a origem QUE ESTÁ NO BANCO (não a do formulário, que
 * muda enquanto ele digita). Qualquer origem salva — inclusive
 * `sugerida_historico`/`sugerida_benchmark` — significa que aquele número
 * já passou pelo gestor uma vez: ele viu, aceitou e salvou. Substituir sem
 * avisar seria gravar por ele.
 */
export function devePermitirSobrescritaAutomatica(origemSalva: ProdutividadeOrigem | null): boolean {
  return origemSalva === null;
}

/** O que a tela deve fazer com a sugestão que acabou de chegar. */
export type DecisaoSugestao =
  | { acao: "ignorar" }
  | { acao: "aplicar"; valor: number }
  | { acao: "perguntar"; valorSalvo: number; valorSugerido: number };

export interface ParametrosDecisaoSugestao {
  /** Origem da produtividade JÁ SALVA (null = função nova, ou sem produtividade salva). */
  origemSalva: ProdutividadeOrigem | null;
  /** Conteúdo atual do input (string) — "" quando vazio. */
  valorAtualCampo: string;
  /** `sugestaoQuery.data?.valor` — `null`/`undefined` quando o servidor não tem base. */
  valorSugerido: number | null | undefined;
  /** O gestor digitou um valor manualmente NESTA sessão de edição. */
  produtividadeTocada: boolean;
}

/**
 * Decide, sem React e sem I/O, o destino da sugestão:
 *  - `ignorar`   — não há sugestão, o gestor está digitando agora, ou a
 *                  sugestão é igual ao que já está no campo (nada a decidir);
 *  - `aplicar`   — campo vazio ou função sem produtividade salva: preencher
 *                  é propor, não sobrescrever;
 *  - `perguntar` — existe valor salvo E a sugestão é diferente: a tela
 *                  mostra os dois lado a lado e o gestor escolhe.
 *
 * A comparação usa a mesma precisão de exibição (1 casa — ver
 * `formatarProdutividade`): perguntar por causa de 11.333333 × 11.3 seria
 * perguntar sobre uma diferença que a tela nem mostra.
 */
export function decidirAplicacaoSugestao(params: ParametrosDecisaoSugestao): DecisaoSugestao {
  const sugerido = params.valorSugerido ?? null;
  if (sugerido === null || !Number.isFinite(sugerido)) return { acao: "ignorar" };
  if (params.produtividadeTocada) return { acao: "ignorar" };

  const campoVazio = params.valorAtualCampo.trim() === "";
  if (campoVazio || devePermitirSobrescritaAutomatica(params.origemSalva)) {
    return { acao: "aplicar", valor: sugerido };
  }

  const salvo = Number(params.valorAtualCampo);
  if (!Number.isFinite(salvo)) return { acao: "ignorar" };
  if (arredondarProdutividade(salvo) === arredondarProdutividade(sugerido)) return { acao: "ignorar" };

  return { acao: "perguntar", valorSalvo: salvo, valorSugerido: sugerido };
}

// ─── CC2 (review final): invariante origem ↔ valor, fora do .tsx ─────────────

/**
 * A origem que deve ser GRAVADA junto da produtividade, dada a dupla
 * (valor, origem do formulário). Invariante em um lugar só, testado:
 *
 *  - sem valor (`null`) ⇒ origem `null`. Guardar "definida por você" sem
 *    número deixaria a tela afirmando uma decisão que não existe.
 *  - com valor e sem origem ⇒ `definida_gestor`. Um número só chega ao
 *    campo porque o gestor digitou ou porque ele aceitou uma sugestão; se
 *    a origem se perdeu no caminho, o responsável é quem está salvando —
 *    nunca atribuir ao histórico um número que o histórico não produziu.
 *  - com valor e com origem ⇒ a própria origem.
 *
 * Antes isto era um ternário solto dentro de `ConfiguracaoFuncoes.tsx`
 * (`produtividadeAlvo == null ? null : form.produtividadeOrigem`), que
 * cobria só o primeiro caso e deixava passar `{valor: 12, origem: null}`.
 */
export function origemParaSalvar(
  produtividadeAlvo: number | null | undefined,
  origemDoFormulario: ProdutividadeOrigem | null,
): ProdutividadeOrigem | null {
  if (produtividadeAlvo == null) return null;
  return origemDoFormulario ?? "definida_gestor";
}

// ─── CC3 (review final): produtividade exibida com precisão falsa ────────────

/**
 * Arredonda a produtividade para a precisão com que ela é EXIBIDA (1 casa
 * decimal). Usada também na comparação salvo × sugerido
 * (`decidirAplicacaoSugestao`) para que a tela nunca pergunte sobre uma
 * diferença invisível.
 */
export function arredondarProdutividade(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Texto da produtividade para exibição: 1 casa decimal, vírgula (pt-BR), e
 * sem ".0" pendurado em número inteiro. A mediana do histórico sai de uma
 * divisão (`atendimentos ÷ pessoas-hora`) e chegava crua na tela —
 * `11.333333333333334 tickets/h` —, que é a mesma família do R22: precisão
 * falsa. Ninguém escala gente com 13 casas decimais.
 */
export function formatarProdutividade(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  const arredondado = arredondarProdutividade(valor);
  return arredondado.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Mesma precisão, mas para dentro de um `<input type="number">`, que não
 * aceita vírgula — ponto decimal e sem separador de milhar. */
export function produtividadeParaInput(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return String(arredondarProdutividade(valor));
}
