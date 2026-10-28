/**
 * orcamento-import.ts
 * Leitura determinística (100% por código, SEM IA) da DRE histórica usada
 * pelo módulo de Orçamento (Fase B). Baixa o arquivo do storage, delega o
 * parsing ao extractDreHistorico (server/sheet-parser.ts) e devolve os
 * últimos N meses já estruturados.
 *
 * NÃO grava no banco. NÃO aplica migration. Apenas leitura + transformação.
 */

import { extractDreHistorico, type DreHistoricoMes } from "./sheet-parser";
import { storageDownload } from "./storage";

// Reexportado para os consumidores deste módulo (Task 3 em diante) não
// precisarem importar de sheet-parser.ts diretamente.
export type { DreHistoricoMes };

const DEFAULT_MESES = 3;

/**
 * Baixa a planilha de DRE do storage (por `storageKey`) e devolve os últimos
 * `meses` (default 3) meses com dado real, já estruturados por categoria
 * (faturamento, cmv, folha, custosFixos, custosVariaveis, impostos, ebitda).
 *
 * Leitura 100% determinística: os números vêm da célula (cellToNumberDre),
 * nunca de uma IA.
 */
export async function lerDreHistorico(
  storageKey: string,
  fileName: string,
  meses: number = DEFAULT_MESES,
): Promise<DreHistoricoMes[]> {
  const buffer = await storageDownload(storageKey);
  const resultado = extractDreHistorico(buffer, fileName);
  return resultado.meses.slice(-meses);
}
