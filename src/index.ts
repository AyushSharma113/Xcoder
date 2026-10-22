import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgentTurn } from "./agent.js";
import { getConfig } from "./config.js";
import { sanitizeMessage, XcoderModelError } from "./model/errors.js";
import type { Message, ModelResponse } from "./model/types.js";


export interface CliSessionOptions {
  terminal?: Interface | {
    question: (query: string, options?: { signal?: AbortSignal }) => Promise<string>;
    close: () => void;
    on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  };
  runAgentTurnFn?: (
    history: Message[],
    options?: { signal?: AbortSignal },
  ) => Promise<ModelResponse>;
  initialHistory?: Message[];
  signal?: AbortSignal;
  provider?: string;
}

export async function runCliSession(options: CliSessionOptions = {}): Promise<Message[]> {
  const terminal =
    options.terminal ??
    createInterface({
      input: stdin,
      output: stdout,
      prompt: "You: ",
    });

  const runAgentTurnFn = options.runAgentTurnFn ?? runAgentTurn;
  const history: Message[] = options.initialHistory
    ? [...options.initialHistory]
    : [];
  const abortController = new AbortController();

  const onSigint = () => {
    console.log("\nGoodbye!");
    abortController.abort();
    terminal.close();
  };

  const onClose = () => {
    abortController.abort();
  };

  if ("on" in terminal && typeof terminal.on === "function") {
    terminal.on("SIGINT", onSigint);
    terminal.on("close", onClose);
  }

  if (options.signal) {
    if (options.signal.aborted) {
      abortController.abort();
    } else {
      options.signal.addEventListener("abort", () => {
        abortController.abort();
      });
    }
  }

  try {
    console.log("\n╭──────────────────────────────╮");
    console.log("│          Xcoder CLI          │");
    console.log("╰──────────────────────────────╯");
    const activeProvider = options.provider ?? getConfig().provider;
    console.log(`Provider: ${activeProvider}`);
    console.log("Type /exit to quit.\n");

    while (!abortController.signal.aborted) {
      let input: string;
      try {
        input = await terminal.question("You: ", {
          signal: abortController.signal,
        });
      } catch (err: unknown) {
        if (
          abortController.signal.aborted ||
          (err as { name?: string })?.name === "AbortError"
        ) {
          break;
        }
        throw err;
      }

      const userInput = input.trim();

      if (!userInput) {
        continue;
      }

      if (userInput.toLowerCase() === "/exit") {
        console.log("Goodbye!");
        break;
      }

      const userMessage: Message = {
        role: "user",
        content: userInput,
      };

      history.push(userMessage);

      try {
        const response = await runAgentTurnFn(history, {
          signal: abortController.signal,
        });

        const assistantMessage: Message = {
          role: "assistant",
          content: response.content,
        };
        history.push(assistantMessage);

        console.log(`\nXcoder: ${response.content}\n`);
      } catch (error: unknown) {
        history.pop();

        if (abortController.signal.aborted) {
          break;
        }

        if (error instanceof XcoderModelError) {
          console.error(
            `\nModel error [${error.category}]: ${error.message}\n`
          );
        } else {
          console.error("\nAn unexpected error occurred.\n");
        }
      }
    }

    return history;
  } finally {
    terminal.close();
  }
}

export async function main(): Promise<void> {
  await runCliSession();
}

const isMain =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));

if (isMain) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error
        ? sanitizeMessage(error.message)
        : "An unexpected error occurred.";
    console.error(`Xcoder failed to start: ${message}`);
    process.exitCode = 1;
  });
}
