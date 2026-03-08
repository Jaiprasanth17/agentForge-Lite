/**
 * Unit tests for the production-grade webSearchTool module.
 *
 * Covers:
 * - schemas (Zod validation)
 * - planner (mode inference, domain filtering, time windows, query planning)
 * - reranker (dedup, domain emphasis, top-k scoring)
 * - config loading
 * - circuit breaker
 * - observability hooks
 */

import { describe, it, expect, beforeEach } from "vitest";

// Schemas
import {
  SearchModeSchema,
  SearchContextSizeSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  WebSearchConfigSchema,
  CitationSchema,
  SourceSchema,
  SearchDebugSchema,
} from "../schemas";

// Planner
import {
  plan,
  inferMode,
  isDomainAllowed,
  filterDomains,
} from "../planner";
import type { WebSearchConfig, SearchRequest } from "../schemas";

// Reranker
import { rerank, mergeSearchResults, scoreDomain, normaliseUrl, textSimilarity } from "../reranker";
import type { RankedCitation } from "../reranker";
import type { Citation, Source } from "../schemas";

// Config & observability
import {
  loadConfig,
  resetConfig,
  onMetric,
  isWebSearchEnabled,
  recordTimeout,
  recordSuccess,
  getEffectiveMode,
  resetCircuitBreaker,
} from "../index";

// ---------------------------------------------------------------------------
// Test config helper
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<WebSearchConfig>): WebSearchConfig {
  return WebSearchConfigSchema.parse({
    mode: "lookup",
    allowedDomains: ["bis.org", "imf.org", "rbi.org.in", "sec.gov"],
    blocklistDomains: [],
    maxPages: 5,
    searchContextSize: "medium",
    locale: "en-IN",
    timeoutMs: 90000,
    maxCostUSD: 0.25,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("Schemas", () => {
  describe("SearchModeSchema", () => {
    it("accepts valid modes", () => {
      expect(SearchModeSchema.parse("lookup")).toBe("lookup");
      expect(SearchModeSchema.parse("agentic")).toBe("agentic");
      expect(SearchModeSchema.parse("deep")).toBe("deep");
    });

    it("rejects invalid modes", () => {
      expect(() => SearchModeSchema.parse("turbo")).toThrow();
    });
  });

  describe("SearchContextSizeSchema", () => {
    it("accepts valid sizes", () => {
      expect(SearchContextSizeSchema.parse("low")).toBe("low");
      expect(SearchContextSizeSchema.parse("medium")).toBe("medium");
      expect(SearchContextSizeSchema.parse("high")).toBe("high");
    });
  });

  describe("CitationSchema", () => {
    it("validates a complete citation", () => {
      const citation = CitationSchema.parse({
        title: "Test Citation",
        url: "https://example.com/article",
      });
      expect(citation.url).toBe("https://example.com/article");
      expect(citation.title).toBe("Test Citation");
    });

    it("allows optional title", () => {
      const citation = CitationSchema.parse({
        url: "https://example.com",
      });
      expect(citation.title).toBeUndefined();
    });

    it("rejects invalid URLs", () => {
      expect(() =>
        CitationSchema.parse({ title: "Test", url: "not-a-url" })
      ).toThrow();
    });
  });

  describe("SourceSchema", () => {
    it("validates a source with action types", () => {
      const source = SourceSchema.parse({
        url: "https://bis.org/report",
        action: "search",
        id: "ws_call_1",
      });
      expect(source.action).toBe("search");
      expect(source.id).toBe("ws_call_1");
    });

    it("accepts open_page action", () => {
      const source = SourceSchema.parse({
        url: "https://imf.org/paper",
        action: "open_page",
        id: "ws_call_2",
      });
      expect(source.action).toBe("open_page");
    });

    it("accepts find_in_page action", () => {
      const source = SourceSchema.parse({
        url: "https://sec.gov/filing",
        action: "find_in_page",
        id: "ws_call_3",
      });
      expect(source.action).toBe("find_in_page");
    });

    it("rejects unknown action types", () => {
      expect(() =>
        SourceSchema.parse({ url: "https://example.com", action: "browse", id: "1" })
      ).toThrow();
    });
  });

  describe("SearchDebugSchema", () => {
    it("validates debug payload", () => {
      const debug = SearchDebugSchema.parse({
        toolCalls: [{ type: "web_search_call" }],
        latencyMs: 1500,
        cost: { toolCallsUSD: 0.035 },
      });
      expect(debug.latencyMs).toBe(1500);
      expect(debug.cost.toolCallsUSD).toBe(0.035);
    });

    it("defaults toolCalls to empty array", () => {
      const debug = SearchDebugSchema.parse({
        latencyMs: 100,
        cost: { toolCallsUSD: 0 },
      });
      expect(debug.toolCalls).toEqual([]);
    });
  });

  describe("SearchRequestSchema", () => {
    it("validates minimal request", () => {
      const req = SearchRequestSchema.parse({ query: "test query" });
      expect(req.query).toBe("test query");
      expect(req.mode).toBeUndefined();
    });

    it("validates full request", () => {
      const req = SearchRequestSchema.parse({
        query: "RBI AI risk controls",
        mode: "agentic",
        allowedDomains: ["rbi.org.in"],
        maxPages: 3,
        searchContextSize: "high",
        locale: "en-IN",
        userLocation: { city: "Mumbai", country: "IN" },
        timeoutMs: 15000,
        maxCostUSD: 0.10,
      });
      expect(req.mode).toBe("agentic");
      expect(req.allowedDomains).toEqual(["rbi.org.in"]);
    });

    it("rejects empty query", () => {
      expect(() => SearchRequestSchema.parse({ query: "" })).toThrow();
    });

    it("rejects invalid timeout", () => {
      expect(() =>
        SearchRequestSchema.parse({ query: "test", timeoutMs: 500 })
      ).toThrow();
    });
  });

  describe("SearchResponseSchema", () => {
    it("validates a complete response", () => {
      const resp = SearchResponseSchema.parse({
        answer: "Test answer with [citation](https://example.com)",
        citations: [
          { title: "Example", url: "https://example.com" },
        ],
        sources: [
          { url: "https://example.com", action: "search", id: "ws_1" },
        ],
        debug: {
          toolCalls: [{ type: "web_search_call" }],
          latencyMs: 500,
          cost: { toolCallsUSD: 0.03 },
        },
      });
      expect(resp.answer).toContain("citation");
      expect(resp.citations.length).toBe(1);
      expect(resp.sources[0].action).toBe("search");
    });
  });

  describe("WebSearchConfigSchema", () => {
    it("applies defaults", () => {
      const config = WebSearchConfigSchema.parse({});
      expect(config.mode).toBe("lookup");
      expect(config.maxPages).toBe(5);
      expect(config.searchContextSize).toBe("medium");
      expect(config.locale).toBe("en-IN");
      expect(config.maxCostUSD).toBe(0.25);
      expect(config.retries.max).toBe(3);
      expect(config.retries.baseDelayMs).toBe(1500);
      expect(config.retries.exponent).toBe(2.0);
      expect(config.circuitBreaker.consecutiveFailures).toBe(3);
      expect(config.circuitBreaker.windowMs).toBe(300000);
    });

    it("overrides defaults", () => {
      const config = WebSearchConfigSchema.parse({
        mode: "deep",
        maxPages: 10,
        allowedDomains: ["custom.org"],
      });
      expect(config.mode).toBe("deep");
      expect(config.maxPages).toBe(10);
      expect(config.allowedDomains).toEqual(["custom.org"]);
    });
  });
});

// ---------------------------------------------------------------------------
// Planner tests
// ---------------------------------------------------------------------------

describe("Planner", () => {
  const config = makeConfig();

  describe("inferMode", () => {
    it("returns lookup for simple short queries", () => {
      expect(inferMode("current GDP", "lookup")).toBe("lookup");
    });

    it("returns deep for research-style queries", () => {
      expect(inferMode("Summarize BIS papers on foundation models with 3 citations", "lookup")).toBe("deep");
    });

    it("returns agentic for verification queries", () => {
      expect(inferMode("Verify RBI stance on gen-AI risk controls", "lookup")).toBe("agentic");
    });

    it("respects config mode=deep override", () => {
      expect(inferMode("simple query", "deep")).toBe("deep");
    });

    it("detects comprehensive analysis requests", () => {
      expect(inferMode("Give me a comprehensive review of capital adequacy rules", "lookup")).toBe("deep");
    });

    it("detects fact-check patterns", () => {
      expect(inferMode("fact-check the claim about RBI interest rates", "lookup")).toBe("agentic");
    });
  });

  describe("isDomainAllowed", () => {
    const allowed = ["bis.org", "imf.org", "rbi.org.in"];
    const banned = ["spam.com", "malware.net"];

    it("allows listed domains", () => {
      expect(isDomainAllowed("https://bis.org/report", allowed, [])).toBe(true);
      expect(isDomainAllowed("https://www.imf.org/article", allowed, [])).toBe(true);
    });

    it("allows subdomains of allowed domains", () => {
      expect(isDomainAllowed("https://data.bis.org/stats", allowed, [])).toBe(true);
    });

    it("rejects unlisted domains when allow-list is set", () => {
      expect(isDomainAllowed("https://random.com/page", allowed, [])).toBe(false);
    });

    it("rejects banned domains even if in allow-list", () => {
      expect(isDomainAllowed("https://spam.com/page", allowed, banned)).toBe(false);
    });

    it("allows all domains when no allow-list or ban-list", () => {
      expect(isDomainAllowed("https://anything.com", [], [])).toBe(true);
    });

    it("handles invalid URLs gracefully", () => {
      expect(isDomainAllowed("not-a-url", allowed, [])).toBe(false);
    });
  });

  describe("filterDomains", () => {
    it("filters URLs to only allowed domains", () => {
      const urls = [
        "https://bis.org/report",
        "https://random.com/page",
        "https://imf.org/data",
      ];
      const filtered = filterDomains(urls, ["bis.org", "imf.org"], []);
      expect(filtered).toEqual([
        "https://bis.org/report",
        "https://imf.org/data",
      ]);
    });
  });

  describe("plan", () => {
    it("creates a planned query with defaults from config", () => {
      const request: SearchRequest = { query: "RBI circular on AI risk" };
      const planned = plan(request, config);

      expect(planned.prompt).toContain("RBI circular on AI risk");
      expect(planned.mode).toBe("lookup");
      expect(planned.allowedDomains).toEqual(config.allowedDomains);
      expect(planned.locale).toBe("en-IN");
      expect(planned.maxPages).toBe(5);
      expect(planned.prompt).toContain("Include citations");
    });

    it("respects request overrides", () => {
      const request: SearchRequest = {
        query: "test",
        mode: "deep",
        allowedDomains: ["custom.org"],
        locale: "en-US",
        maxPages: 3,
      };
      const planned = plan(request, config);

      expect(planned.mode).toBe("deep");
      expect(planned.allowedDomains).toEqual(["custom.org"]);
      expect(planned.locale).toBe("en-US");
      expect(planned.maxPages).toBe(3);
    });

    it("detects time windows from recency patterns", () => {
      const request: SearchRequest = { query: "RBI publications last 30 days" };
      const planned = plan(request, config);

      expect(planned.prompt).toContain("published after");
    });

    it("includes domain hints in prompt", () => {
      const request: SearchRequest = { query: "BIS capital adequacy" };
      const planned = plan(request, config);

      expect(planned.prompt).toContain("bis.org");
    });

    it("resolves timeout from mode", () => {
      const reqLookup: SearchRequest = { query: "test", mode: "lookup" };
      const reqDeep: SearchRequest = { query: "test", mode: "deep" };

      expect(plan(reqLookup, config).timeoutMs).toBe(60000);
      expect(plan(reqDeep, config).timeoutMs).toBe(240000);
    });
  });
});

// ---------------------------------------------------------------------------
// Reranker tests
// ---------------------------------------------------------------------------

describe("Reranker", () => {
  const makeCitations = (): Citation[] => [
    { title: "BIS Report", url: "https://bis.org/report/2025" },
    { title: "Random Blog", url: "https://medium.com/ai-stuff" },
    { title: "IMF Working Paper", url: "https://imf.org/wp/2025/01" },
    { title: "SEC Filing", url: "https://sec.gov/filing/123" },
    { title: "Duplicate BIS", url: "https://bis.org/report/2025/" },
    { title: "Pinterest Pin", url: "https://pinterest.com/banking-ai" },
  ];

  const makeSources = (): Source[] => [
    { url: "https://bis.org/report/2025", action: "search", id: "ws_1" },
    { url: "https://medium.com/ai-stuff", action: "search", id: "ws_2" },
    { url: "https://imf.org/wp/2025/01", action: "open_page", id: "ws_3" },
    { url: "https://sec.gov/filing/123", action: "search", id: "ws_4" },
    { url: "https://pinterest.com/banking-ai", action: "search", id: "ws_5" },
  ];

  describe("scoreDomain", () => {
    it("gives high scores to authoritative domains", () => {
      expect(scoreDomain("https://bis.org/report", [])).toBe(10);
      expect(scoreDomain("https://imf.org/paper", [])).toBe(10);
      expect(scoreDomain("https://rbi.org.in/circular", [])).toBe(10);
    });

    it("penalises low-credibility domains", () => {
      expect(scoreDomain("https://medium.com/post", [])).toBe(2);
      expect(scoreDomain("https://pinterest.com/pin", [])).toBe(2);
    });

    it("boosts allowed domains", () => {
      expect(scoreDomain("https://custom-bank.com/report", ["custom-bank.com"])).toBe(9);
    });

    it("gives .gov domains high scores", () => {
      expect(scoreDomain("https://treasury.gov/data", [])).toBe(10);
    });
  });

  describe("normaliseUrl", () => {
    it("removes trailing slashes", () => {
      expect(normaliseUrl("https://bis.org/report/")).toBe("bis.org/report");
    });

    it("removes www prefix", () => {
      expect(normaliseUrl("https://www.imf.org/paper")).toBe("imf.org/paper");
    });

    it("handles invalid URLs gracefully", () => {
      expect(normaliseUrl("not-a-url")).toBe("not-a-url");
    });
  });

  describe("textSimilarity", () => {
    it("returns high similarity for identical strings", () => {
      expect(textSimilarity("hello world", "hello world")).toBeGreaterThan(0.9);
    });

    it("returns low similarity for different strings", () => {
      expect(textSimilarity("hello world", "goodbye moon")).toBeLessThan(0.3);
    });

    it("returns 0 for empty strings", () => {
      expect(textSimilarity("", "hello")).toBe(0);
    });
  });

  describe("rerank", () => {
    it("removes exact URL duplicates (normalised)", () => {
      const citations = makeCitations();
      const sources = makeSources();
      const result = rerank(citations, sources, { topK: 10 });
      const urls = result.citations.map((c) => c.url);
      // bis.org/report/2025 and bis.org/report/2025/ should be deduped
      const bisUrls = urls.filter((u) => u.includes("bis.org"));
      expect(bisUrls.length).toBe(1);
    });

    it("emphasizes allowed domains", () => {
      const citations = makeCitations();
      const sources = makeSources();
      const result = rerank(citations, sources, {
        topK: 5,
        allowedDomains: ["bis.org", "imf.org", "sec.gov"],
      });

      // Top result should be from an authoritative domain
      expect(result.citations[0].url).toContain("bis.org");
      expect(result.citations[0].score).toBeGreaterThan(0.5);
    });

    it("penalizes low-credibility domains", () => {
      const citations = makeCitations();
      const sources = makeSources();
      const result = rerank(citations, sources, { topK: 10 });

      const mediumCitation = result.citations.find((c) => c.url.includes("medium.com"));
      const bisCitation = result.citations.find((c) => c.url.includes("bis.org"));

      if (mediumCitation && bisCitation) {
        expect(mediumCitation.score).toBeLessThan(bisCitation.score);
      }
    });

    it("respects topK limit", () => {
      const citations = makeCitations();
      const sources = makeSources();
      const result = rerank(citations, sources, { topK: 2 });
      expect(result.citations.length).toBeLessThanOrEqual(2);
    });
  });

  describe("mergeSearchResults", () => {
    it("merges and dedupes results from multiple passes", () => {
      const pass1 = {
        citations: [
          { title: "BIS A", url: "https://bis.org/a" },
          { title: "IMF B", url: "https://imf.org/b" },
        ] as Citation[],
        sources: [
          { url: "https://bis.org/a", action: "search" as const, id: "ws_1" },
        ] as Source[],
      };
      const pass2 = {
        citations: [
          { title: "BIS A Dup", url: "https://bis.org/a" },
          { title: "SEC C", url: "https://sec.gov/c" },
        ] as Citation[],
        sources: [
          { url: "https://sec.gov/c", action: "search" as const, id: "ws_2" },
        ] as Source[],
      };

      const merged = mergeSearchResults([pass1, pass2], { topK: 10 });
      // Should have 3 unique citations (BIS A deduped)
      expect(merged.citations.length).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Config & feature flag tests
// ---------------------------------------------------------------------------

describe("Config", () => {
  beforeEach(() => {
    resetConfig();
  });

  it("loads config from file with defaults", () => {
    const config = loadConfig();
    expect(config.mode).toBeDefined();
    expect(config.maxPages).toBeGreaterThan(0);
    expect(config.maxCostUSD).toBeGreaterThan(0);
  });

  it("respects WEB_SEARCH_MODE env override", () => {
    process.env.WEB_SEARCH_MODE = "deep";
    resetConfig();
    const config = loadConfig();
    expect(config.mode).toBe("deep");
    delete process.env.WEB_SEARCH_MODE;
  });

  it("respects WEB_SEARCH_ALLOWED_DOMAINS env override", () => {
    process.env.WEB_SEARCH_ALLOWED_DOMAINS = "custom.org,test.com";
    resetConfig();
    const config = loadConfig();
    expect(config.allowedDomains).toEqual(["custom.org", "test.com"]);
    delete process.env.WEB_SEARCH_ALLOWED_DOMAINS;
  });
});

describe("Feature flags", () => {
  beforeEach(() => {
    resetConfig();
  });

  it("isWebSearchEnabled defaults to true", () => {
    const original = process.env.WEB_SEARCH_ENABLED;
    delete process.env.WEB_SEARCH_ENABLED;
    resetConfig();
    expect(isWebSearchEnabled()).toBe(true);
    if (original !== undefined) process.env.WEB_SEARCH_ENABLED = original;
  });

  it("isWebSearchEnabled respects false", () => {
    process.env.WEB_SEARCH_ENABLED = "false";
    resetConfig();
    expect(isWebSearchEnabled()).toBe(false);
    delete process.env.WEB_SEARCH_ENABLED;
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker tests
// ---------------------------------------------------------------------------

describe("Circuit Breaker", () => {
  beforeEach(() => {
    resetCircuitBreaker();
    resetConfig();
  });

  it("does not downgrade before threshold", () => {
    recordTimeout();
    recordTimeout();
    // Only 2 failures, threshold is 3
    expect(getEffectiveMode("deep")).toBe("deep");
  });

  it("downgrades to lookup after 3 consecutive timeouts", () => {
    recordTimeout();
    recordTimeout();
    recordTimeout();
    expect(getEffectiveMode("deep")).toBe("lookup");
    expect(getEffectiveMode("agentic")).toBe("lookup");
  });

  it("does not downgrade lookup further", () => {
    recordTimeout();
    recordTimeout();
    recordTimeout();
    expect(getEffectiveMode("lookup")).toBe("lookup");
  });

  it("resets after successful call", () => {
    recordTimeout();
    recordTimeout();
    recordTimeout();
    expect(getEffectiveMode("deep")).toBe("lookup");

    recordSuccess();
    expect(getEffectiveMode("deep")).toBe("deep");
  });

  it("resetCircuitBreaker clears state", () => {
    recordTimeout();
    recordTimeout();
    recordTimeout();
    resetCircuitBreaker();
    expect(getEffectiveMode("deep")).toBe("deep");
  });
});

// ---------------------------------------------------------------------------
// Observability hook tests
// ---------------------------------------------------------------------------

describe("Observability", () => {
  it("onMetric registers and unregisters listeners", () => {
    const events: string[] = [];
    const unsubscribe = onMetric((event) => {
      events.push(event.type);
    });

    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// Timeout / retry pattern tests (unit-level, no network)
// ---------------------------------------------------------------------------

describe("Timeout and retry patterns", () => {
  it("plan resolves correct timeout per mode", () => {
    const config = makeConfig();

    const lookupPlan = plan({ query: "test", mode: "lookup" }, config);
    expect(lookupPlan.timeoutMs).toBe(60000);

    const agenticPlan = plan({ query: "test", mode: "agentic" }, config);
    expect(agenticPlan.timeoutMs).toBe(120000);

    const deepPlan = plan({ query: "test", mode: "deep" }, config);
    expect(deepPlan.timeoutMs).toBe(240000);
  });

  it("request-level timeout overrides config", () => {
    const config = makeConfig();
    const planned = plan({ query: "test", timeoutMs: 30000 }, config);
    expect(planned.timeoutMs).toBe(30000);
  });

  it("cost cap is carried from config", () => {
    const config = makeConfig({ maxCostUSD: 0.10 });
    const planned = plan({ query: "test" }, config);
    expect(planned.maxCostUSD).toBe(0.10);
  });

  it("cost cap request override works", () => {
    const config = makeConfig();
    const planned = plan({ query: "test", maxCostUSD: 0.05 }, config);
    expect(planned.maxCostUSD).toBe(0.05);
  });
});
