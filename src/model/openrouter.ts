import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getConfig } from "../config.js";
import type {
  FinishReason,
  Message,
  ModelAdapter,
  ModelResponse,
  SendMessageOptions,
  StreamChunk,
  ToolCall,
  ToolDefinition,
} from "./types.js";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const cfg = getConfig().openrouter;
  if (!cfg?.apiKey) {
    throw new Error(
      "OpenRouter API key is missing. Please set OPENROUTER_API_KEY in your .env file."
    );
  }

  cachedClient = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/xcoder",
      "X-Title": "Xcoder CLI",
    },
  });
  return cachedClient;
}

function mapFinishReason(reason: string | null | undefined): FinishReason | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return "stop";
  }
}

function formatTools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function formatMessages(
  messages: Message[],
  systemInstruction?: string
): ChatCompletionMessageParam[] {
  const formatted: ChatCompletionMessageParam[] = [];

  if (systemInstruction) {
    formatted.push({ role: "system", content: systemInstruction });
  }

  for (const m of messages) {
    if (m.role === "system") {
      formatted.push({ role: "system", content: m.content ?? "" });
    } else if (m.role === "user") {
      formatted.push({ role: "user", content: m.content ?? "" });
    } else if (m.role === "assistant") {
      formatted.push({
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.rawArguments ?? JSON.stringify(tc.arguments),
          },
        })),
      });
    } else if (m.role === "tool") {
      formatted.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: m.content ?? "",
      });
    }
  }

  return formatted;
}

export const openrouterAdapter: ModelAdapter = {
  providerName: "openrouter",

  async sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<ModelResponse> {
    const client = getClient();
    const cfg = getConfig().openrouter!;

    const completion = await client.chat.completions.create(
      {
        model: cfg.model,
        messages: formatMessages(messages, options?.systemInstruction),
        tools: options?.tools?.length ? formatTools(options.tools) : undefined,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      },
      { signal: options?.signal }
    );

    const choice = completion.choices[0];
    const message = choice?.message;

    const toolCalls: ToolCall[] | undefined = message?.tool_calls
      ?.filter(
        (tc): tc is typeof tc & { type: "function"; function: { name: string; arguments: string } } =>
          tc.type === "function" && "function" in tc && Boolean(tc.function)
      )
      ?.map((tc) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          parsedArgs = { _raw: tc.function.arguments };
        }
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
          rawArguments: tc.function.arguments,
        };
      });

    return {
      content: message?.content ?? "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: mapFinishReason(choice?.finish_reason),
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    };
  },

  async *streamMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): AsyncIterable<StreamChunk> {
    const client = getClient();
    const cfg = getConfig().openrouter!;

    const stream = await client.chat.completions.create(
      {
        model: cfg.model,
        messages: formatMessages(messages, options?.systemInstruction),
        tools: options?.tools?.length ? formatTools(options.tools) : undefined,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: true,
      },
      { signal: options?.signal }
    );

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      const tcDelta = delta?.tool_calls?.[0];
      const functionDelta =
        tcDelta && "function" in tcDelta ? tcDelta.function : undefined;

      yield {
        deltaContent: delta?.content ?? undefined,
        deltaToolCall: tcDelta
          ? {
              id: tcDelta.id,
              name: functionDelta?.name,
              rawArguments: functionDelta?.arguments,
              index: tcDelta.index,
            }
          : undefined,
        finishReason: choice.finish_reason
          ? mapFinishReason(choice.finish_reason)
          : undefined,
      };
    }
  },
};