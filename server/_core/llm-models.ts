/**
 * Constantes de modelo LLM para o Modo Dono.
 *
 * A partir da migração "fora do Manus" (2026-10), a IA do app chama a Anthropic
 * (Claude) diretamente via server/_core/llm.ts, em vez do gateway
 * forge.manus.im/v1/chat/completions (que expunha modelos Gemini/OpenAI).
 *
 * Modelos Anthropic usados pelo Modo Dono:
 *
 * | Alias               | ID exato            | Preço ($/1M in/out) | Uso no Modo Dono                         |
 * |----------------------|----------------------|----------------------|-------------------------------------------|
 * | claude-haiku-4-5     | claude-haiku-4-5     | 1.00 / 5.00          | MODEL_FAST — extração/formatação/JSON/OCR |
 * | claude-sonnet-4-6    | claude-sonnet-4-6    | 3.00 / 15.00         | MODEL_DEEP — análise de DRE, diagnóstico  |
 *
 * Decisão para o Modo Dono:
 * - MODEL_FAST: claude-haiku-4-5 — rápido, barato, suficiente para extração/formatação/JSON
 *   e para a OCR de nota de compra (extrairNotaCompra em cmv.ts, que usa visão).
 * - MODEL_DEEP: claude-sonnet-4-6 — raciocínio forte para análise de DRE, diagnóstico,
 *   sugestões de corte e questionamentos (chamada de enriquecimento do Orçamento IA).
 *
 * Ambos os IDs são aliases válidos da Anthropic (sem sufixo de data) — ver
 * platform.claude.com/docs/en/about-claude/models/overview para a lista atual.
 */

/** Modelo padrão — rápido e barato. Usado em todas as chamadas existentes. */
export const MODEL_FAST = "claude-haiku-4-5";

/**
 * Modelo de análise profunda — raciocínio forte com thinking (extended thinking via
 * thinkingBudget em invokeLLM).
 * Usar para: análise de DRE linha a linha, diagnóstico, sugestões de corte,
 * questionamentos e enriquecimento do Orçamento IA.
 */
export const MODEL_DEEP = "claude-sonnet-4-6";
