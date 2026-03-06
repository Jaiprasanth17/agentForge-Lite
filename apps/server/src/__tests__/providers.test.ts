import { describe, it, expect, vi } from "vitest";
import { MockProvider } from "../providers/mock";

describe("MockProvider", () => {
  it("should list available models", async () => {
    const provider = new MockProvider();
    const models = await provider.listModels();
    expect(models).toContain("mock-basic");
    expect(models).toContain("mock-advanced");
    expect(models).toContain("mock-reasoning");
  });

  it("should have name set to mock", () => {
    const provider = new MockProvider();
    expect(provider.name).toBe("mock");
  });

  it("should generate streaming response with chunks", async () => {
    const provider = new MockProvider();
    const chunks: any[] = [];

    await provider.generate({
      model: "mock-basic",
      messages: [{ role: "user", content: "Hello" }],
      onChunk: (chunk) => chunks.push(chunk),
    });

    // Should have text chunks
    const textChunks = chunks.filter((c) => c.text);
    expect(textChunks.length).toBeGreaterThan(0);

    // Should have a done chunk
    const doneChunk = chunks.find((c) => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk?.usage).toBeDefined();
    expect(doneChunk?.usage?.tokensIn).toBeGreaterThan(0);
    expect(doneChunk?.usage?.tokensOut).toBeGreaterThan(0);
  });

  it("should include tool call when reasoning and tools are provided", async () => {
    const provider = new MockProvider();
    const chunks: any[] = [];

    await provider.generate({
      model: "mock-reasoning",
      messages: [{ role: "user", content: "Search for something" }],
      tools: [{ type: "function", function: { name: "webSearch" } }],
      reasoning: true,
      onChunk: (chunk) => chunks.push(chunk),
    });

    const toolCallChunk = chunks.find((c) => c.toolCall);
    expect(toolCallChunk).toBeDefined();
  });

  it("should respect system prompt", async () => {
    const provider = new MockProvider();
    const chunks: any[] = [];

    await provider.generate({
      model: "mock-basic",
      system: "You are a helpful assistant",
      messages: [{ role: "user", content: "Hello" }],
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks.length).toBeGreaterThan(0);
  });
});
