/**
 * Constantes de modelo LLM para o Modo Dono.
 *
 * Modelos disponíveis no gateway Manus (snapshot 2026-06-29 — verificar /v1/models):
 *
 * | ID                        | Preço ($/1M in/out) | Melhor para                                |
 * |---------------------------|---------------------|--------------------------------------------|
 * | gpt-5-nano                | 0.05 / 0.40         | Bulk barato, extração simples              |
 * | gpt-5-mini                | 0.25 / 2.00         | Workhorse padrão, maioria das tarefas      |
 * | gpt-5                     | 1.25 / 10.00        | Raciocínio + código                        |
 * | gpt-5.5                   | 5.00 / 30.00        | Problemas mais difíceis                    |
 * | claude-haiku-4-5          | 1.00 / 5.00         | Rápido, custo-eficiente                    |
 * | claude-sonnet-4-6         | 3.00 / 15.00        | Balanceado, raciocínio forte               |
 * | claude-opus-4-7           | 5.00 / 25.00        | Raciocínio avançado, análise complexa      |
 * | gemini-3-flash-preview    | 0.50 / 3.00         | Contexto longo + multimodal, baixo custo   |
 * | gemini-3.1-pro-preview    | 2.00 / 12.00        | Flagship multimodal + raciocínio           |
 * | gemini-2.5-flash          | (legado, atual)     | Modelo atual hardcoded no llm.ts           |
 *
 * Decisão para o Modo Dono:
 * - MODEL_FAST: gemini-2.5-flash — rápido, barato, suficiente para extração/formatação/JSON
 * - MODEL_DEEP: gemini-3.1-pro-preview — raciocínio forte para análise de DRE, diagnóstico,
 *   sugestões de corte e questionamentos (chamada de enriquecimento do Orçamento IA)
 *
 * Alternativas consideradas para MODEL_DEEP:
 * - claude-opus-4-7: melhor para raciocínio puro, mas 2.5× mais caro
 * - gpt-5: boa opção se o gateway OpenAI tiver melhor latência
 * - claude-sonnet-4-6: bom equilíbrio custo/qualidade se gemini-3.1-pro-preview for lento
 */

/** Modelo padrão — rápido e barato. Usado em todas as chamadas existentes. */
export const MODEL_FAST = "gemini-2.5-flash";

/**
 * Modelo de análise profunda — raciocínio forte com thinking.
 * Usar para: análise de DRE linha a linha, diagnóstico, sugestões de corte,
 * questionamentos e enriquecimento do Orçamento IA.
 */
export const MODEL_DEEP = "gemini-3.1-pro-preview";
