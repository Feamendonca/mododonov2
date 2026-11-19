/**
 * escala-produtividade.ts — Produtividade sugerida a partir do histórico
 *
 * Quando o gerente cadastra uma função nova ("Atendente", "Garçom",
 * "Cozinha"), ele precisa informar quantas unidades por hora uma pessoa
 * entrega — número que ele não tem de cabeça. Esta função calcula uma
 * SUGESTÃO a partir do que já aconteceu na loja: o sistema propõe, o
 * gerente confirma, nunca grava sozinho (princípio do app).
 *
 * Função pura, sem I/O — recebe amostras já coletadas (a leitura do banco
 * é responsabilidade da Task 4) e devolve o número ou uma guarda com
 * motivo.
 *
 * Decisão de produto central: usa MEDIANA, não média, dos dias válidos.
 * Um feriado atípico ou um dia de evento não pode mover a régua de
 * produtividade da loja inteira.
 *
 * Ver .superpowers/sdd/2026-11-19-escala-configuracao/task-3-brief.md.
 */

const MINIMO_DIAS_VALIDOS = 5;

export interface AmostraProdutividade {
  atendimentos: number;
  pessoasHora: number;
}

export interface ResultadoProdutividadeHistorica {
  valor: number | null;
  motivo?: string;
  amostras: number;
}

export function calcularProdutividadeHistorica(
  amostras: AmostraProdutividade[],
): ResultadoProdutividadeHistorica {
  // Dias com atendimentos zerados são descartados (loja fechada, feriado) —
  // não é produtividade zero, é ausência de operação naquele dia.
  const diasComOperacao = amostras.filter((a) => a.atendimentos > 0);

  // Dias sem pessoas-hora registrada não entram no cálculo: não há escala
  // para dividir os atendimentos, e dividir por zero não tem sentido.
  const diasValidos = diasComOperacao.filter((a) => a.pessoasHora > 0);

  if (diasComOperacao.length > 0 && diasValidos.length === 0) {
    return {
      valor: null,
      motivo: "Sem escala registrada (pessoas-hora zerada ou ausente) nos dias com atendimento.",
      amostras: diasValidos.length,
    };
  }

  if (diasValidos.length < MINIMO_DIAS_VALIDOS) {
    return {
      valor: null,
      motivo: `Amostra insuficiente para virar régua: são necessários ao menos ${MINIMO_DIAS_VALIDOS} dias válidos de histórico (há ${diasValidos.length}).`,
      amostras: diasValidos.length,
    };
  }

  const produtividadesPorDia = diasValidos
    .map((a) => a.atendimentos / a.pessoasHora)
    .sort((x, y) => x - y);

  return {
    valor: mediana(produtividadesPorDia),
    amostras: diasValidos.length,
  };
}

function mediana(valoresOrdenados: number[]): number {
  const n = valoresOrdenados.length;
  const meio = Math.floor(n / 2);

  if (n % 2 === 1) {
    return valoresOrdenados[meio];
  }

  return (valoresOrdenados[meio - 1] + valoresOrdenados[meio]) / 2;
}
