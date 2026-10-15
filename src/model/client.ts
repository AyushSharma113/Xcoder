import { getConfig, type Provider } from "../config.js";
import { XcoderModelError, type ErrorCategory } from "./errors.js";
import { geminiAdapter } from "./gemini.js";
import { openrouterAdapter } from "./openrouter.js";
import type {
  Message,
  ModelAdapter,
  ModelResponse,
  SendMessageOptions,
  StreamChunk,
} from "./types.js";

const adapterRegistry: Record<Provider, () => ModelAdapter> = {
  gemini: () => geminiAdapter,
  openrouter: () => openrouterAdapter,
};

export function getAdapter(provider?: Provider): ModelAdapter {
  const targetProvider = provider ?? getConfig().provider;
  const factory = adapterRegistry[targetProvider];
  if (!factory) {
    throw new XcoderModelError({
      message: `Unknown or unsupported provider: "${targetProvider}"`,
      category: "INVALID_REQUEST",
      provider: String(targetProvider),
      isRetryable: false,
    });
  }
  return factory();
}

function normalizeError(error: unknown, provider: string): XcoderModelError {
  if (error instanceof XcoderModelError) {
    return error;
  }

  const rawStatus =
    (error as { status?: number })?.status ??
    (error as { statusCode?: number })?.statusCode;
  const status = typeof rawStatus === "number" ? rawStatus : undefined;

  const rawMessage = error instanceof Error ? error.message : String(error);
  const lowerMsg = rawMessage.toLowerCase();

  let category: ErrorCategory = "UNKNOWN";
  let isRetryable = false;

  if (status === 401 || status === 403) {
    category = "AUTH";
    isRetryable = false;
  } else if (status === 429) {
    category = "RATE_LIMIT";
    isRetryable = true;
  } else if (status && status >= 500) {
    category = "NETWORK";
    isRetryable = true;
  } else if (
    lowerMsg.includes("api key") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("401") ||
    lowerMsg.includes("authentication") ||
    lowerMsg.includes("forbidden")
  ) {
    category = "AUTH";
    isRetryable = false;
  } else if (
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("429") ||
    lowerMsg.includes("too many requests")
  ) {
    category = "RATE_LIMIT";
    isRetryable = true;
  } else if (
    lowerMsg.includes("context length") ||
    lowerMsg.includes("maximum context") ||
    lowerMsg.includes("token limit")
  ) {
    category = "CONTEXT_LENGTH";
    isRetryable = false;
  } else if (
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("econnrefused") ||
    lowerMsg.includes("network") ||
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("enotfound") ||
    lowerMsg.includes("connection aborted")
  ) {
    category = "NETWORK";
    isRetryable = true;
  }

  return new XcoderModelError({
    message: `${provider} error: ${rawMessage}`,
    category,
    provider,
    isRetryable,
    status,
    originalError: error,
  });
}

/**
 * Sends a conversation to the active model provider and awaits the complete response.
 */
export async function sendMessage(
  messages: Message[],
  options?: SendMessageOptions,
  provider?: Provider
): Promise<ModelResponse> {
  const adapter = getAdapter(provider);
  try {
    return await adapter.sendMessage(messages, options);
  } catch (error) {
    throw normalizeError(error, adapter.providerName);
  }
}

/**
 * Streams chunks incrementally from the active model provider.
 */
export async function* streamMessage(
  messages: Message[],
  options?: SendMessageOptions,
  provider?: Provider
): AsyncIterable<StreamChunk> {
  const adapter = getAdapter(provider);

  if (!adapter.streamMessage) {
    // Fallback: wait for full message and yield a single chunk
    const response = await sendMessage(messages, options, provider);
    yield {
      deltaContent: response.content,
      finishReason: response.finishReason,
    };
    return;
  }

  try {
    yield* adapter.streamMessage(messages, options);
  } catch (error) {
    throw normalizeError(error, adapter.providerName);
  }
}