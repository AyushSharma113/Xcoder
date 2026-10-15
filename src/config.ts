export type Provider = "gemini" | "openrouter";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseURL: string;
}

export interface Config {
  provider: Provider;
  gemini?: GeminiConfig;
  openrouter?: OpenRouterConfig;
}

function getEnv(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function requireEnv(key: string, provider: Provider): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Please set it in your .env file for the "${provider}" provider.`
    );
  }
  return value;
}

function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`Invalid URL provided for OPENROUTER_BASE_URL: "${urlStr}"`);
  }
}

function parseGeminiConfig(strict: boolean): GeminiConfig | undefined {
  const apiKey = strict
    ? requireEnv("GEMINI_API_KEY", "gemini")
    : getEnv("GEMINI_API_KEY");

  if (!apiKey) return undefined;
  const model = getEnv("GEMINI_MODEL") ?? "gemini-2.5-flash";
  return { apiKey, model };
}

function parseOpenRouterConfig(strict: boolean): OpenRouterConfig | undefined {
  const apiKey = strict
    ? requireEnv("OPENROUTER_API_KEY", "openrouter")
    : getEnv("OPENROUTER_API_KEY");

  if (!apiKey) return undefined;
  const model = getEnv("OPENROUTER_MODEL") ?? "openai/gpt-4o-mini";
  const rawBaseUrl = getEnv("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
  const baseURL = normalizeUrl(rawBaseUrl);
  return { apiKey, model, baseURL };
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const rawProvider = (getEnv("LLM_PROVIDER") ?? "openrouter").toLowerCase();
  if (rawProvider !== "gemini" && rawProvider !== "openrouter") {
    throw new Error(
      `Invalid LLM_PROVIDER: "${rawProvider}". Must be "gemini" or "openrouter".`
    );
  }

  const provider = rawProvider as Provider;

  cachedConfig = {
    provider,
    gemini: parseGeminiConfig(provider === "gemini"),
    openrouter: parseOpenRouterConfig(provider === "openrouter"),
  };

  return cachedConfig;
}

/**
 * Resets configuration cache (useful for testing or dynamic provider switching).
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Convenience accessor for backwards compatibility with lazy evaluation.
 */
export const config: Config = {
  get provider() {
    return getConfig().provider;
  },
  get gemini() {
    return getConfig().gemini;
  },
  get openrouter() {
    return getConfig().openrouter;
  },
} as Config;