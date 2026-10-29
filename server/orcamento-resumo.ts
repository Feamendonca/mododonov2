/**
 * orcamento-resumo.ts
 * Resumo (EBITDA/meta/ponto de equilíbrio) calculado a partir das LINHAS da
 * árvore da DRE (Task L1, `server/orcamento-arvore.ts`) — Task L3, reforma
 * "orçamento linha a linha" (ver docs/superpowers/sdd/2026-10-29-orcamento-
 * linha-a-linha/task-l3-brief.md).
 *
 * Equivalente ao `calcularDre` de orcamento-proposta.ts, mas trabalhando
 * sobre linhas REAIS da DRE (uma por `codigo`) em vez de categorias
 * agregadas/percentuais. Ponto crítico: o EBITDA soma só as FOLHAS —
 * linhas SEM filhos e NÃO derivadas (subtotal calculado pela própria
 * planilha). Somar um grupo nível-1 (ex. "10 - Ocupação") JUNTO com suas
 * sub-linhas ("10.1 - Aluguel") causaria dupla contagem.
 *
 * Regra dura (igual ao resto do orçamento): campo sem base no histórico =
 * `null`. NUNCA `?? 0` nem benchmark de mercado — ver `parcial`.
 */

import { REGEX_DERIVADA } from "./orcamento-proposta";
import type { LinhaProposta } from "./orcamento-arvore";

export interface ResumoOrcamento {
  receitaBruta: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  metaDiaria: number | null;
  pontoEquilibrio: number | null;
  parcial: boolean;
}

/**
 * Shape aceito por `calcularResumoLinhas`: a `LinhaProposta` cheia (Task L1,
 * já carrega `derivada`/`temFilhos` calculados) OU um shape simplificado
 * (ex.: as linhas gravadas pelo gerente, vindas de `salvarLinhasOrcamento` —
 * sem `derivada`/`histMedia`/`proposto`). Quando `derivada` não vem no
 * objeto, é recalculada pela mesma regex (`REGEX_DERIVADA`, sobre `label`).
 * `temFilhos`, quando ausente, é recalculado varrendo o PRÓPRIO array por
 * códigos nível-2 "N.M" cujo "N" é o código da linha nível-1 em questão —
 * por isso o array deve conter TANTO os grupos quanto as sub-linhas (mesmo
 * contrato de `proporLinhas`/`salvarLinhas`).
 */
export type LinhaResumoInput =
  | LinhaProposta
  | {
      codigo: string;
      label: string;
      nivel: number;
      valor: number | null;
      natureza?: string;
      temFilhos?: boolean;
    };

const REGEX_RECEITA_BRUTA = /receita\s+bruta|receita\s+loja/i;
const REGEX_NAO_OPERACIONAL = /n[ãa]o\s*operac|investiment|empr[ée]stim/i;
const REGEX_PRO_LABORE = /pr[óo].?labore|distribui/i;
const REGEX_CMV = /custo.*mercadoria|cmv/i;

/**
 * Calcula o resumo financeiro (EBITDA, meta diária, ponto de equilíbrio)
 * SOMENTE a partir das FOLHAS operacionais — nunca soma um grupo nível-1
 * junto com suas sub-linhas (dupla contagem).
 *
 * - `receitaBruta`: soma das folhas cujo grupo (label do grupo-pai, ou da
 *   própria linha quando nível-1 sem filhos) casa
 *   `/receita\s+bruta|receita\s+loja/i`, só valores positivos.
 * - `ebitda`: soma com sinal de TODAS as folhas operacionais — exclui
 *   grupos não-operacionais e pró-labore. Receita entra +, custo entra −
 *   (já vem negativo na planilha).
 * - `ebitdaPct` = ebitda/receitaBruta (null se receita null/0 ou ebitda null).
 * - `metaDiaria` = receitaBruta/diasNoMes (null se receitaBruta null).
 * - `pontoEquilibrio` = custosFixos / (1 − pctVariavel), pctVariavel = |CMV|
 *   / receitaBruta, custosFixos = |demais custos operacionais exceto CMV e
 *   receita|. `null` quando não dá pra calcular (sem receita, ou
 *   pctVariavel >= 1).
 * - `parcial` = true quando alguma folha OPERACIONAL relevante (receita ou
 *   custo que entraria no EBITDA) tem valor `null` — ainda assim o EBITDA é
 *   calculado com o que se sabe (as linhas nulas simplesmente não somam
 *   nada), nunca chutado.
 */
export function calcularResumoLinhas(
  linhas: LinhaResumoInput[],
  diasNoMes: number
): ResumoOrcamento {
  // nível-1 codigo → label (resolve o "grupo-pai" de uma linha nível-2).
  const labelNivel1: Record<string, string> = {};
  // nível-1 codigo → existe alguma linha nível-2 "codigo.algo" no array?
  const temFilhosNivel1 = new Set<string>();
  for (const l of linhas) {
    if (l.nivel === 1) labelNivel1[l.codigo] = l.label;
  }
  for (const l of linhas) {
    if (l.nivel === 2) {
      const pai = l.codigo.split(".")[0];
      temFilhosNivel1.add(pai);
    }
  }

  function grupoLabel(l: LinhaResumoInput): string {
    if (l.nivel === 2) {
      const pai = l.codigo.split(".")[0];
      return labelNivel1[pai] ?? l.label;
    }
    return l.label;
  }

  function ehDerivada(l: LinhaResumoInput): boolean {
    if ("derivada" in l) return (l as LinhaProposta).derivada;
    return REGEX_DERIVADA.test(l.label);
  }

  function ehTemFilhos(l: LinhaResumoInput): boolean {
    if (l.nivel === 1 && temFilhosNivel1.has(l.codigo)) return true;
    return (l as { temFilhos?: boolean }).temFilhos ?? false;
  }

  function ehFolha(l: LinhaResumoInput): boolean {
    if ("natureza" in l && (l as { natureza?: string }).natureza === "subtotal") return false;
    return !ehDerivada(l) && !ehTemFilhos(l);
  }

  // `LinhaProposta` (Task L1 — vinda de `proporLinhas`, ex.: via `proporDaDre`)
  // não tem campo `valor`; o valor pra fins de resumo é o `proposto` (a
  // média histórica, ainda não editada pelo gerente). Já o shape simplificado
  // (linhas gravadas/editadas) usa `valor` diretamente.
  function getValor(l: LinhaResumoInput): number | null {
    if ("proposto" in l) return (l as LinhaProposta).proposto;
    return (l as { valor: number | null }).valor;
  }

  // Fronteira posicional: a PRIMEIRA linha DERIVADA cujo label é
  // especificamente "Resultado Operacional"/"EBITDA" (não "Margem Bruta" ou
  // "Receita Líquida", que são subtotais INTERMEDIÁRIOS dentro da zona
  // operacional) marca o fim do bloco operacional da DRE. Tudo que vem
  // DEPOIS dela (impostos sobre o resultado — IRPJ/CSLL —, não-operacionais,
  // pró-labore, "Resultado Final" etc.) é, por construção da própria DRE,
  // distribuição do resultado — NUNCA entra no EBITDA, mesmo que o label não
  // bata em nenhuma das regex de exclusão abaixo (ex.: um grupo de impostos
  // pós-resultado chamado exatamente igual a um grupo de impostos
  // pré-resultado, caso real — Bella Gula tem dois grupos "Impostos,
  // tributos e taxas": um antes, outro depois da linha de EBITDA). Sem essa
  // fronteira, a 2ª ocorrência (pós-resultado) seria contada por engano.
  // Quando a árvore passada não contém essa linha (ex.: array já filtrado
  // só com folhas, sem os subtotais), não há corte posicional — vale só a
  // exclusão por label (não-operacional/pró-labore).
  const REGEX_FRONTEIRA_EBITDA = /resultado\s+operac|ebitda/i;
  let fronteiraIdx = -1;
  for (let i = 0; i < linhas.length; i++) {
    if (ehDerivada(linhas[i]) && REGEX_FRONTEIRA_EBITDA.test(linhas[i].label)) {
      fronteiraIdx = i;
      break;
    }
  }

  let receitaTemValor = false;
  let somaReceita = 0;

  let temOperacional = false;
  let somaEbitda = 0;
  let parcial = false;

  let somaCmvAbs = 0;
  let somaCustosFixosAbs = 0;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!ehFolha(l)) continue;
    if (fronteiraIdx !== -1 && i > fronteiraIdx) continue; // pós-resultado: nunca entra

    const grupo = grupoLabel(l);
    const isReceita = REGEX_RECEITA_BRUTA.test(grupo) || REGEX_RECEITA_BRUTA.test(l.label);
    const isNaoOperacional = REGEX_NAO_OPERACIONAL.test(grupo) || REGEX_NAO_OPERACIONAL.test(l.label);
    const isProLabore = REGEX_PRO_LABORE.test(grupo) || REGEX_PRO_LABORE.test(l.label);
    const isCmv = REGEX_CMV.test(grupo) || REGEX_CMV.test(l.label);
    const isOperacional = !isNaoOperacional && !isProLabore;
    const valor = getValor(l);

    if (isReceita && valor !== null && valor > 0) {
      somaReceita += valor;
      receitaTemValor = true;
    }

    if (isOperacional) {
      if (valor === null) {
        parcial = true;
      } else {
        temOperacional = true;
        somaEbitda += valor;
        if (isCmv) {
          somaCmvAbs += Math.abs(valor);
        } else if (!isReceita) {
          somaCustosFixosAbs += Math.abs(valor);
        }
      }
    }
  }

  const receitaBruta = receitaTemValor ? somaReceita : null;
  const ebitda = temOperacional ? somaEbitda : null;
  const ebitdaPct =
    receitaBruta !== null && receitaBruta !== 0 && ebitda !== null ? ebitda / receitaBruta : null;
  const metaDiaria = receitaBruta !== null && diasNoMes > 0 ? receitaBruta / diasNoMes : null;

  let pontoEquilibrio: number | null = null;
  if (receitaBruta !== null && receitaBruta !== 0) {
    const pctVariavel = somaCmvAbs / receitaBruta;
    if (pctVariavel < 1) {
      pontoEquilibrio = somaCustosFixosAbs / (1 - pctVariavel);
    }
  }

  return { receitaBruta, ebitda, ebitdaPct, metaDiaria, pontoEquilibrio, parcial };
}
