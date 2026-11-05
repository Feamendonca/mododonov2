/**
 * orcamento-plano-ia.ts
 * Motor da IA do "Proposto Inteligente" (Task P1 — ver
 * docs/superpowers/specs/2026-11-05-proposto-inteligente-ia.md).
 *
 * A peça-chave: a IA transforma a DRE num PLANO viável, linha a linha, pra
 * chegar numa META que o gestor define — ancorado na realidade dos 3 meses
 * (nunca promete o impossível) — com o "porquê" e um plano de batalha
 * consolidado (ações práticas). Tudo editável depois (o gestor julga a
 * coerência). A IA SÓ sugere FOLHAS; o humano confirma — nunca grava sozinha.
 *
 * Determinístico vs. IA, separados (igual orcamento-ia.ts):
 *  1. `montarRetratoLinhas` (determinístico, SEM IA): monta o retrato dos 3
 *     meses por linha — melhor mês, pior mês, média — a partir das linhas JÁ
 *     EXTRAÍDAS por `proporLinhas` (orcamento-arvore.ts). Só FOLHAS entram
 *     (exclui derivadas/subtotais — são soma das folhas, nunca propostas).
 *  2. `gerarPlanoIA` (IA): recebe o retrato + a meta, chama `invokeLLM`
 *     (MODEL_DEEP, json_schema) com as REGRAS DE VIABILIDADE ESCALONADA no
 *     system prompt, e devolve `propostoIA`/`porque`/`confianca` por linha +
 *     um `planoBatalha` consolidado + se a meta bate.
 *
 * Regra dura (igual ao resto do Orçamento): a IA NUNCA lê a planilha (recebe
 * só números já extraídos), NUNCA grava nada no banco, e NUNCA chuta um
 * número sem lastro no histórico (sem base → null).
 *
 * Fallback silencioso OBRIGATÓRIO: qualquer erro (chamada à LLM falhar, JSON
 * inválido, resposta fora do formato esperado) é capturado e devolve um
 * PlanoIA vazio com `meta.motivo: "IA indisponível"` SEM lançar — a tela
 * continua de pé (mantém a média no Proposto) mesmo se a IA cair.
 */

import { invokeLLM } from "./_core/llm";
import { MODEL_DEEP } from "./_core/llm-models";
import type { LinhaProposta } from "./orcamento-arvore";

export type MetaInput =
  | { tipo: "ebitda_rs"; valor: number }
  | { tipo: "ebitda_pct"; valor: number }
  | { tipo: "melhoria_pct"; valor: number };

export interface LinhaPlano {
  codigo: string;
  propostoIA: number | null;
  porque: string;
  confianca: "alta" | "media" | "baixa";
}

export interface AcaoBatalha {
  titulo: string;
  descricao: string;
  linhasAfetadas: string[];
  impactoEstimadoRs: number | null;
  prioridade: "alta" | "media" | "baixa";
}

export interface PlanoIA {
  linhas: LinhaPlano[];
  planoBatalha: AcaoBatalha[];
  meta: {
    alvoRs: number | null;
    alcancadoRs: number | null;
    atingiuMeta: boolean;
    motivo: string;
  };
}

export interface RetratoLinha {
  codigo: string;
  label: string;
  natureza: string;
  derivada: boolean;
  melhor: number | null;
  pior: number | null;
  media: number | null;
  porMes: (number | null)[];
}

const FALLBACK_VAZIO: PlanoIA = {
  linhas: [],
  planoBatalha: [],
  meta: { alvoRs: null, alcancadoRs: null, atingiuMeta: false, motivo: "IA indisponível" },
};

/**
 * Pra uma linha de CUSTO: melhor = valor com MENOR módulo (custo mais baixo),
 * pior = valor com MAIOR módulo (custo mais alto). Valores de custo vêm
 * negativos (convenção da DRE); comparamos por `Math.abs`.
 * Pra uma linha de RECEITA: melhor = MAIOR valor, pior = MENOR valor.
 */
function calcularMelhorPiorMedia(
  natureza: string,
  valoresNaoNulos: number[],
): { melhor: number | null; pior: number | null; media: number | null } {
  if (valoresNaoNulos.length === 0) return { melhor: null, pior: null, media: null };

  const media = valoresNaoNulos.reduce((soma, v) => soma + v, 0) / valoresNaoNulos.length;

  if (natureza === "receita") {
    return {
      melhor: Math.max(...valoresNaoNulos),
      pior: Math.min(...valoresNaoNulos),
      media,
    };
  }

  // custo (default): melhor = menor módulo, pior = maior módulo.
  let melhor = valoresNaoNulos[0];
  let pior = valoresNaoNulos[0];
  for (const v of valoresNaoNulos) {
    if (Math.abs(v) < Math.abs(melhor)) melhor = v;
    if (Math.abs(v) > Math.abs(pior)) pior = v;
  }
  return { melhor, pior, media };
}

/**
 * Monta o retrato determinístico dos 3 meses por linha — melhor/pior/média —
 * a partir das linhas JÁ EXTRAÍDAS por `proporLinhas`. NÃO é IA: é cálculo
 * puro, pra a IA (gerarPlanoIA) receber números confiáveis em vez de ler
 * qualquer dado bruto.
 *
 * Só FOLHAS entram (exclui `derivada` e `temFilhos` — são subtotais, soma
 * das folhas, nunca propostas individualmente). Linha sem nenhum valor nos
 * meses → melhor/pior/média `null` (NUNCA chuta).
 */
export function montarRetratoLinhas(linhas: LinhaProposta[], anoMeses: string[]): RetratoLinha[] {
  return linhas
    .filter((linha) => !linha.derivada && !linha.temFilhos)
    .map((linha) => {
      const valoresNaoNulos = linha.porMes.filter((v): v is number => v !== null);
      const { melhor, pior, media } = calcularMelhorPiorMedia(linha.natureza, valoresNaoNulos);
      return {
        codigo: linha.codigo,
        label: linha.label,
        natureza: linha.natureza,
        derivada: linha.derivada,
        melhor,
        pior,
        media,
        porMes: linha.porMes,
      };
    });
}

const SYSTEM_PROMPT = `Você é um analista financeiro especializado em restaurantes e franquias no Brasil. Sua função é transformar a DRE de uma loja num PLANO VIÁVEL, linha a linha, pra o gestor atingir uma META que ele definiu.

Você recebe, JÁ EXTRAÍDO pelo código (determinístico): o retrato dos últimos 3 meses de cada linha FOLHA da DRE (melhor mês, pior mês, média, e o valor de cada mês individual) e a meta do gestor. Você NUNCA lê planilha, NUNCA tem acesso a arquivos brutos, NUNCA recebe nem precisa inferir nada além do que está no retrato.

Por LINHA ajustada, você devolve:
- "codigo": o código da linha (igual ao retrato recebido).
- "propostoIA": o valor sugerido (número) ou null se não houver base suficiente no histórico pra sugerir (NUNCA invente um número sem lastro).
- "porque": 1 frase curta e concreta, ancorada nos números do retrato (ex.: "CMV foi 26% no seu melhor mês e 31% na média — dá pra travar em 27%").
- "confianca": "alta" | "media" | "baixa", seguindo as REGRAS DE VIABILIDADE ESCALONADA abaixo.

REGRAS DE VIABILIDADE ESCALONADA (travam você de inventar — leia com atenção):
- O melhor mês NÃO é teto — você PODE mirar além do melhor realizado (senão nunca há crescimento). Mas o juízo é escalonado:
  - Ajuste DENTRO da faixa histórica (entre o pior e o melhor mês) → confianca "alta", sem exigir justificativa forte.
  - Ajuste que SUPERA o melhor mês → permitido, mas EXIGE uma ação concreta no planoBatalha que sustente esse ajuste, e confianca "media".
  - Ajuste MUITO além do histórico (ex.: receita >20% acima do melhor mês, ou custo cortado muito abaixo do melhor mês) → permitido SÓ com uma ação forte no planoBatalha + confianca "baixa" + deixe isso explícito no "porque" (algo como "meta agressiva").
  - Nunca proponha um "número maluco" sem lastro: toda melhoria agressiva PRECISA ter uma ação no planoBatalha que a explique — senão recue pro valor realista (dentro da faixa histórica) e avise no "porque"/"motivo".
- Linha sem base nos 3 meses (melhor/pior/media = null no retrato) → propostoIA fica null (NUNCA chute).
- Derivados/subtotais NÃO aparecem no retrato que você recebe (já vêm filtrados) — você nunca propõe uma linha que não esteja no retrato.

Além das linhas, você devolve, SEPARADO (não é ação por linha, é um bloco consolidado):
- "planoBatalha": lista de ações práticas, cada uma com { titulo, descricao, linhasAfetadas (códigos das linhas que essa ação sustenta), impactoEstimadoRs (número ou null se não houver base pra estimar), prioridade }.

E fecha a conta em "meta":
- "alvoRs": o alvo de EBITDA em R$ que você calculou a partir da meta recebida (converta ebitda_pct/melhoria_pct pra R$ usando os números do retrato; se não houver base suficiente pra converter, null).
- "alcancadoRs": o EBITDA que o conjunto de propostoIA das linhas alcança (receitas somadas menos custos somados, em módulo coerente com o sinal de cada linha).
- "atingiuMeta": true se alcancadoRs >= alvoRs (quando ambos não-null); false caso contrário.
- "motivo": se não bateu a meta, explique o gap com uma frase curta e concreta (ex.: "com ajustes realistas chega em R$ 92k, não R$ 100k — o gap é no faturamento"); se bateu, pode deixar uma frase curta de confirmação ou string vazia.

Regras duras, sem exceção:
- Você só SUGERE. Você NUNCA decide, NUNCA grava, NUNCA aplica nada — quem decide é o gestor humano.
- Responda SOMENTE no formato JSON pedido, nada fora do schema.`;

function montarPromptUsuario(retrato: RetratoLinha[], anoMeses: string[], meta: MetaInput): string {
  const retratoTexto = JSON.stringify(retrato, null, 2);
  const metaTexto = JSON.stringify(meta, null, 2);

  return `MESES CONSIDERADOS (ordem cronológica): ${anoMeses.join(", ")}

RETRATO DOS 3 MESES POR LINHA (determinístico, já extraído — só linhas folha; custo em valor negativo, receita em valor positivo; melhor/pior/media = null quando não há base):
${retratoTexto}

META DO GESTOR:
${metaTexto}

Com base SOMENTE nesses números, gere o plano: propostoIA/porque/confianca por linha, o planoBatalha consolidado, e feche a conta da meta.`;
}

const JSON_SCHEMA = {
  name: "plano_ia_orcamento",
  strict: true,
  schema: {
    type: "object",
    properties: {
      linhas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            codigo: { type: "string" },
            propostoIA: { type: ["number", "null"] },
            porque: { type: "string" },
            confianca: { type: "string", enum: ["alta", "media", "baixa"] },
          },
          required: ["codigo", "propostoIA", "porque", "confianca"],
          additionalProperties: false,
        },
      },
      planoBatalha: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            descricao: { type: "string" },
            linhasAfetadas: { type: "array", items: { type: "string" } },
            impactoEstimadoRs: { type: ["number", "null"] },
            prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
          },
          required: ["titulo", "descricao", "linhasAfetadas", "impactoEstimadoRs", "prioridade"],
          additionalProperties: false,
        },
      },
      meta: {
        type: "object",
        properties: {
          alvoRs: { type: ["number", "null"] },
          alcancadoRs: { type: ["number", "null"] },
          atingiuMeta: { type: "boolean" },
          motivo: { type: "string" },
        },
        required: ["alvoRs", "alcancadoRs", "atingiuMeta", "motivo"],
        additionalProperties: false,
      },
    },
    required: ["linhas", "planoBatalha", "meta"],
    additionalProperties: false,
  },
};

const CONFIANCAS = new Set(["alta", "media", "baixa"]);
const PRIORIDADES = new Set(["alta", "media", "baixa"]);

/** Type guard best-effort: valida que o JSON retornado pela LLM tem o formato
 * esperado de PlanoIA antes de confiar nele. Qualquer desvio cai no fallback
 * silencioso. */
function ehPlanoIAValido(value: unknown): value is PlanoIA {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.linhas)) return false;
  for (const item of obj.linhas) {
    if (!item || typeof item !== "object") return false;
    const i = item as Record<string, unknown>;
    if (typeof i.codigo !== "string") return false;
    if (i.propostoIA !== null && typeof i.propostoIA !== "number") return false;
    if (typeof i.porque !== "string") return false;
    if (typeof i.confianca !== "string" || !CONFIANCAS.has(i.confianca)) return false;
  }

  if (!Array.isArray(obj.planoBatalha)) return false;
  for (const item of obj.planoBatalha) {
    if (!item || typeof item !== "object") return false;
    const i = item as Record<string, unknown>;
    if (typeof i.titulo !== "string") return false;
    if (typeof i.descricao !== "string") return false;
    if (!Array.isArray(i.linhasAfetadas) || i.linhasAfetadas.some((c) => typeof c !== "string")) return false;
    if (i.impactoEstimadoRs !== null && typeof i.impactoEstimadoRs !== "number") return false;
    if (typeof i.prioridade !== "string" || !PRIORIDADES.has(i.prioridade)) return false;
  }

  if (!obj.meta || typeof obj.meta !== "object") return false;
  const m = obj.meta as Record<string, unknown>;
  if (m.alvoRs !== null && typeof m.alvoRs !== "number") return false;
  if (m.alcancadoRs !== null && typeof m.alcancadoRs !== "number") return false;
  if (typeof m.atingiuMeta !== "boolean") return false;
  if (typeof m.motivo !== "string") return false;

  return true;
}

/**
 * Gera o plano da IA: monta o retrato determinístico dos 3 meses por linha
 * (`montarRetratoLinhas`) e chama a LLM com o retrato + a meta + as regras de
 * viabilidade escalonada, pra devolver propostoIA/porque/confianca por linha +
 * um plano de batalha consolidado + se a meta bate.
 *
 * NUNCA lê planilha (recebe `linhas` já extraídas por `proporLinhas`). NUNCA
 * grava nada no banco — só chama `invokeLLM` e devolve o resultado pro
 * chamador decidir o que fazer.
 *
 * Fallback silencioso: qualquer erro (LLM, JSON inválido/fora do formato)
 * retorna um PlanoIA vazio com `meta.motivo: "IA indisponível"` sem lançar.
 */
export async function gerarPlanoIA(input: {
  linhas: LinhaProposta[];
  anoMeses: string[];
  meta: MetaInput;
}): Promise<PlanoIA> {
  try {
    const retrato = montarRetratoLinhas(input.linhas, input.anoMeses);

    const response = await invokeLLM({
      model: MODEL_DEEP,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: montarPromptUsuario(retrato, input.anoMeses, input.meta) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: JSON_SCHEMA,
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return FALLBACK_VAZIO;

    const parsed: unknown = JSON.parse(content);
    if (!ehPlanoIAValido(parsed)) return FALLBACK_VAZIO;

    return parsed;
  } catch {
    return FALLBACK_VAZIO;
  }
}
