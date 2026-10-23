/**
 * Hook para inputs numéricos que aceitam vírgula como separador decimal.
 * Retorna { displayValue, numericValue, onChange } para uso em <Input>.
 *
 * Uso:
 *   const price = useCurrencyInput(0);
 *   <Input value={price.displayValue} onChange={price.onChange} />
 *   // price.numericValue é o número parseado
 */
export function useCurrencyInput(initial: number | null = null) {
  // Converte número para string de exibição (vírgula como decimal)
  function toDisplay(v: number | null): string {
    if (v === null || v === undefined || isNaN(v as number)) return "";
    return String(v).replace(".", ",");
  }

  // Parseia string digitada (aceita vírgula ou ponto) para número
  function parseInput(raw: string): number | null {
    if (!raw || raw.trim() === "") return null;
    // Remove pontos de milhar, substitui vírgula por ponto
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(normalized);
    return isNaN(n) ? null : n;
  }

  return { toDisplay, parseInput };
}

/**
 * Parseia um valor string que pode usar vírgula ou ponto como decimal.
 * Retorna 0 se inválido.
 */
export function parseNumericInput(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

/**
 * Formata número para exibição em campo de input (vírgula como decimal, sem símbolo).
 */
export function formatNumericInput(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v as number)) return "";
  // Mostra até 2 casas decimais, sem trailing zeros desnecessários
  const s = v.toFixed(2);
  // Remove zeros à direita após vírgula
  const trimmed = s.replace(/\.?0+$/, "");
  return trimmed.replace(".", ",");
}
