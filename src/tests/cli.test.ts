import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCliSession } from "../index.js";
import { Message, ModelResponse } from "../model/types.js";
import { XcoderModelError } from "../model/errors.js";

describe("CLI interaction and lifecycle", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "mock-openrouter-key";
    process.env.LLM_PROVIDER = "openrouter";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });
  it("exits immediately when user inputs /exit", async () => {
    let closed = false;
    const mockTerminal = {
      question: async () => "/exit",
      close: () => {
        closed = true;
      },
    };

    let sendCalled = false;
    const mockSendMessage = async (): Promise<ModelResponse> => {
      sendCalled = true;
      return { content: "Should not be called", finishReason: "stop" };
    };

    const history = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    assert.equal(history.length, 0);
    assert.equal(sendCalled, false);
    assert.equal(closed, true);
  });

  it("exits cleanly with uppercase /EXIT and whitespace around command", async () => {
    let closed = false;
    const mockTerminal = {
      question: async () => "  /EXIT  ",
      close: () => {
        closed = true;
      },
    };

    const history = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: async () => ({ content: "", finishReason: "stop" }),
    });

    assert.equal(history.length, 0);
    assert.equal(closed, true);
  });

  it("skips empty and whitespace-only input lines without calling model", async () => {
    const inputs = ["", "   ", "Valid query", "/exit"];
    let inputIndex = 0;
    let sendCount = 0;

    const mockTerminal = {
      question: async () => inputs[inputIndex++] ?? "/exit",
      close: () => {},
    };

    const mockSendMessage = async (messages: Message[]): Promise<ModelResponse> => {
      sendCount++;
      return { content: `Answer for ${messages[0].content}`, finishReason: "stop" };
    };

    const history = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    // Only 1 model call occurred
    assert.equal(sendCount, 1);
    assert.equal(history.length, 2);
    assert.equal(history[0].content, "Valid query");
    assert.equal(history[1].content, "Answer for Valid query");
  });

  it("terminates cleanly when abort signal is triggered", async () => {
    const ac = new AbortController();
    let closed = false;

    const mockTerminal = {
      question: async (_query: string, options?: { signal?: AbortSignal }) => {
        if (options?.signal?.aborted) {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          throw err;
        }
        // Simulate aborting before user answers
        ac.abort();
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        throw err;
      },
      close: () => {
        closed = true;
      },
    };

    const history = await runCliSession({
      terminal: mockTerminal,
      signal: ac.signal,
    });

    assert.equal(history.length, 0);
    assert.equal(closed, true);
  });

  it("handles non-XcoderModelError gracefully and recovers for subsequent inputs", async () => {
    const inputs = ["Trigger generic error", "Second query", "/exit"];
    let inputIndex = 0;

    const mockTerminal = {
      question: async () => inputs[inputIndex++] ?? "/exit",
      close: () => {},
    };

    let callCount = 0;
    const mockSendMessage = async (): Promise<ModelResponse> => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Generic unexpected runtime error");
      }
      return { content: "Recovered successfully", finishReason: "stop" };
    };

    const history = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    assert.equal(history.length, 2);
    assert.equal(history[0].content, "Second query");
    assert.equal(history[1].content, "Recovered successfully");
  });
});
