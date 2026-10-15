import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getConfig, resetConfig } from "../config.js";

describe("Provider configuration and isolation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  it("defaults to openrouter provider when LLM_PROVIDER is not specified", () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const config = getConfig();
    assert.equal(config.provider, "openrouter");
  });

  it("selects gemini when LLM_PROVIDER is set to gemini", () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const config = getConfig();
    assert.equal(config.provider, "gemini");
    assert.equal(config.gemini?.apiKey, "test-gemini-key");
    assert.equal(config.gemini?.model, "gemini-2.5-flash");
  });

  it("throws clear error when LLM_PROVIDER is invalid", () => {
    process.env.LLM_PROVIDER = "unsupported-provider";
    assert.throws(
      () => getConfig(),
      /Invalid LLM_PROVIDER: "unsupported-provider"\. Must be "gemini" or "openrouter"\./
    );
  });

  it("provider isolation: missing GEMINI_API_KEY does not break openrouter", () => {
    process.env.LLM_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    // GEMINI_API_KEY is deliberately unset
    const config = getConfig();
    assert.equal(config.provider, "openrouter");
    assert.equal(config.openrouter?.apiKey, "test-openrouter-key");
    assert.equal(config.openrouter?.model, "openai/gpt-4o-mini");
    assert.equal(config.gemini, undefined);
  });

  it("provider isolation: missing OPENROUTER_API_KEY does not break gemini", () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    // OPENROUTER_API_KEY is deliberately unset
    const config = getConfig();
    assert.equal(config.provider, "gemini");
    assert.equal(config.gemini?.apiKey, "test-gemini-key");
    assert.equal(config.openrouter, undefined);
  });

  it("throws clear error when active openrouter provider lacks credentials", () => {
    process.env.LLM_PROVIDER = "openrouter";
    // OPENROUTER_API_KEY is missing
    assert.throws(
      () => getConfig(),
      /Missing required environment variable: OPENROUTER_API_KEY\. Please set it in your \.env file for the "openrouter" provider\./
    );
  });

  it("throws clear error when active gemini provider lacks credentials", () => {
    process.env.LLM_PROVIDER = "gemini";
    // GEMINI_API_KEY is missing
    assert.throws(
      () => getConfig(),
      /Missing required environment variable: GEMINI_API_KEY\. Please set it in your \.env file for the "gemini" provider\./
    );
  });

  it("normalizes OPENROUTER_BASE_URL by removing trailing slashes", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = "https://custom.openrouter.ai/api/v1///";
    const config = getConfig();
    assert.equal(config.openrouter?.baseURL, "https://custom.openrouter.ai/api/v1");
  });

  it("throws error for malformed OPENROUTER_BASE_URL", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = "not-a-valid-url";
    assert.throws(
      () => getConfig(),
      /Invalid URL provided for OPENROUTER_BASE_URL/
    );
  });
});
