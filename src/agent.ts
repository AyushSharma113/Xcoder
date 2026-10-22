import { sendMessage } from "./model/client.js";
import { Message, ModelResponse, SendMessageOptions } from "./model/types.js";
import { filesystemTools } from "./tools/definitions.js";





export interface AgentOptions {
  sendMessageFn?: typeof sendMessage;
  signal?: AbortSignal;
}


export async function runAgentTurn(
    history: Message[],
    options: AgentOptions ={}, 
): Promise<ModelResponse>{
      const sendMessageFn = options.sendMessageFn ?? sendMessage;
    return sendMessageFn(
    history,
    {
      tools: filesystemTools,
      signal: options.signal,
    } satisfies SendMessageOptions,
  );
}