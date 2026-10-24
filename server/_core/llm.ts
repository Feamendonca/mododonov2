import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";
import { MODEL_FAST } from "./llm-models";

/**
 * Wrapper de IA do Modo Dono.
 *
 * Histórico: originalmente este arquivo chamava o gateway do Manus
 * (forge.manus.im/v1/chat/completions, formato OpenAI, modelos Gemini/OpenAI).
 * A partir da migração "fora do Manus" (2026-10), `invokeLLM` chama a
 * Anthropic (Claude) diretamente via @anthropic-ai/sdk — mas a ASSINATURA e o
 * CONTRATO de `invokeLLM` (tipos abaixo, forma do retorno) foram preservados
 * para que nenhum chamador precise mudar.
 *
 * Mapeamento OpenAI → Anthropic feito aqui:
 * - mensagens `[{role, content}]` → `system` (string) + `messages` (user/assistant) da Anthropic.
 * - imagem (`image_url` com data: URL) → content block `{type:"image", source:{type:"base64", media_type, data}}`.
 * - `response_format`/`outputSchema` do tipo `json_schema` → tool-use forçado (uma tool cujo
 *   `input_schema` é o schema pedido, com `tool_choice` forçando essa tool). Quando há
 *   `thinkingBudget` > 0 simultaneamente, usamos uma instrução de prompt pedindo JSON estrito
 *   em vez de tool_choice forçado — forçar uma tool específica com `thinking` habilitado não é
 *   suportado pela API da Anthropic (thinking exige `tool_choice: auto` ou nenhuma tool forçada).
 * - resposta Anthropic (`content: ContentBlock[]`) → `InvokeResult.choices[0].message.content`
 *   como STRING (mesmo formato que os chamadores já esperavam do gateway Manus — eles fazem
 *   `typeof content === "string"` e `JSON.parse(content)`).
 */

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** Modelo a usar. Default: "claude-haiku-4-5" (MODEL_FAST). Importar MODEL_DEEP de ./_core/llm-models para análises pesadas. */
  model?: string;
  /**
   * Orçamento de tokens de raciocínio (thinking budget).
   * - 0 = sem raciocínio (padrão para chamadas rápidas/estruturadas)
   * - 4000-8000 = análise profunda (usar com MODEL_DEEP no Estágio B)
   * Mapeado para `thinking: {type: "enabled", budget_tokens}` da Anthropic (mínimo 1024,
   * precisa ser menor que max_tokens).
   */
  thinkingBudget?: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Camada de tradução para a Anthropic Messages API
// ─────────────────────────────────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null;

const getClient = (): Anthropic => {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: ENV.anthropicApiKey });
  }
  return anthropicClient;
};

/**
 * Executa a chamada via streaming interno e aguarda a mensagem completa.
 *
 * `max_tokens` aqui é alto (até 32768, herdado do comportamento anterior do gateway
 * Manus) e a chamada não é feita pelo usuário em modo streaming — a própria Anthropic
 * SDK recusa `messages.create()` não-streaming quando `max_tokens` é grande o bastante
 * para arriscar exceder ~10 minutos ("Streaming is required for operations that may
 * take longer than 10 minutes"). Usar `messages.stream(...).finalMessage()` evita esse
 * erro e mantém `invokeLLM` com a mesma assinatura não-streaming para os chamadores.
 */
const createMessage = (
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> => client.messages.stream(params).finalMessage();

/** Faz parse de uma data: URL (data:<mime>;base64,<dados>). Retorna null se não for uma data: URL. */
const parseDataUrl = (
  url: string
): { mediaType: string; data: string } | null => {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(url);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
};

const IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Converte um ImageContent (OpenAI image_url) em um content block de imagem da Anthropic. */
const toAnthropicImageBlock = (part: ImageContent): Anthropic.ImageBlockParam => {
  const url = part.image_url.url;
  const parsed = parseDataUrl(url);

  if (parsed) {
    const mediaType = IMAGE_MEDIA_TYPES.has(parsed.mediaType)
      ? (parsed.mediaType as Anthropic.Base64ImageSource["media_type"])
      : ("image/jpeg" as Anthropic.Base64ImageSource["media_type"]); // fallback defensivo — fotos de nota são quase sempre jpeg/png
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: parsed.data },
    };
  }

  return {
    type: "image",
    source: { type: "url", url },
  };
};

/** Converte um FileContent (OpenAI file_url) em um content block da Anthropic. Hoje nenhum
 * chamador do Modo Dono usa file_url — este mapeamento é best-effort para não quebrar silenciosamente
 * caso algum chamador futuro passe a usar. PDFs são suportados nativamente; outros mime types
 * (áudio/vídeo) não têm equivalente na Messages API da Anthropic.
 */
const toAnthropicFileBlock = (part: FileContent): Anthropic.DocumentBlockParam => {
  const { url, mime_type } = part.file_url;
  if (mime_type && mime_type !== "application/pdf") {
    throw new Error(
      `file_url com mime_type "${mime_type}" não é suportado pela Anthropic Messages API (apenas application/pdf tem equivalente nativo).`
    );
  }
  const parsed = parseDataUrl(url);
  if (parsed) {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: parsed.data },
    };
  }
  return {
    type: "document",
    source: { type: "url", url },
  };
};

const toAnthropicBlock = (
  part: TextContent | ImageContent | FileContent
): Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "image_url") {
    return toAnthropicImageBlock(part);
  }
  return toAnthropicFileBlock(part);
};

/** Reduz o conteúdo de uma mensagem (string ou lista de partes) a texto puro — usado para
 * concatenar mensagens de role "system" no `system` prompt único da Anthropic. */
const flattenToPlainText = (content: MessageContent | MessageContent[]): string =>
  ensureArray(content)
    .map(normalizeContentPart)
    .map(part => {
      if (part.type === "text") return part.text;
      if (part.type === "image_url") return `[imagem: ${part.image_url.url}]`;
      return `[arquivo: ${part.file_url.url}]`;
    })
    .join("\n");

/**
 * Converte o array de mensagens no formato OpenAI (`Message[]`) para o formato Anthropic:
 * um `system` string único + um array `messages` só com roles user/assistant.
 *
 * Roles "tool"/"function" não são usadas por nenhum chamador atual do Modo Dono (não há
 * tool_use_id/tool_call_id reais em nenhum fluxo). Por segurança, são traduzidas em uma
 * mensagem de usuário anotando que é um resultado de tool, em vez de serem descartadas
 * silenciosamente ou lançarem erro.
 */
const buildAnthropicRequest = (
  messages: Message[]
): { system?: string; messages: Anthropic.MessageParam[] } => {
  const systemParts: string[] = [];
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = flattenToPlainText(message.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (message.role === "tool" || message.role === "function") {
      const text = flattenToPlainText(message.content);
      anthropicMessages.push({
        role: "user",
        content: `[resultado da tool${message.name ? ` "${message.name}"` : ""}]\n${text}`,
      });
      continue;
    }

    const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
    const parts = ensureArray(message.content).map(normalizeContentPart);
    const blocks = parts.map(toAnthropicBlock);

    if (blocks.length === 1 && blocks[0].type === "text") {
      anthropicMessages.push({ role, content: blocks[0].text });
    } else {
      anthropicMessages.push({ role, content: blocks });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: anthropicMessages,
  };
};

const toAnthropicTool = (tool: Tool): Anthropic.Tool => ({
  name: tool.function.name,
  description: tool.function.description,
  input_schema: (tool.function.parameters as Anthropic.Tool.InputSchema) ?? {
    type: "object",
    properties: {},
  },
});

const toAnthropicToolChoice = (
  choice: "none" | "auto" | ToolChoiceExplicit | undefined
): Anthropic.ToolChoice | undefined => {
  if (!choice) return undefined;
  if (choice === "none") return { type: "none" };
  if (choice === "auto") return { type: "auto" };
  return { type: "tool", name: choice.function.name };
};

/** Constrói a tool "estrutural" usada para forçar uma saída JSON que siga `jsonSchema`. */
const buildJsonSchemaTool = (jsonSchema: JsonSchema): Anthropic.Tool => ({
  name: jsonSchema.name,
  description: `Retorne os dados extraídos/gerados estritamente no formato definido por este schema (${jsonSchema.name}).`,
  input_schema: jsonSchema.schema as Anthropic.Tool.InputSchema,
});

const FINISH_REASON_MAP: Record<string, string> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  tool_use: "tool_calls",
  pause_turn: "stop",
  refusal: "content_filter",
  model_context_window_exceeded: "length",
};

/** Converte a resposta da Anthropic (`Anthropic.Message`) para o `InvokeResult` no formato
 * que os chamadores do Modo Dono já esperavam do gateway Manus (choices[0].message.content). */
const toInvokeResult = (
  message: Anthropic.Message,
  jsonSchemaToolName?: string
): InvokeResult => {
  let content = "";
  const toolCalls: ToolCall[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use") {
      if (jsonSchemaToolName && block.name === jsonSchemaToolName) {
        // Essa é a tool "estrutural" usada para emular response_format json_schema —
        // o `input` dela JÁ É a resposta estruturada que o chamador espera.
        content += JSON.stringify(block.input);
      } else {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      }
    }
    // Blocks de thinking/redacted_thinking são ignorados — não fazem parte do contrato OpenAI-shaped.
  }

  return {
    id: message.id,
    created: Math.floor(Date.now() / 1000),
    model: message.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason:
          (message.stop_reason && FINISH_REASON_MAP[message.stop_reason]) ??
          message.stop_reason ??
          null,
      },
    ],
    usage: message.usage
      ? {
          prompt_tokens: message.usage.input_tokens,
          completion_tokens: message.usage.output_tokens,
          total_tokens: message.usage.input_tokens + message.usage.output_tokens,
        }
      : undefined,
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const client = getClient();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
  } = params;

  const { system, messages: anthropicMessages } = buildAnthropicRequest(messages);

  if (anthropicMessages.length === 0) {
    throw new Error("invokeLLM requires at least one user/assistant message");
  }

  const resolvedModel = model ?? MODEL_FAST;
  const maxTokens = params.maxTokens ?? params.max_tokens ?? 32768;
  const thinkingBudget = params.thinkingBudget ?? 0;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  const baseParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: resolvedModel,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    ...(system ? { system } : {}),
  };

  if (thinkingBudget > 0) {
    baseParams.thinking = { type: "enabled", budget_tokens: thinkingBudget };
  }

  // response_format json_schema: mapeado para tool-use forçado — exceto quando thinking está
  // habilitado, caso em que a Anthropic não aceita tool_choice forçando uma tool específica
  // (thinking exige tool_choice "auto" ou nenhuma tool forçada). Nesse caso, caímos para
  // instrução de prompt pedindo JSON estrito (equivalente ao response_format json_object).
  if (normalizedResponseFormat?.type === "json_schema") {
    const jsonSchema = normalizedResponseFormat.json_schema;

    if (thinkingBudget > 0) {
      const schemaInstruction = `\n\nResponda SOMENTE com um objeto JSON válido (sem markdown, sem texto antes ou depois) que siga EXATAMENTE este JSON Schema:\n${JSON.stringify(jsonSchema.schema)}`;
      baseParams.system = `${system ?? ""}${schemaInstruction}`;
      const message = await createMessage(client, baseParams);
      return toInvokeResult(message);
    }

    const schemaTool = buildJsonSchemaTool(jsonSchema);
    const message = await createMessage(client, {
      ...baseParams,
      tools: [schemaTool],
      tool_choice: { type: "tool", name: schemaTool.name },
    });
    return toInvokeResult(message, schemaTool.name);
  }

  // Tool use genérico (não usado por nenhum chamador atual, mas preservado no contrato).
  if (tools && tools.length > 0) {
    baseParams.tools = tools.map(toAnthropicTool);
    const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
    const anthropicToolChoice = toAnthropicToolChoice(normalizedToolChoice);
    if (anthropicToolChoice && thinkingBudget === 0) {
      baseParams.tool_choice = anthropicToolChoice;
    }
  }

  const message = await createMessage(client, baseParams);
  return toInvokeResult(message);
}
