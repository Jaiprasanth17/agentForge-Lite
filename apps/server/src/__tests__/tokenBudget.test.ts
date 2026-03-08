import { describe, it, expect, vi } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  estimateSystemTokens,
  estimateToolSchemaTokens,
  estimateTotalInputTokens,
  summarizeHistory,
  compressChunk,
  compressRetrievalChunks,
  slimToolSchemas,
  applyTokenBudget,
  logBudgetDecision,
  getModelContextLimit,
  getDefaultBudgetConfig,
} from "../lib/tokenBudget";
import type { ChatMessage, ToolSchema } from "../lib/tokenBudget";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 0 for undefined-ish input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates roughly 1 token per 3.5 chars", () => {
    const text = "Hello world, this is a test message for token estimation.";
    const tokens = estimateTokens(text);
    // 57 chars / 3.5 ≈ 16.3 → ceil → 17
    expect(tokens).toBeGreaterThanOrEqual(15);
    expect(tokens).toBeLessThanOrEqual(20);
  });

  it("handles long text", () => {
    const text = "a".repeat(7000);
    const tokens = estimateTokens(text);
    expect(tokens).toBe(2000); // 7000 / 3.5 = 2000
  });
});

describe("estimateMessageTokens", () => {
  it("adds 4 overhead tokens to content estimate", () => {
    const msg: ChatMessage = { role: "user", content: "Hi" };
    const tokens = estimateMessageTokens(msg);
    // "Hi" = 2 chars → ceil(2/3.5) = 1 + 4 overhead = 5
    expect(tokens).toBe(5);
  });
});

describe("estimateSystemTokens", () => {
  it("returns 0 for undefined", () => {
    expect(estimateSystemTokens(undefined)).toBe(0);
  });

  it("estimates system prompt tokens with overhead", () => {
    const tokens = estimateSystemTokens("You are a helpful assistant");
    expect(tokens).toBeGreaterThan(4);
  });
});

describe("estimateToolSchemaTokens", () => {
  it("returns 0 for undefined tools", () => {
    expect(estimateToolSchemaTokens(undefined)).toBe(0);
  });

  it("returns 0 for empty tools array", () => {
    expect(estimateToolSchemaTokens([])).toBe(0);
  });

  it("estimates tokens for tool schemas", () => {
    const tools: ToolSchema[] = [
      {
        type: "function",
        function: {
          name: "webSearch",
          description: "Search the web for information",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      },
    ];
    const tokens = estimateToolSchemaTokens(tools);
    expect(tokens).toBeGreaterThan(10);
  });
});

describe("estimateTotalInputTokens", () => {
  it("sums system + messages + tools + base overhead", () => {
    const system = "You are helpful";
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there, how can I help?" },
    ];
    const total = estimateTotalInputTokens(system, messages, undefined);
    expect(total).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Model context limits
// ---------------------------------------------------------------------------

describe("getModelContextLimit", () => {
  it("returns 128000 for gpt-4o-mini", () => {
    expect(getModelContextLimit("gpt-4o-mini")).toBe(128000);
  });

  it("returns 8192 for gpt-4", () => {
    expect(getModelContextLimit("gpt-4")).toBe(8192);
  });

  it("returns 200000 for claude models", () => {
    expect(getModelContextLimit("claude-3-haiku-20240307")).toBe(200000);
  });

  it("returns 8192 for mock models", () => {
    expect(getModelContextLimit("mock-advanced")).toBe(8192);
  });

  it("returns conservative default for unknown models", () => {
    expect(getModelContextLimit("unknown-model")).toBe(8192);
  });
});

describe("getDefaultBudgetConfig", () => {
  it("returns config with correct thresholds", () => {
    const config = getDefaultBudgetConfig("gpt-4o-mini");
    expect(config.contextLimit).toBe(128000);
    expect(config.softThreshold).toBe(0.85);
    expect(config.hardThreshold).toBe(0.75);
    expect(config.briefModeMaxTokens).toBe(500);
    expect(config.retrievalTopK).toBe(3);
    expect(config.maxTokensPerChunk).toBe(200);
    expect(config.keepRecentTurns).toBe(2);
  });

  it("uses higher maxOutputTokens for large-context models", () => {
    const large = getDefaultBudgetConfig("gpt-4o-mini");
    expect(large.maxOutputTokens).toBe(2048);

    const small = getDefaultBudgetConfig("mock-advanced");
    expect(small.maxOutputTokens).toBe(768);
  });
});

// ---------------------------------------------------------------------------
// History summarization
// ---------------------------------------------------------------------------

describe("summarizeHistory", () => {
  it("returns messages unchanged if fewer than threshold", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const result = summarizeHistory(messages, 2, 15);
    expect(result).toEqual(messages);
  });

  it("summarizes old messages and keeps recent turns", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second answer" },
      { role: "user", content: "Third question" },
      { role: "assistant", content: "Third answer" },
      { role: "user", content: "Fourth question" },
      { role: "assistant", content: "Fourth answer" },
    ];

    const result = summarizeHistory(messages, 2, 15);

    // Should have: 1 summary message + 4 recent messages (2 turns)
    expect(result.length).toBe(5);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("[Conversation summary");
    // Recent turns preserved
    expect(result[3].content).toBe("Fourth question");
    expect(result[4].content).toBe("Fourth answer");
  });

  it("includes bullet points in summary", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "What is AI?" },
      { role: "assistant", content: "AI stands for Artificial Intelligence." },
      { role: "user", content: "How does it work?" },
      { role: "assistant", content: "It uses algorithms and data." },
      { role: "user", content: "Recent question" },
      { role: "assistant", content: "Recent answer" },
    ];

    const result = summarizeHistory(messages, 1, 15);
    expect(result[0].content).toContain("- User: What is AI?");
    expect(result[0].content).toContain("- AI: AI stands for Artificial Intelligence.");
  });

  it("truncates long messages in summary bullets", () => {
    const longContent = "A".repeat(200);
    const messages: ChatMessage[] = [
      { role: "user", content: longContent },
      { role: "assistant", content: "Short reply" },
      { role: "user", content: "Recent" },
      { role: "assistant", content: "Also recent" },
    ];

    const result = summarizeHistory(messages, 1, 15);
    expect(result[0].content).toContain("...");
  });
});

// ---------------------------------------------------------------------------
// Chunk compression
// ---------------------------------------------------------------------------

describe("compressChunk", () => {
  it("returns text unchanged if under limit", () => {
    const text = "Short text.";
    expect(compressChunk(text, 200)).toBe(text);
  });

  it("truncates to first sentences that fit", () => {
    const text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
    const compressed = compressChunk(text, 10); // ~35 chars
    expect(compressed.length).toBeLessThan(text.length);
    expect(compressed).toContain("First sentence.");
  });

  it("handles text with no sentence delimiters", () => {
    const text = "a".repeat(1000);
    const compressed = compressChunk(text, 50);
    expect(compressed.length).toBeLessThanOrEqual(200); // 50 * 3.5 + "..."
  });
});

describe("compressRetrievalChunks", () => {
  it("limits to topK chunks", () => {
    const chunks = [
      { text: "Chunk 1", score: 0.9 },
      { text: "Chunk 2", score: 0.8 },
      { text: "Chunk 3", score: 0.7 },
      { text: "Chunk 4", score: 0.6 },
      { text: "Chunk 5", score: 0.5 },
    ];
    const result = compressRetrievalChunks(chunks, 3, 200);
    expect(result.length).toBe(3);
  });

  it("compresses each chunk to maxTokensPerChunk", () => {
    const longText = "This is a long sentence. ".repeat(100);
    const chunks = [
      { text: longText, score: 0.9 },
    ];
    const result = compressRetrievalChunks(chunks, 3, 20);
    expect(estimateTokens(result[0].text)).toBeLessThanOrEqual(25); // some margin
  });
});

// ---------------------------------------------------------------------------
// Schema slimming
// ---------------------------------------------------------------------------

describe("slimToolSchemas", () => {
  it("shortens descriptions to 60 chars", () => {
    const tools: ToolSchema[] = [
      {
        type: "function",
        function: {
          name: "knowledgeSearch",
          description: "Search the local PDF knowledge base for relevant information with citations and detailed results",
          parameters: {
            type: "object",
            properties: { query: { type: "string" }, topK: { type: "number" } },
            required: ["query"],
          },
        },
      },
    ];

    const slimmed = slimToolSchemas(tools);
    expect(slimmed[0].function.description.length).toBeLessThanOrEqual(60);
  });

  it("keeps only required properties", () => {
    const tools: ToolSchema[] = [
      {
        type: "function",
        function: {
          name: "webSearch",
          description: "Search the web",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
              topK: { type: "number", description: "Number of results" },
            },
            required: ["query"],
          },
        },
      },
    ];

    const slimmed = slimToolSchemas(tools);
    const props = (slimmed[0].function.parameters as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.query).toBeDefined();
    expect(props.topK).toBeUndefined(); // Not in required
  });

  it("strips property descriptions", () => {
    const tools: ToolSchema[] = [
      {
        type: "function",
        function: {
          name: "codeInterpreter",
          description: "Execute code",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "The code to execute in a sandboxed environment" },
            },
            required: ["code"],
          },
        },
      },
    ];

    const slimmed = slimToolSchemas(tools);
    const props = (slimmed[0].function.parameters as Record<string, unknown>).properties as Record<string, unknown>;
    const codeProp = props.code as Record<string, unknown>;
    expect(codeProp.type).toBe("string");
    expect(codeProp.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyTokenBudget (integration)
// ---------------------------------------------------------------------------

describe("applyTokenBudget", () => {
  it("returns no action when under soft threshold", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
    ];
    const result = applyTokenBudget("gpt-4o-mini", "System", messages, undefined, 2048);
    expect(result.decision.applied).toBe(false);
    expect(result.decision.action).toBe("none");
    expect(result.maxTokens).toBe(2048);
  });

  it("applies budget for small context model with large history", () => {
    // mock-advanced has 8192 context limit, soft = 6963
    // Each message ~500 chars = ~143 tokens + 4 overhead = ~147 tokens
    // 20 pairs × 2 × 147 = ~5880 tokens input + 2048 maxTokens = ~7928 > 6963
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `Question ${i}: ${"x".repeat(500)}` });
      messages.push({ role: "assistant", content: `Answer ${i}: ${"y".repeat(500)}` });
    }

    const result = applyTokenBudget(
      "mock-advanced",
      "You are a helpful assistant",
      messages,
      undefined,
      2048
    );

    expect(result.decision.applied).toBe(true);
    expect(result.decision.estimatedAfter).toBeLessThan(result.decision.estimatedBefore);
    // After summarization, messages should be reduced
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it("activates brief mode when context is very tight", () => {
    // Use configOverrides to force a very small context limit so that
    // even after summarization, the total exceeds hardThreshold
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push({ role: "user", content: `Q${i}: ${"x".repeat(200)}` });
      messages.push({ role: "assistant", content: `A${i}: ${"y".repeat(200)}` });
    }

    // With contextLimit=1000, softLimit=850, hardLimit=750
    // After summarization, recent 2 turns ~4*61=244 tokens + summary ~50 + 4096 maxTokens >> 750
    const result = applyTokenBudget("mock-advanced", "System prompt", messages, undefined, 4096, {
      contextLimit: 1000,
      softThreshold: 0.85,
      hardThreshold: 0.75,
    });
    expect(result.decision.applied).toBe(true);
    expect(result.decision.briefMode).toBe(true);
    expect(result.maxTokens).toBe(500);
  });

  it("slims tool schemas when over threshold", () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `Q${i}: ${"x".repeat(500)}` });
      messages.push({ role: "assistant", content: `A${i}: ${"y".repeat(500)}` });
    }

    const tools: ToolSchema[] = [
      {
        type: "function",
        function: {
          name: "knowledgeSearch",
          description: "Search the local PDF knowledge base for relevant information with citations and detailed scoring",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query to find relevant documents" },
              topK: { type: "number", description: "Number of top results to return" },
            },
            required: ["query"],
          },
        },
      },
    ];

    const result = applyTokenBudget("mock-advanced", "System", messages, tools, 2048);
    expect(result.decision.applied).toBe(true);
    // Tool description should be slimmed
    if (result.tools && result.tools.length > 0) {
      expect(result.tools[0].function.description.length).toBeLessThanOrEqual(60);
    }
  });

  it("summarizes history keeping recent turns", () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `Question ${i}: ${"x".repeat(500)}` });
      messages.push({ role: "assistant", content: `Answer ${i}: ${"y".repeat(500)}` });
    }

    const result = applyTokenBudget("mock-advanced", "System", messages, undefined, 2048);
    expect(result.decision.applied).toBe(true);
    // Should have far fewer messages than original
    expect(result.messages.length).toBeLessThan(messages.length);
    // Last messages should be preserved (index 19 = last answer)
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.content).toContain("Answer 19");
  });

  it("accepts config overrides", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
    ];
    const result = applyTokenBudget("mock-advanced", "System", messages, undefined, 2048, {
      softThreshold: 0.01, // Force budget to apply
    });
    expect(result.decision.applied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// logBudgetDecision
// ---------------------------------------------------------------------------

describe("logBudgetDecision", () => {
  it("logs no-adjustment message for unapplied budget", () => {
    const logger = vi.fn();
    logBudgetDecision(
      {
        applied: false,
        action: "none",
        estimatedBefore: 100,
        estimatedAfter: 100,
        effectiveMaxTokens: 2048,
        briefMode: false,
        details: [],
      },
      logger
    );
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toContain("No adjustment needed");
  });

  it("logs all details for applied budget", () => {
    const logger = vi.fn();
    logBudgetDecision(
      {
        applied: true,
        action: "summarized",
        estimatedBefore: 9000,
        estimatedAfter: 5000,
        effectiveMaxTokens: 768,
        briefMode: false,
        details: ["[TokenBudget] Step 1", "[TokenBudget] Step 2"],
      },
      logger
    );
    // Should log each detail + final summary
    expect(logger).toHaveBeenCalledTimes(3);
    expect(logger.mock.calls[2][0]).toContain("9000 -> 5000");
  });
});
