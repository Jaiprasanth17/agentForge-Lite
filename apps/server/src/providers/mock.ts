import { LLMProvider, ProviderResponseChunk } from "./types";

const MOCK_RESPONSES = [
  "I'm a mock AI agent. I can help you with various tasks! What would you like to know?",
  "That's an interesting question. Let me think about it... Based on my analysis, I would recommend breaking this into smaller steps.",
  "I've processed your request. Here are my findings:\n\n1. The data suggests a positive trend\n2. Key metrics are within expected ranges\n3. I recommend monitoring closely for the next 24 hours",
  "Great question! Here's what I found:\n\n- **Performance**: Optimal across all dimensions\n- **Reliability**: 99.9% uptime achieved\n- **Scalability**: Ready for 10x growth\n\nWould you like me to dive deeper into any of these areas?",
  "I've analyzed the situation and here's my assessment:\n\nThe current approach is solid, but there are opportunities for optimization. Consider implementing caching at the API layer and using batch processing for large datasets.",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockProvider implements LLMProvider {
  name = "mock";

  async listModels(): Promise<string[]> {
    return ["mock-basic", "mock-advanced", "mock-reasoning"];
  }

  async generate(opts: {
    model: string;
    system?: string;
    messages: { role: "user" | "assistant" | "system" | "tool"; content: string }[];
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    reasoning?: boolean;
    onChunk?: (c: ProviderResponseChunk) => void;
  }): Promise<void> {
    const response = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
    const words = response.split(" ");
    let tokensOut = 0;

    // Simulate tool call if tools are provided and the model is reasoning
    if (opts.tools && opts.tools.length > 0 && opts.reasoning) {
      opts.onChunk?.({
        toolCall: {
          id: `call_${Date.now()}`,
          name: "webSearch",
          arguments: JSON.stringify({ query: "latest information" }),
        },
      });
      await sleep(200);
    }

    for (const word of words) {
      tokensOut++;
      opts.onChunk?.({ text: word + " " });
      await sleep(30 + Math.random() * 50);
    }

    opts.onChunk?.({
      done: true,
      usage: { tokensIn: opts.messages.length * 10, tokensOut },
    });
  }
}
