import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { sendMessage } from "./model/client.js";
import { getConfig } from "./config.js";
import { XcoderModelError } from "./model/errors.js";
import { Message } from "./model/types.js";

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
  

  const history: Message[] = [];
  
  
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



      const userMessage: Message = {
        role: "user",
        content: userInput
      }

      history.push(userMessage);
      

      try {
        const response = await sendMessage(history)


        const assistantMessage: Message = {
          role: "assistant",
          content: response.content
        }
        
        
        
        console.log(`\nXcoder: ${response.content}\n`);
      } catch (error: unknown) {

        history.pop();
        
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


void main().catch(() => {
  console.error("Xcoder failed to start.");
  process.exitCode = 1;
});