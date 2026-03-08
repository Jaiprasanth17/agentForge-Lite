import { LLMProvider, ProviderResponseChunk } from "./types";

/**
 * Accumulator for OpenAI streaming tool call deltas.
 * OpenAI sends tool calls in fragments across multiple SSE chunks:
 *  - First chunk: { index, id, type, function: { name, arguments: "" } }
 *  - Subsequent chunks: { index, function: { arguments: "<partial>" } }
 * We accumulate them here and only emit complete tool calls when the stream ends
 * or when the model switches to text content (signaling tool calls are done).
 */
interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

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
      stream_options: { include_usage: true },
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
        const errMsg = `OpenAI API error (${resp.status}): ${err}`;
        console.error("[OpenAI]", errMsg);
        opts.onChunk?.({ text: `Error: ${errMsg}` });
        opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        console.error("[OpenAI] No response body");
        opts.onChunk?.({ text: "Error: No response body from OpenAI" });
        opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
        return;
      }

      const decoder = new TextDecoder();
      let tokensOut = 0;
      let buffer = "";

      // Accumulate tool call deltas by index
      const pendingToolCalls: Map<number, PendingToolCall> = new Map();
      let toolCallsEmitted = false;

      while (true) {
        try {
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
              const finishReason = json.choices?.[0]?.finish_reason;

              // Accumulate tool call deltas
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!pendingToolCalls.has(idx)) {
                    // First chunk for this tool call - has id and function name
                    pendingToolCalls.set(idx, {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      name: tc.function?.name || "",
                      arguments: tc.function?.arguments || "",
                    });
                  } else {
                    // Subsequent chunks - append argument fragments
                    const existing = pendingToolCalls.get(idx)!;
                    if (tc.function?.name) {
                      existing.name += tc.function.name;
                    }
                    if (tc.function?.arguments) {
                      existing.arguments += tc.function.arguments;
                    }
                  }
                }
              }

              // When finish_reason is "tool_calls" or "stop", emit accumulated tool calls
              if (finishReason && !toolCallsEmitted && pendingToolCalls.size > 0) {
                toolCallsEmitted = true;
                // Emit all accumulated tool calls as complete objects
                const sorted = [...pendingToolCalls.entries()].sort((a, b) => a[0] - b[0]);
                for (const [, tc] of sorted) {
                  opts.onChunk?.({
                    toolCall: {
                      id: tc.id,
                      name: tc.name,
                      arguments: tc.arguments,
                    },
                  });
                }
                pendingToolCalls.clear();
              }

              // Stream text content
              if (delta?.content) {
                tokensOut++;
                opts.onChunk?.({ text: delta.content });
              }

              // Usage info (from stream_options: include_usage)
              if (json.usage) {
                opts.onChunk?.({
                  done: true,
                  usage: {
                    tokensIn: json.usage.prompt_tokens || 0,
                    tokensOut: json.usage.completion_tokens || 0,
                  },
                });
              }
            } catch (parseErr) {
              // skip malformed chunks - don't log these as they're frequent
            }
          }
        } catch (streamErr: any) {
          console.error("[OpenAI] Stream error:", streamErr.message);
          opts.onChunk?.({ text: `Stream error: ${streamErr.message}` });
          opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
          return;
        }
      }

      // Safety net: emit any remaining tool calls that weren't emitted
      // (e.g. if stream ended without a finish_reason chunk)
      if (!toolCallsEmitted && pendingToolCalls.size > 0) {
        const sorted = [...pendingToolCalls.entries()].sort((a, b) => a[0] - b[0]);
        for (const [, tc] of sorted) {
          opts.onChunk?.({
            toolCall: {
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            },
          });
        }
      }

      opts.onChunk?.({ done: true, usage: { tokensIn: messages.length * 10, tokensOut } });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[OpenAI] Fatal error:", msg, err.code);
      opts.onChunk?.({ text: `Error: ${msg}` });
      opts.onChunk?.({ done: true, usage: { tokensIn: 0, tokensOut: 0 } });
    }
  }
}
