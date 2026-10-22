import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCliSession } from "../index.js";
import { Message, ModelResponse } from "../model/types.js";
import { XcoderModelError } from "../model/errors.js";

describe("Conversation history management", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "mock-openrouter-key";
    process.env.LLM_PROVIDER = "openrouter";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });
  it("stores user and assistant messages in correct alternating order", async () => {
    const inputs = ["Hello", "How are you?", "/exit"];
    let inputIndex = 0;

    const mockTerminal = {
      question: async () => {
        return inputs[inputIndex++] ?? "/exit";
      },
      close: () => {},
    };

    const recordedRequests: Message[][] = [];

    const mockSendMessage = async (messages: Message[]): Promise<ModelResponse> => {
      // Snapshot the messages array sent to the model
      recordedRequests.push([...messages]);
      return {
        content: `Echo: ${messages[messages.length - 1].content}`,
        finishReason: "stop",
      };
    };

    const finalHistory = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    assert.equal(finalHistory.length, 4);
    assert.deepEqual(finalHistory[0], { role: "user", content: "Hello" });
    assert.deepEqual(finalHistory[1], { role: "assistant", content: "Echo: Hello" });
    assert.deepEqual(finalHistory[2], { role: "user", content: "How are you?" });
    assert.deepEqual(finalHistory[3], { role: "assistant", content: "Echo: How are you?" });
  });

  it("includes full conversation context on subsequent turns", async () => {
    const inputs = ["Turn 1", "Turn 2", "Turn 3", "/exit"];
    let inputIndex = 0;

    const mockTerminal = {
      question: async () => inputs[inputIndex++] ?? "/exit",
      close: () => {},
    };

    const turnSnapshots: Message[][] = [];

    const mockSendMessage = async (messages: Message[]): Promise<ModelResponse> => {
      turnSnapshots.push(JSON.parse(JSON.stringify(messages)));
      return {
        content: `Reply to ${messages[messages.length - 1].content}`,
        finishReason: "stop",
      };
    };

    await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    assert.equal(turnSnapshots.length, 3);

    // Turn 1 should receive 1 message (user)
    assert.equal(turnSnapshots[0].length, 1);
    assert.equal(turnSnapshots[0][0].role, "user");
    assert.equal(turnSnapshots[0][0].content, "Turn 1");

    // Turn 2 should receive 3 messages (user, assistant, user)
    assert.equal(turnSnapshots[1].length, 3);
    assert.equal(turnSnapshots[1][0].content, "Turn 1");
    assert.equal(turnSnapshots[1][1].content, "Reply to Turn 1");
    assert.equal(turnSnapshots[1][2].content, "Turn 2");

    // Turn 3 should receive 5 messages (user, assistant, user, assistant, user)
    assert.equal(turnSnapshots[2].length, 5);
    assert.equal(turnSnapshots[2][0].content, "Turn 1");
    assert.equal(turnSnapshots[2][1].content, "Reply to Turn 1");
    assert.equal(turnSnapshots[2][2].content, "Turn 2");
    assert.equal(turnSnapshots[2][3].content, "Reply to Turn 2");
    assert.equal(turnSnapshots[2][4].content, "Turn 3");
  });

  it("rolls back user message on model request failure, leaving history consistent", async () => {
    const inputs = ["Turn 1 (success)", "Turn 2 (fail)", "/exit"];
    let inputIndex = 0;

    const mockTerminal = {
      question: async () => inputs[inputIndex++] ?? "/exit",
      close: () => {},
    };

    let callCount = 0;
    const mockSendMessage = async (messages: Message[]): Promise<ModelResponse> => {
      callCount++;
      if (callCount === 1) {
        return { content: "Success response 1", finishReason: "stop" };
      }
      throw new XcoderModelError({
        message: "Simulated rate limit",
        category: "RATE_LIMIT",
        provider: "openrouter",
        isRetryable: true,
      });
    };

    const finalHistory = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    // The failed Turn 2 user message must NOT be in final history
    assert.equal(finalHistory.length, 2);
    assert.equal(finalHistory[0].content, "Turn 1 (success)");
    assert.equal(finalHistory[1].content, "Success response 1");
  });

  it("allows retrying after a failed request with clean history state", async () => {
    const inputs = [
      "Turn 1",
      "Failed message",
      "Retried message",
      "/exit",
    ];
    let inputIndex = 0;

    const mockTerminal = {
      question: async () => inputs[inputIndex++] ?? "/exit",
      close: () => {},
    };

    let callCount = 0;
    const requestsReceived: Message[][] = [];

    const mockSendMessage = async (messages: Message[]): Promise<ModelResponse> => {
      callCount++;
      requestsReceived.push(JSON.parse(JSON.stringify(messages)));
      if (callCount === 2) {
        throw new XcoderModelError({
          message: "Temporary network failure",
          category: "NETWORK",
          provider: "gemini",
          isRetryable: true,
        });
      }
      return {
        content: `Success response for call #${callCount}`,
        finishReason: "stop",
      };
    };

    const finalHistory = await runCliSession({
      terminal: mockTerminal,
      runAgentTurnFn: mockSendMessage,
    });

    // Call 1: [Turn 1] -> succeeded
    // Call 2: [Turn 1, Success 1, Failed message] -> failed and rolled back
    // Call 3: [Turn 1, Success 1, Retried message] -> succeeded
    assert.equal(requestsReceived.length, 3);
    assert.equal(requestsReceived[2].length, 3);
    assert.equal(requestsReceived[2][0].content, "Turn 1");
    assert.equal(requestsReceived[2][1].content, "Success response for call #1");
    assert.equal(requestsReceived[2][2].content, "Retried message");

    // Final history contains 4 items (2 successful turns)
    assert.equal(finalHistory.length, 4);
    assert.equal(finalHistory[0].content, "Turn 1");
    assert.equal(finalHistory[1].content, "Success response for call #1");
    assert.equal(finalHistory[2].content, "Retried message");
    assert.equal(finalHistory[3].content, "Success response for call #3");
  });
});
