import { sendMessage } from "./model/client.js";

async function main(): Promise<void> {
  console.log("Testing model connection...");
  try {
    const reply = await sendMessage([
      {
        role: "user",
        content: "Reply with 'Xcoder connection successful' and nothing else.",
      },
    ]);
    console.log(`Response: ${reply.content}`);
    if (reply.usage) {
      console.log(
        `Tokens used: ${reply.usage.totalTokens} (prompt: ${reply.usage.promptTokens}, completion: ${reply.usage.completionTokens})`
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Connection failed: ${message}`);
    process.exit(1);
  }
}

void main();