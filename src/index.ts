import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { sendMessage } from "./model/client.js";
import { getConfig } from "./config.js";
import { XcoderModelError } from "./model/errors.js";

async function main(): Promise<void> {
  const terminal = createInterface({
    input: stdin,
    output: stdout,
    prompt: "You: ",
  });

   terminal.on("SIGINT", () => {
    console.log("\nGoodbye!");
    terminal.close();
    process.exit(0);
  });
  
  try {
    console.log("\n╭──────────────────────────────╮");
    console.log("│          Xcoder CLI          │");
    console.log("╰──────────────────────────────╯");
    console.log(`Provider: ${getConfig().provider}`);
    console.log("Type /exit to quit.\n");

    while (true) {
      const input = await terminal.question("You: ");
      const userInput = input.trim();

      if (!userInput) {
        continue;
      }

      if (userInput.toLowerCase() === "/exit") {
        console.log("Goodbye!");
        break;
      }

      try {
        const response = await sendMessage([
          {
            role: "user",
            content: userInput,
          },
        ]);

        console.log(`\nXcoder: ${response.content}\n`);
      } catch (error: unknown) {
        if (error instanceof XcoderModelError) {
          console.error(
            `\nModel error [${error.category}]: ${error.message}\n`
          );
        } else {
          console.error("\nAn unexpected error occurred.\n");
        }
      }
    }
  } finally {
    terminal.close();
  }
}

// process.on("SIGINT", () => {
//   console.log("\nGoodbye!");
//   process.exit(0);
// });

void main().catch(() => {
  console.error("Xcoder failed to start.");
  process.exitCode = 1;
});