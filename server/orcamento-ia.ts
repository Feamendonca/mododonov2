/**
 * orcamento-ia.ts
 * Camada de IA ADITIVA do Orçamento (Task 8, Fase B). A IA entra POR CIMA do
 * rascunho determinístico (orcamento-proposta.ts): ela NUNCA lê a planilha
 * (recebe só os números JÁ EXTRAÍDOS pelo código — histórico + rascunho) e
 * NUNCA grava nada no banco. Ela só:
 *   1. SUGERE ajustes opcionais por campo do rascunho (number ou null — null
 *      = "sem sugestão, mantém o valor determinístico").
 *   2. APONTA alavancas fracas (ex.: CMV acima do saudável, folha pesada).
 *
 * Regra dura (igual orcamento-proposta.ts): a IA NÃO inventa números. Sem
 * base no histórico, ela retorna `null` pro campo — nunca chuta um valor de
 * benchmark genérico.
 *
 * Fallback silencioso OBRIGATÓRIO: qualquer erro (chamada à LLM falhar, JSON
 * inválido, resposta fora do formato esperado) é capturado e devolve
 * `{ sugestoes: {}, alavancasFracas: [] }` SEM lançar — o rascunho
 * determinístico tem que continuar de pé mesmo se a IA cair.
 */

import { invokeLLM } from "./_core/llm";
import { MODEL_DEEP } from "./_core/llm-models";
import type { GrupoDreMes, RascunhoOrcamento } from "./orcamento-proposta";

export interface SugestaoIA {
  sugestoes: Record<string, number | null>;
  alavancasFracas: { campo: string; nota: string }[];
}

const FALLBACK_VAZIO: SugestaoIA = { sugestoes: {}, alavancasFracas: [] };

const SYSTEM_PROMPT = `Você é um analista financeiro especializado em restaurantes e franquias no Brasil, atuando POR CIMA de um rascunho de orçamento já calculado de forma determinística (por código, a partir de médias do histórico).

Você recebe números JÁ EXTRAÍDOS do histórico de DRE e do rascunho proposto — você NUNCA lê planilha, NUNCA tem acesso a arquivos brutos.

Sua função tem dois produtos, e SOMENTE dois:
1. "sugestoes": ajustes opcionais, campo a campo, ao rascunho. Cada valor é um número (sua sugestão de ajuste) OU null (sem sugestão — mantém o valor determinístico do rascunho).
2. "alavancasFracas": lista de { campo, nota } apontando pontos fracos do orçamento (ex.: CMV acima do saudável ~32-35%, folha acima de ~22-25% da receita, taxa de cartão alta, etc.), com uma nota curta explicando o porquê.

Regras duras, sem exceção:
- Você NÃO inventa números. Se não houver base suficiente no histórico para uma sugestão, retorne null para aquele campo — NUNCA um valor de benchmark genérico "chutado".
- Você só SUGERE e APONTA. Você NUNCA decide, NUNCA grava, NUNCA aplica nada — quem decide é o gestor humano.
- Responda SOMENTE no formato JSON pedido.`;

function montarPromptUsuario(historico: GrupoDreMes[], rascunho: RascunhoOrcamento): string {
  const historicoTexto = historico
    .map((mes) => {
      const categorias = Object.entries(mes.cats)
        .map(([categoria, valor]) => `  ${categoria}: R$ ${(valor as number).toFixed(2)}`)
        .join("\n");
      return `Mês ${mes.anoMes}:\n${categorias}`;
    })
    .join("\n\n");

  const rascunhoTexto = JSON.stringify(rascunho, null, 2);

  return `HISTÓRICO DE DRE (grupos nível-1 por mês, já extraídos — valores negativos = despesa):
${historicoTexto || "(sem histórico disponível)"}

RASCUNHO DE ORÇAMENTO PROPOSTO (determinístico, por média/tendência — campos null = sem base no histórico):
${rascunhoTexto}

Com base SOMENTE nesses números, gere suas sugestões de ajuste (ou null) e aponte as alavancas fracas.`;
}

const JSON_SCHEMA = {
  name: "sugestao_ia_orcamento",
  strict: true,
  schema: {
    type: "object",
    properties: {
      sugestoes: {
        type: "object",
        additionalProperties: { type: ["number", "null"] },
      },
      alavancasFracas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            campo: { type: "string" },
            nota: { type: "string" },
          },
          required: ["campo", "nota"],
          additionalProperties: false,
        },
      },
    },
    required: ["sugestoes", "alavancasFracas"],
    additionalProperties: false,
  },
};

/** Type guard best-effort: valida que o JSON retornado pela LLM tem o formato esperado
 * de SugestaoIA antes de confiar nele. Qualquer desvio cai no fallback silencioso. */
function ehSugestaoIAValida(value: unknown): value is SugestaoIA {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (!obj.sugestoes || typeof obj.sugestoes !== "object" || Array.isArray(obj.sugestoes)) return false;
  for (const v of Object.values(obj.sugestoes as Record<string, unknown>)) {
    if (v !== null && typeof v !== "number") return false;
  }

  if (!Array.isArray(obj.alavancasFracas)) return false;
  for (const item of obj.alavancasFracas) {
    if (!item || typeof item !== "object") return false;
    const i = item as Record<string, unknown>;
    if (typeof i.campo !== "string" || typeof i.nota !== "string") return false;
  }

  return true;
}

/**
 * Gera a camada de IA aditiva: sugestões de ajuste + alavancas fracas, a
 * partir do histórico e do rascunho JÁ CALCULADOS pelo código (nenhuma
 * leitura de planilha, nenhuma escrita em banco acontece aqui).
 *
 * Fallback silencioso: qualquer erro (LLM, JSON inválido/fora do formato)
 * retorna `{ sugestoes:{}, alavancasFracas:[] }` sem lançar.
 */
export async function gerarSugestaoIA(input: {
  historico: GrupoDreMes[];
  rascunho: RascunhoOrcamento;
}): Promise<SugestaoIA> {
  try {
    const response = await invokeLLM({
      model: MODEL_DEEP,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: montarPromptUsuario(input.historico, input.rascunho) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: JSON_SCHEMA,
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return FALLBACK_VAZIO;

    const parsed: unknown = JSON.parse(content);
    if (!ehSugestaoIAValida(parsed)) return FALLBACK_VAZIO;

    return parsed;
  } catch {
    return FALLBACK_VAZIO;
  }
}
