import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeMessage, XcoderModelError } from "../model/errors.js";
import { normalizeError } from "../model/client.js";

describe("Error handling and secret sanitization", () => {
  describe("sanitizeMessage", () => {
    it("redacts standard OpenAI API keys", () => {
      const raw = "Failed to authenticate with sk-abcdef12345678901234567890";
      const sanitized = sanitizeMessage(raw);
      assert.equal(
        sanitized,
        "Failed to authenticate with [REDACTED_API_KEY]"
      );
      assert.ok(!sanitized.includes("sk-abcdef"));
    });

    it("redacts OpenRouter API keys", () => {
      const raw = "Error: invalid key sk-or-v1-abcdef1234567890abcdef1234567890 in header";
      const sanitized = sanitizeMessage(raw);
      assert.equal(
        sanitized,
        "Error: invalid key [REDACTED_API_KEY] in header"
      );
      assert.ok(!sanitized.includes("sk-or-v1"));
    });

    it("redacts Google Gemini API keys", () => {
      const raw = "Request failed for AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q";
      const sanitized = sanitizeMessage(raw);
      assert.equal(
        sanitized,
        "Request failed for [REDACTED_API_KEY]"
      );
      assert.ok(!sanitized.includes("AIzaSy"));
    });

    it("redacts query parameter API keys", () => {
      const raw = "URL: https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSySecret12345678901234567890123&alt=json";
      const sanitized = sanitizeMessage(raw);
      assert.ok(sanitized.includes("key=[REDACTED]"));
      assert.ok(!sanitized.includes("AIzaSySecret"));
    });

    it("redacts Bearer tokens", () => {
      const raw = "Authorization: Bearer secret-bearer-token-12345.xyz";
      const sanitized = sanitizeMessage(raw);
      assert.equal(sanitized, "Authorization: Bearer [REDACTED]");
      assert.ok(!sanitized.includes("secret-bearer-token"));
    });
  });

  describe("XcoderModelError", () => {
    it("creates an instance preserving Error prototype and attributes", () => {
      const err = new XcoderModelError({
        message: "Authentication failed with key sk-1234567890123456789012",
        category: "AUTH",
        provider: "openrouter",
        isRetryable: false,
        status: 401,
      });

      assert.ok(err instanceof Error);
      assert.ok(err instanceof XcoderModelError);
      assert.equal(err.name, "XcoderModelError");
      assert.equal(err.category, "AUTH");
      assert.equal(err.provider, "openrouter");
      assert.equal(err.isRetryable, false);
      assert.equal(err.status, 401);
      assert.equal(
        err.message,
        "Authentication failed with key [REDACTED_API_KEY]"
      );
    });
  });

  describe("normalizeError", () => {
    it("returns existing XcoderModelError without re-wrapping", () => {
      const existing = new XcoderModelError({
        message: "Already normalized",
        category: "RATE_LIMIT",
        provider: "gemini",
        isRetryable: true,
      });

      const normalized = normalizeError(existing, "gemini");
      assert.equal(normalized, existing);
    });

    it("maps HTTP 401 status to AUTH category and non-retryable", () => {
      const error = { status: 401, message: "Unauthorized request" };
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "AUTH");
      assert.equal(result.isRetryable, false);
      assert.equal(result.status, 401);
    });

    it("maps HTTP 403 status to AUTH category and non-retryable", () => {
      const error = { status: 403, message: "Forbidden access" };
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "AUTH");
      assert.equal(result.isRetryable, false);
      assert.equal(result.status, 403);
    });

    it("maps HTTP 429 status to RATE_LIMIT category and retryable", () => {
      const error = { status: 429, message: "Rate limit reached" };
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "RATE_LIMIT");
      assert.equal(result.isRetryable, true);
      assert.equal(result.status, 429);
    });

    it("maps HTTP 500+ status to NETWORK category and retryable", () => {
      const error = { status: 503, message: "Service Unavailable" };
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "NETWORK");
      assert.equal(result.isRetryable, true);
      assert.equal(result.status, 503);
    });

    it("maps HTTP 400 to INVALID_REQUEST category and non-retryable", () => {
      const error = { status: 400, message: "Bad Request" };
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "INVALID_REQUEST");
      assert.equal(result.isRetryable, false);
      assert.equal(result.status, 400);
    });

    it("maps message keywords like 'context length' to CONTEXT_LENGTH", () => {
      const error = new Error("This model's maximum context length is 8192 tokens");
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "CONTEXT_LENGTH");
      assert.equal(result.isRetryable, false);
    });

    it("maps network connection failures to NETWORK and retryable", () => {
      const error = new Error("fetch failed: ECONNREFUSED");
      const result = normalizeError(error, "gemini");
      assert.equal(result.category, "NETWORK");
      assert.equal(result.isRetryable, true);
    });

    it("maps aborted errors to NETWORK and retryable", () => {
      const error = new Error("Request was aborted");
      const result = normalizeError(error, "openrouter");
      assert.equal(result.category, "NETWORK");
      assert.equal(result.isRetryable, true);
    });

    it("sanitizes any secrets contained in the original error message", () => {
      const error = new Error("Invalid Bearer secret-token-xyz");
      const result = normalizeError(error, "openrouter");
      assert.ok(!result.message.includes("secret-token-xyz"));
      assert.ok(result.message.includes("Bearer [REDACTED]"));
    });
  });
});
