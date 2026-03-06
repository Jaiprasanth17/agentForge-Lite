import { LLMProvider, ProviderResponseChunk } from "./types";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
  }

  async listModels(): Promise<string[]> {
    return ["claude-3-haiku-20240307", "claude-3-sonnet-20240229", "claude-3-5-sonnet-20241022"];
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
    if (!this.apiKey) {
      opts.onChunk?.({ text: "Error: ANTHROPIC_API_KEY not configured." });
      opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
      return;
    }

    // Filter out system messages; Anthropic uses a top-level system param
    const filteredMessages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "tool" ? ("user" as const) : m.role,
        content: m.content,
      }));

    const body: any = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      stream: true,
      messages: filteredMessages,
    };

    if (opts.system) {
      body.system = opts.system;
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.topP !== undefined) body.top_p = opts.topP;

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.text();
        opts.onChunk?.({ text: `Error: ${err}` });
        opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let tokensOut = 0;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            if (json.type === "content_block_delta" && json.delta?.text) {
              tokensOut++;
              opts.onChunk?.({ text: json.delta.text });
            }
            if (json.type === "message_delta" && json.usage) {
              opts.onChunk?.({
                done: true,
                usage: {
                  tokensIn: json.usage.input_tokens || 0,
                  tokensOut: json.usage.output_tokens || 0,
                },
              });
            }
          } catch {
            // skip malformed
          }
        }
      }

      opts.onChunk?.({ done: true, usage: { tokensIn: filteredMessages.length * 10, tokensOut } });
    } catch (err: any) {
      opts.onChunk?.({ text: `Error: ${err.message}` });
      opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
    }
  }
}
