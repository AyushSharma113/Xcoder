
import test from "node:test";
import assert from "node:assert/strict";

import { runAgentTurn } from "../agent.js";
import type { Message, ModelResponse } from "../model/types.js";

test("passes filesystem tool definitions to the model", async () => {
  let capturedMessages: Message[] | undefined;
  let capturedOptions: {
    tools?: Array<{ name: string }>;
    signal?: AbortSignal;
  } | undefined;

  const mockResponse: ModelResponse = {
    content: "I can inspect the repository.",
    finishReason: "stop",
  };

  const result = await runAgentTurn(
    [{ role: "user", content: "Inspect this project." }],
    {
      sendMessageFn: async (messages, options) => {
        capturedMessages = messages;
        capturedOptions = options;
        return mockResponse;
      },
    },
  );

  assert.equal(capturedMessages?.[0]?.content, "Inspect this project.");
  assert.deepEqual(
    capturedOptions?.tools?.map((tool) => tool.name),
    ["list_files", "read_file", "search_files"],
  );
  assert.equal(result, mockResponse);
});
