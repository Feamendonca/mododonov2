/**
 * orcamento-distribuir.ts
 * Função PURA de distribuição proporcional — usada pelo orçamento linha a
 * linha (`client/src/components/orcamento/DreEditavel.tsx`, Task "subtotais
 * editáveis de cima pra baixo", ver
 * `.superpowers/sdd/2026-10-29-meta-topdown/task-brief.md`).
 *
 * Quando o gerente digita uma META num subtotal de grupo nível-1 (ex.:
 * RECEITA BRUTA = 290000), essa meta precisa "descer" pras sub-linhas
 * filhas (nível-2) preservando a PROPORÇÃO atual entre elas — e não
 * zerando o detalhe que já foi digitado/puxado do histórico.
 *
 * Fica em `shared/` (não em `server/`) de propósito: é lógica pura, sem
 * nenhuma dependência de servidor (xlsx, db, etc.) — pode ser importada
 * em RUNTIME pelo client (via alias `@shared`, mesmo padrão de
 * `shared/calculations.ts` e `shared/const.ts`) sem arrastar nada pesado
 * pro bundle. Testada aqui com vitest (`shared/**​/*.test.ts` já está no
 * include do `vitest.config.ts`).
 */

/**
 * Distribui o valor `v` entre `filhosAtuais`, preservando a proporção entre
 * eles:
 *   - Se a soma atual dos filhos (`S`) for ≠ 0: cada filho novo =
 *     `filhoAtual * (v / S)` — mantém a proporção relativa entre os filhos
 *     (e o sinal de cada um, já que a escala é a mesma pra todos).
 *   - Se `S === 0` (filhos todos zerados/sem base): distribui IGUALMENTE
 *     (`v / n`).
 * Em ambos os casos, arredonda cada filho pro inteiro mais próximo e ajusta
 * a sobra do arredondamento no ÚLTIMO filho, garantindo que a soma dos
 * filhos retornados bate `Math.round(v)` EXATAMENTE — é esse invariante que
 * faz o subtotal do grupo (soma ao vivo dos filhos) voltar a exibir
 * exatamente o valor digitado.
 *
 * `filhosAtuais` já deve vir com `null` convertido pra `0` pelo chamador
 * (um filho sem base no histórico entra na distribuição como "sem peso
 * atual", recebendo sua fatia proporcional/igual normalmente).
 */
export function distribuirProporcional(v: number, filhosAtuais: number[]): number[] {
  const n = filhosAtuais.length;
  if (n === 0) return [];

  const soma = filhosAtuais.reduce((acc, x) => acc + x, 0);

  const brutos =
    soma !== 0
      ? filhosAtuais.map((x) => (x * v) / soma)
      : filhosAtuais.map(() => v / n);

  const arredondados = brutos.map((x) => Math.round(x));
  const somaArredondada = arredondados.reduce((acc, x) => acc + x, 0);
  const sobra = Math.round(v) - somaArredondada;
  arredondados[n - 1] += sobra;

  return arredondados;
}
