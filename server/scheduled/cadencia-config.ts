/**
 * Constantes de cadência — todos os limiares e pesos em um único lugar.
 * Altere aqui para ajustar o comportamento de todos os crons de cadência.
 */

/** Dias sem contagem de estoque antes de notificar */
export const CONTAGEM_LIMIAR_DIAS = 10;

/** Dias sem resolução de ocorrência antes de notificar (e penalizar Voz do Cliente) */
export const OCORRENCIA_LIMIAR_DIAS = 7;

/** Nota de cadência abaixo deste valor → reunião discute cadência, não resultado */
export const CADENCIA_LIMIAR_REUNIAO = 80;

/** Pesos do Índice de Cadência v1 (soma deve ser 1.0) */
export const CADENCIA_PESOS = {
  lancamento: 0.25,  // % dias com lançamento feito na semana
  preturno: 0.25,    // % pré-turnos realizados/esperados
  contagem: 0.25,    // contagem em dia (1.0) ou atrasada (0.0)
  ocorrencia: 0.25,  // sem ocorrências paradas (1.0) ou com (penalidade proporcional)
} as const;
