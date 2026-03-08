/**
 * Unit tests for the production-grade webSearchTool module.
 *
 * Covers:
 * - schemas (Zod validation)
 * - planner (mode inference, domain filtering, time windows, query planning)
 * - reranker (dedup, domain emphasis, top-k scoring)
 * - config loading
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
import type { PlannedQuery } from "../planner";
import type { WebSearchConfig, SearchRequest } from "../schemas";

// Reranker
import { rerank, mergeSearchResults } from "../reranker";
import type { RankedSource } from "../reranker";
import type { Citation, Source } from "../schemas";

// Config
import { loadConfig, resetConfig, onMetric, isWebSearchEnabled } from "../index";

// ---------------------------------------------------------------------------
// Test config helper
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<WebSearchConfig>): WebSearchConfig {
  return WebSearchConfigSchema.parse({
    mode: "lookup",
    allowedDomains: ["bis.org", "imf.org", "rbi.org.in", "sec.gov"],
    bannedDomains: [],
    maxPages: 6,
    searchContextSize: "medium",
    defaultLocale: "en-IN",
    timeoutMs: { lookup: 6000, agentic: 20000, deep: 240000 },
    maxCostUSD: 0.25,
    retries: 3,
    retryBaseDelayMs: 1000,
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
        index: 1,
        title: "Test Citation",
        url: "https://example.com/article",
        startIndex: 0,
        endIndex: 50,
      });
      expect(citation.index).toBe(1);
      expect(citation.url).toBe("https://example.com/article");
    });

    it("allows optional fields", () => {
      const citation = CitationSchema.parse({
        index: 1,
        title: "Test",
        url: "https://example.com",
      });
      expect(citation.startIndex).toBeUndefined();
    });

    it("rejects invalid URLs", () => {
      expect(() =>
        CitationSchema.parse({ index: 1, title: "Test", url: "not-a-url" })
      ).toThrow();
    });

    it("rejects non-positive index", () => {
      expect(() =>
        CitationSchema.parse({ index: 0, title: "Test", url: "https://example.com" })
      ).toThrow();
    });
  });

  describe("SourceSchema", () => {
    it("validates a source", () => {
      const source = SourceSchema.parse({
        title: "BIS Report",
        url: "https://bis.org/report",
        snippet: "Summary of the report",
        credibilityScore: 9,
      });
      expect(source.credibilityScore).toBe(9);
    });

    it("allows optional credibilityScore", () => {
      const source = SourceSchema.parse({
        title: "Test",
        url: "https://example.com",
        snippet: "Test snippet",
      });
      expect(source.credibilityScore).toBeUndefined();
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
          { index: 1, title: "Example", url: "https://example.com" },
        ],
        sources: [
          { title: "Example", url: "https://example.com", snippet: "Test" },
        ],
        debug: {
          callId: "ws_123",
          actions: [{ type: "search" }],
          costUSD: 0.001,
          latencyMs: 500,
          provider: "openai",
          mode: "lookup",
          tokensIn: 100,
          tokensOut: 200,
        },
      });
      expect(resp.answer).toContain("citation");
      expect(resp.debug.provider).toBe("openai");
    });
  });

  describe("WebSearchConfigSchema", () => {
    it("applies defaults", () => {
      const config = WebSearchConfigSchema.parse({});
      expect(config.mode).toBe("lookup");
      expect(config.maxPages).toBe(6);
      expect(config.searchContextSize).toBe("medium");
      expect(config.defaultLocale).toBe("en-IN");
      expect(config.maxCostUSD).toBe(0.25);
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
      expect(inferMode("Verify RBI's stance on gen-AI risk controls", "lookup")).toBe("agentic");
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
      expect(planned.maxPages).toBe(6);
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
      const reqLookup: SearchRequest = { query: "test" };
      const reqDeep: SearchRequest = { query: "test", mode: "deep" };

      expect(plan(reqLookup, config).timeoutMs).toBe(6000);
      expect(plan(reqDeep, config).timeoutMs).toBe(240000);
    });
  });
});

// ---------------------------------------------------------------------------
// Reranker tests
// ---------------------------------------------------------------------------

describe("Reranker", () => {
  const makeSources = (): Source[] => [
    { title: "BIS Report", url: "https://bis.org/report/2025", snippet: "Capital adequacy framework update" },
    { title: "Random Blog", url: "https://medium.com/ai-stuff", snippet: "My thoughts on AI in banking" },
    { title: "IMF Working Paper", url: "https://imf.org/wp/2025/01", snippet: "Financial stability and AI risks" },
    { title: "SEC Filing", url: "https://sec.gov/filing/123", snippet: "Regulatory filing on AI disclosure" },
    { title: "Duplicate BIS", url: "https://bis.org/report/2025/", snippet: "Capital adequacy framework update" },
    { title: "Pinterest Pin", url: "https://pinterest.com/banking-ai", snippet: "Banking AI images" },
  ];

  const makeCitations = (): Citation[] => [
    { index: 1, title: "BIS Report", url: "https://bis.org/report/2025" },
    { index: 2, title: "IMF Paper", url: "https://imf.org/wp/2025/01" },
    { index: 3, title: "External", url: "https://external.com/article" },
  ];

  describe("rerank", () => {
    it("removes exact URL duplicates (normalised)", () => {
      const sources = makeSources();
      const result = rerank(sources, [], { topK: 10 });
      const urls = result.sources.map((s) => s.url);
      // bis.org/report/2025 and bis.org/report/2025/ should be deduped
      const bisUrls = urls.filter((u) => u.includes("bis.org"));
      expect(bisUrls.length).toBe(1);
    });

    it("emphasizes allowed domains", () => {
      const sources = makeSources();
      const result = rerank(sources, [], {
        topK: 5,
        allowedDomains: ["bis.org", "imf.org", "sec.gov"],
      });

      // Top results should be from authoritative domains
      expect(result.sources[0].url).toContain("bis.org");
      expect(result.sources[0].score).toBeGreaterThan(0.5);
    });

    it("penalizes low-credibility domains", () => {
      const sources = makeSources();
      const result = rerank(sources, [], { topK: 10 });

      const mediumSource = result.sources.find((s) => s.url.includes("medium.com"));
      const pinterestSource = result.sources.find((s) => s.url.includes("pinterest.com"));
      const bisSource = result.sources.find((s) => s.url.includes("bis.org"));

      if (mediumSource && bisSource) {
        expect(mediumSource.score).toBeLessThan(bisSource.score);
      }
      if (pinterestSource && bisSource) {
        expect(pinterestSource.score).toBeLessThan(bisSource.score);
      }
    });

    it("respects topK limit", () => {
      const sources = makeSources();
      const result = rerank(sources, [], { topK: 2 });
      expect(result.sources.length).toBeLessThanOrEqual(2);
    });

    it("filters citations to match top sources", () => {
      const sources = makeSources();
      const citations = makeCitations();
      const result = rerank(sources, citations, {
        topK: 3,
        allowedDomains: ["bis.org", "imf.org", "sec.gov"],
      });

      // External citation should be filtered out since external.com isn't in top sources
      for (const c of result.citations) {
        const inSources = result.sources.some(
          (s) => new URL(s.url).hostname === new URL(c.url).hostname
        );
        expect(inSources).toBe(true);
      }
    });

    it("re-indexes citations after filtering", () => {
      const sources = makeSources();
      const citations = makeCitations();
      const result = rerank(sources, citations, { topK: 10 });

      if (result.citations.length > 0) {
        expect(result.citations[0].index).toBe(1);
        for (let i = 1; i < result.citations.length; i++) {
          expect(result.citations[i].index).toBe(i + 1);
        }
      }
    });
  });

  describe("mergeSearchResults", () => {
    it("merges and dedupes results from multiple passes", () => {
      const pass1 = {
        sources: [
          { title: "BIS A", url: "https://bis.org/a", snippet: "First pass result" },
          { title: "IMF B", url: "https://imf.org/b", snippet: "First pass IMF" },
        ] as Source[],
        citations: [
          { index: 1, title: "BIS A", url: "https://bis.org/a" },
        ] as Citation[],
      };
      const pass2 = {
        sources: [
          { title: "BIS A Dup", url: "https://bis.org/a", snippet: "Duplicate" },
          { title: "SEC C", url: "https://sec.gov/c", snippet: "Second pass SEC" },
        ] as Source[],
        citations: [
          { index: 1, title: "SEC C", url: "https://sec.gov/c" },
        ] as Citation[],
      };

      const merged = mergeSearchResults([pass1, pass2], { topK: 10 });
      // Should have 3 unique sources (BIS A deduped)
      expect(merged.sources.length).toBe(3);
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

  it("respects ALLOWED_DOMAINS env override", () => {
    process.env.ALLOWED_DOMAINS = "custom.org,test.com";
    resetConfig();
    const config = loadConfig();
    expect(config.allowedDomains).toEqual(["custom.org", "test.com"]);
    delete process.env.ALLOWED_DOMAINS;
  });
});

describe("Feature flags", () => {
  it("isWebSearchEnabled defaults to true", () => {
    const original = process.env.WEB_SEARCH_ENABLED;
    delete process.env.WEB_SEARCH_ENABLED;
    expect(isWebSearchEnabled()).toBe(true);
    if (original !== undefined) process.env.WEB_SEARCH_ENABLED = original;
  });

  it("isWebSearchEnabled respects false", () => {
    process.env.WEB_SEARCH_ENABLED = "false";
    expect(isWebSearchEnabled()).toBe(false);
    delete process.env.WEB_SEARCH_ENABLED;
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

    // Listener registered - we can't easily trigger events without calling search()
    // but we can verify the subscribe/unsubscribe mechanism
    expect(typeof unsubscribe).toBe("function");

    unsubscribe();
    // After unsubscribe, no more events should be captured
  });
});

// ---------------------------------------------------------------------------
// Timeout / retry pattern tests (unit-level, no network)
// ---------------------------------------------------------------------------

describe("Timeout and retry patterns", () => {
  it("plan resolves correct timeout per mode", () => {
    const config = makeConfig();

    const lookupPlan = plan({ query: "test" }, config);
    expect(lookupPlan.timeoutMs).toBe(6000);

    const agenticPlan = plan({ query: "test", mode: "agentic" }, config);
    expect(agenticPlan.timeoutMs).toBe(20000);

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
