import { LLMProvider, ProviderResponseChunk } from "./types";

export class OpenAIProvider implements LLMProvider {
  name = "openai";

  private get apiKey(): string {
    return process.env.OPENAI_API_KEY || "";
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return ["gpt-4o-mini", "gpt-4o", "o3-mini"];
    try {
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!resp.ok) return ["gpt-4o-mini", "gpt-4o", "o3-mini"];
      const data = (await resp.json()) as { data: { id: string }[] };
      const chatModels = data.data
        .filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o"))
        .map((m) => m.id)
        .sort();
      return chatModels.length > 0 ? chatModels : ["gpt-4o-mini", "gpt-4o", "o3-mini"];
    } catch {
      return ["gpt-4o-mini", "gpt-4o", "o3-mini"];
    }
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
      opts.onChunk?.({ text: "Error: OPENAI_API_KEY not configured." });
      opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
      return;
    }

    const messages: any[] = [];
    if (opts.system) {
      messages.push({ role: "system", content: opts.system });
    }
    messages.push(...opts.messages);

    const body: any = {
      model: opts.model,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2048,
      top_p: opts.topP ?? 1,
    };

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      body.tool_choice = "auto";
    }

    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
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
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) {
              tokensOut++;
              opts.onChunk?.({ text: delta.content });
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                opts.onChunk?.({ toolCall: tc });
              }
            }
            if (json.usage) {
              opts.onChunk?.({
                done: true,
                usage: {
                  tokensIn: json.usage.prompt_tokens || 0,
                  tokensOut: json.usage.completion_tokens || 0,
                },
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      opts.onChunk?.({ done: true, usage: { tokensIn: messages.length * 10, tokensOut } });
    } catch (err: any) {
      opts.onChunk?.({ text: `Error: ${err.message}` });
      opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
    }
  }
}
