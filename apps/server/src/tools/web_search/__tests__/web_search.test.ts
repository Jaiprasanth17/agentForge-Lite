import { describe, it, expect, vi } from "vitest";

// Test helpers that import registry/tools after resetting module cache
async function loadRegistryAndTools() {
  vi.resetModules();
  const { TOOL_REGISTRY, invokeTool } = await import("../../registry");
  // import the web_search entrypoint to register the tools
  await import("../index");
  return { TOOL_REGISTRY, invokeTool };
}

describe("search_web tool registration", () => {
  it("is registered and has a handler", async () => {
    const { TOOL_REGISTRY } = await loadRegistryAndTools();
    expect(TOOL_REGISTRY.search_web).toBeDefined();
    expect(typeof TOOL_REGISTRY.search_web.handler).toBe("function");
  });
});

describe("search_web production error handling", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it("bubbles up productionSearch errors when an API key is set", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    // mock the webSearchTool module before loading
    vi.mock("../../webSearchTool", async () => {
      const actual = await vi.importActual<typeof import("../../webSearchTool")>(
        "../../webSearchTool"
      );
      return {
        ...actual,
        search: vi.fn().mockRejectedValue(new Error("invalid key")),
        isWebSearchEnabled: () => true,
      };
    });

    const { TOOL_REGISTRY, invokeTool } = await loadRegistryAndTools();

    const ctx = { logger: console.log, knowledge: null as any };
    const res = await invokeTool(ctx, "search_web", { queries: ["foo"] });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("invalid key");
    // handler returns SEARCH_FAILED when web search fails internally
    expect(res.code).toBe("SEARCH_FAILED");
  });
});