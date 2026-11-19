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

/**
 * Lançado quando uma amostra traz `atendimentos` ou `pessoasHora` negativo.
 * Um número negativo nunca é um dado de negócio legítimo (não existe
 * atendimento ou pessoa-hora negativa) — é sinal de bug na coleta (Task 4).
 * Propositalmente um erro, não absorvido em silêncio pelos filtros `> 0`:
 * um negativo silenciosamente tratado como "dia fechado"/"sem escala"
 * torceria a régua de produtividade sem ninguém notar (mesma classe de
 * defeito que `FormatoDataInvalidoError` evita em escala-regras.ts).
 * Zero continua válido — zero É o sinal correto de "dia fechado"/"sem
 * escala", não aciona este erro.
 */
export class AmostraInvalidaError extends Error {
  readonly campo: "atendimentos" | "pessoasHora";
  readonly valor: number;
  readonly indice: number;

  constructor(campo: "atendimentos" | "pessoasHora", valor: number, indice: number) {
    super(
      `Amostra inválida no índice ${indice}: "${campo}" não pode ser negativo (valor recebido: ${valor}).`,
    );
    this.name = "AmostraInvalidaError";
    this.campo = campo;
    this.valor = valor;
    this.indice = indice;
  }
}

function validarAmostras(amostras: AmostraProdutividade[]): void {
  for (let indice = 0; indice < amostras.length; indice++) {
    const amostra = amostras[indice];
    if (amostra.atendimentos < 0) {
      throw new AmostraInvalidaError("atendimentos", amostra.atendimentos, indice);
    }
    if (amostra.pessoasHora < 0) {
      throw new AmostraInvalidaError("pessoasHora", amostra.pessoasHora, indice);
    }
  }
}

export function calcularProdutividadeHistorica(
  amostras: AmostraProdutividade[],
): ResultadoProdutividadeHistorica {
  // Valida ANTES de qualquer filtro: um negativo não pode ser absorvido
  // silenciosamente pelos filtros `> 0` abaixo (ver AmostraInvalidaError).
  validarAmostras(amostras);

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
