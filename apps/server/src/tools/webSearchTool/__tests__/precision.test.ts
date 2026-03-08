/**
 * Golden-set precision tests with 20 curated prompts.
 *
 * These tests validate the query planner's behavior for banking, AI,
 * and financial regulation queries. They do NOT make network calls;
 * instead they verify that the planner produces correct depth modes,
 * domain emphasis, time windows, and prompt construction.
 *
 * For live API precision testing, use scripts/precision-run.ts.
 */

import { describe, it, expect } from "vitest";
import { plan, inferMode, isDomainAllowed } from "../planner";
import { WebSearchConfigSchema } from "../schemas";
import type { WebSearchConfig, SearchRequest } from "../schemas";

// ---------------------------------------------------------------------------
// Default config for precision tests
// ---------------------------------------------------------------------------

const config: WebSearchConfig = WebSearchConfigSchema.parse({
  mode: "lookup",
  allowedDomains: [
    "bis.org",
    "imf.org",
    "rbi.org.in",
    "bankofengland.co.uk",
    "sec.gov",
    "europa.eu",
  ],
  bannedDomains: [],
  maxPages: 6,
  searchContextSize: "medium",
  defaultLocale: "en-IN",
  timeoutMs: { lookup: 6000, agentic: 20000, deep: 240000 },
  maxCostUSD: 0.25,
  retries: 3,
  retryBaseDelayMs: 1000,
});

// ---------------------------------------------------------------------------
// 20 curated prompts – banking / AI / financial regulation
// ---------------------------------------------------------------------------

const GOLDEN_PROMPTS: {
  id: number;
  query: string;
  expectedMode: "lookup" | "agentic" | "deep";
  expectTimeWindow: boolean;
  expectDomainHints: boolean;
  description: string;
}[] = [
  {
    id: 1,
    query: "Summarize RBI's latest circular on gen-AI risk controls (last 60 days). Include 3 citations.",
    expectedMode: "deep",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "RBI gen-AI risk circular with citations and recency",
  },
  {
    id: 2,
    query: "Capital adequacy updates from BIS in the past quarter; bullet list with links.",
    expectedMode: "deep",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "BIS capital adequacy with time window",
  },
  {
    id: 3,
    query: "What is the current Basel III endgame timeline for US banks?",
    expectedMode: "lookup",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Simple factual lookup on Basel III",
  },
  {
    id: 4,
    query: "Compare RBI and Bank of England approaches to AI governance in banking",
    expectedMode: "deep",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Comparative analysis requiring deep research",
  },
  {
    id: 5,
    query: "Verify whether IMF published new guidelines on crypto regulation this month",
    expectedMode: "agentic",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "Verification/fact-check query",
  },
  {
    id: 6,
    query: "SEC enforcement actions on AI-related securities fraud 2025",
    expectedMode: "lookup",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "SEC enforcement with year reference",
  },
  {
    id: 7,
    query: "Comprehensive review of EU AI Act implications for financial services. Include quotes with links.",
    expectedMode: "deep",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Comprehensive review with citation requirement",
  },
  {
    id: 8,
    query: "Latest RBI monetary policy rate decision",
    expectedMode: "lookup",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "Simple latest-event lookup",
  },
  {
    id: 9,
    query: "Find the exact text of BIS principle 7 on operational resilience",
    expectedMode: "agentic",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Exact text retrieval requiring evidence gathering",
  },
  {
    id: 10,
    query: "How are central banks using machine learning for fraud detection? Summarize with 5 citations.",
    expectedMode: "deep",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Research summary with citation count",
  },
  {
    id: 11,
    query: "Bank of England stress testing framework updates last 3 months",
    expectedMode: "lookup",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "BoE updates with time window",
  },
  {
    id: 12,
    query: "Pros and cons of using LLMs for regulatory compliance automation",
    expectedMode: "deep",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Pros/cons analysis triggering deep mode",
  },
  {
    id: 13,
    query: "What did the FSB say about AI systemic risk in their latest report?",
    expectedMode: "lookup",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "FSB report lookup with recency",
  },
  {
    id: 14,
    query: "Step-by-step walk me through how DORA regulation affects Indian banks",
    expectedMode: "agentic",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Step-by-step walkthrough triggering agentic",
  },
  {
    id: 15,
    query: "In-depth analysis of how generative AI is transforming KYC processes globally",
    expectedMode: "deep",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "In-depth analysis keyword",
  },
  {
    id: 16,
    query: "Current LIBOR to SOFR transition status",
    expectedMode: "lookup",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Simple current-state lookup",
  },
  {
    id: 17,
    query: "Fact-check: Did RBI mandate AI model validation for all scheduled banks?",
    expectedMode: "agentic",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Explicit fact-check query",
  },
  {
    id: 18,
    query: "Summarize BIS's most recent paper on foundation models in banking. Include quotes with links.",
    expectedMode: "deep",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "BIS paper summary with citation requirement",
  },
  {
    id: 19,
    query: "Europa.eu digital finance package latest amendments",
    expectedMode: "lookup",
    expectTimeWindow: true,
    expectDomainHints: true,
    description: "EU digital finance with recency",
  },
  {
    id: 20,
    query: "Thorough synthesis of how AI hallucination risks are addressed in banking regulation across G20 nations",
    expectedMode: "deep",
    expectTimeWindow: false,
    expectDomainHints: true,
    description: "Thorough synthesis keyword",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Golden-set precision tests (20 prompts)", () => {
  describe("Mode inference", () => {
    for (const prompt of GOLDEN_PROMPTS) {
      it(`#${prompt.id}: ${prompt.description} → ${prompt.expectedMode}`, () => {
        const inferred = inferMode(prompt.query, "lookup");
        expect(inferred).toBe(prompt.expectedMode);
      });
    }
  });

  describe("Time window detection", () => {
    for (const prompt of GOLDEN_PROMPTS) {
      if (prompt.expectTimeWindow) {
        it(`#${prompt.id}: detects time window in "${prompt.query.slice(0, 60)}..."`, () => {
          const planned = plan({ query: prompt.query }, config);
          expect(planned.prompt).toMatch(/published after|last \d|recent/i);
        });
      }
    }
  });

  describe("Domain hints in prompts", () => {
    for (const prompt of GOLDEN_PROMPTS) {
      if (prompt.expectDomainHints) {
        it(`#${prompt.id}: includes domain hints`, () => {
          const planned = plan({ query: prompt.query }, config);
          expect(planned.prompt).toContain("authoritative sources");
          expect(planned.allowedDomains.length).toBeGreaterThan(0);
        });
      }
    }
  });

  describe("Citation request in prompts", () => {
    for (const prompt of GOLDEN_PROMPTS) {
      it(`#${prompt.id}: requests citations`, () => {
        const planned = plan({ query: prompt.query }, config);
        expect(planned.prompt).toContain("Include citations");
      });
    }
  });

  describe("Domain allow-list verification for banking domains", () => {
    const bankingDomains = config.allowedDomains;

    it("all configured banking domains pass allow-list check", () => {
      for (const domain of bankingDomains) {
        expect(isDomainAllowed(`https://${domain}/test`, bankingDomains, [])).toBe(true);
      }
    });

    it("subdomains of banking domains pass", () => {
      expect(isDomainAllowed("https://data.bis.org/stats", bankingDomains, [])).toBe(true);
      expect(isDomainAllowed("https://www.rbi.org.in/circular", bankingDomains, [])).toBe(true);
    });

    it("non-banking domains fail when allow-list is active", () => {
      expect(isDomainAllowed("https://medium.com/article", bankingDomains, [])).toBe(false);
      expect(isDomainAllowed("https://random-blog.com", bankingDomains, [])).toBe(false);
    });
  });

  describe("SLO timeout budgets", () => {
    it("lookup mode gets <= 6s timeout", () => {
      const planned = plan({ query: "simple query", mode: "lookup" }, config);
      expect(planned.timeoutMs).toBeLessThanOrEqual(6000);
    });

    it("agentic mode gets <= 20s timeout", () => {
      const planned = plan({ query: "verify something", mode: "agentic" }, config);
      expect(planned.timeoutMs).toBeLessThanOrEqual(20000);
    });

    it("deep mode gets <= 4min timeout", () => {
      const planned = plan({ query: "comprehensive analysis", mode: "deep" }, config);
      expect(planned.timeoutMs).toBeLessThanOrEqual(240000);
    });
  });

  describe("Cost cap enforcement", () => {
    it("default cost cap is 0.25 USD", () => {
      const planned = plan({ query: "test" }, config);
      expect(planned.maxCostUSD).toBe(0.25);
    });

    it("per-request cost cap overrides default", () => {
      const planned = plan({ query: "test", maxCostUSD: 0.10 }, config);
      expect(planned.maxCostUSD).toBe(0.10);
    });
  });
});
