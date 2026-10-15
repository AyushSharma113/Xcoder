import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";
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

let cachedAi: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (cachedAi) return cachedAi;
  const cfg = getConfig().gemini;
  if (!cfg?.apiKey) {
    throw new Error(
      "Gemini API key is missing. Please set GEMINI_API_KEY in your .env file."
    );
  }
  cachedAi = new GoogleGenAI({ apiKey: cfg.apiKey });
  return cachedAi;
}

function formatGeminiTools(tools: ToolDefinition[]): Array<{ functionDeclarations: FunctionDeclaration[] }> {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as FunctionDeclaration["parameters"],
      })),
    },
  ];
}

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function prepareGeminiRequest(
  messages: Message[],
  options?: SendMessageOptions
): { contents: GeminiContent[]; systemInstruction?: string } {
  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");

  const sysInstructionParts = [
    ...(options?.systemInstruction ? [options.systemInstruction] : []),
    ...systemMessages.map((m) => m.content ?? ""),
  ].filter(Boolean);

  const systemInstruction =
    sysInstructionParts.length > 0 ? sysInstructionParts.join("\n\n") : undefined;

  const contents: GeminiContent[] = conversationMessages.map((m) => {
    if (m.role === "assistant") {
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "model",
          parts: m.toolCalls.map((tc) => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          })),
        };
      }
      return {
        role: "model",
        parts: [{ text: m.content ?? "" }],
      };
    }

    if (m.role === "tool") {
      let responsePayload: Record<string, unknown>;
      try {
        responsePayload = m.content ? JSON.parse(m.content) : {};
      } catch {
        responsePayload = { output: m.content };
      }

      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.toolName ?? "tool_result",
              response: responsePayload,
            },
          },
        ],
      };
    }

    // Default "user" role
    return {
      role: "user",
      parts: [{ text: m.content ?? "" }],
    };
  });

  return { contents, systemInstruction };
}

export const geminiAdapter: ModelAdapter = {
  providerName: "gemini",

  async sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<ModelResponse> {
    const ai = getAi();
    const cfg = getConfig().gemini!;
    const { contents, systemInstruction } = prepareGeminiRequest(messages, options);

    const response = await ai.models.generateContent({
      model: cfg.model,
      contents,
      config: {
        systemInstruction,
        tools: options?.tools?.length ? formatGeminiTools(options.tools) : undefined,
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    });

    const rawFunctionCalls = response.functionCalls;
    const toolCalls: ToolCall[] | undefined = rawFunctionCalls
      ?.filter((fc): fc is typeof fc & { name: string } => typeof fc.name === "string" && fc.name.length > 0)
      .map((fc, idx) => ({
        id: `call_${fc.name}_${idx}_${Date.now()}`,
        name: fc.name,
        arguments: (fc.args ?? {}) as Record<string, unknown>,
      }));

    const finishReason: FinishReason =
      toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop";

    return {
      content: response.text ?? "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
    };
  },

  async *streamMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): AsyncIterable<StreamChunk> {
    const ai = getAi();
    const cfg = getConfig().gemini!;
    const { contents, systemInstruction } = prepareGeminiRequest(messages, options);

    const responseStream = await ai.models.generateContentStream({
      model: cfg.model,
      contents,
      config: {
        systemInstruction,
        tools: options?.tools?.length ? formatGeminiTools(options.tools) : undefined,
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    });

    for await (const chunk of responseStream) {
      yield {
        deltaContent: chunk.text ?? undefined,
      };
    }
  },
};