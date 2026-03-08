/**
 * Strict TypeScript Zod schemas for the production-grade web search tool.
 *
 * Defines:
 * - SearchMode (lookup | agentic | deep)
 * - SearchRequest  – input accepted by the unified search() function
 * - Citation, Source, SearchDebug – sub-structures
 * - SearchResponse – output returned to callers
 * - WebSearchConfig – runtime config loaded from config/web-search.json + env
 * - MetricEvent    – observability event type
 *
 * References:
 * - [REF A] https://developers.openai.com/api/docs/guides/tools-web-search
 * - [REF B] https://learn.microsoft.com/azure/foundry/openai/how-to/web-search
 * - [REF C] https://openai.github.io/openai-agents-js/guides/tools/
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums & primitives
// ---------------------------------------------------------------------------

export const SearchModeSchema = z.enum(["lookup", "agentic", "deep"]);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const SearchContextSizeSchema = z.enum(["low", "medium", "high"]);
export type SearchContextSize = z.infer<typeof SearchContextSizeSchema>;

export const ProviderNameSchema = z.enum(["openai", "azure", "fallback"]);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

// ---------------------------------------------------------------------------
// Citation – maps to API message annotations  [REF A]
// ---------------------------------------------------------------------------

export const CitationSchema = z.object({
  /** Full URL of the cited source */
  url: z.string().url(),
  /** Display title of the source (optional) */
  title: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

// ---------------------------------------------------------------------------
// Source – a tool-call action record  [REF A]
// ---------------------------------------------------------------------------

export const SourceSchema = z.object({
  /** URL targeted by this action (if applicable) */
  url: z.string(),
  /** Action type: search, open_page, find_in_page */
  action: z.enum(["search", "open_page", "find_in_page"]),
  /** web_search_call item id */
  id: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

// ---------------------------------------------------------------------------
// Debug / observability payload
// ---------------------------------------------------------------------------

export const SearchDebugSchema = z.object({
  /** Raw tool-call items from the Responses API output */
  toolCalls: z.array(z.any()).default([]),
  /** End-to-end latency in ms */
  latencyMs: z.number().int().min(0),
  /** Cost breakdown */
  cost: z.object({
    /** Estimated cost of tool-call invocations in USD */
    toolCallsUSD: z.number().min(0).default(0),
  }),
});
export type SearchDebug = z.infer<typeof SearchDebugSchema>;

// ---------------------------------------------------------------------------
// SearchRequest – input to the unified search() entry point
// ---------------------------------------------------------------------------

export const SearchRequestSchema = z.object({
  /** The user query / prompt */
  query: z.string().min(1),
  /** Depth mode override (default: from config) */
  mode: SearchModeSchema.optional(),
  /** Domain allow-list override */
  allowedDomains: z.array(z.string()).optional(),
  /** Domain block-list override */
  blocklistDomains: z.array(z.string()).optional(),
  /** Max pages to fetch/open */
  maxPages: z.number().int().min(1).max(20).optional(),
  /** Context size override */
  searchContextSize: SearchContextSizeSchema.optional(),
  /** Locale / language hint */
  locale: z.string().optional(),
  /** User location hint */
  userLocation: z
    .object({
      city: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  /** Per-call timeout override in ms */
  timeoutMs: z.number().int().min(1000).optional(),
  /** Per-call cost cap override in USD */
  maxCostUSD: z.number().min(0).optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

// ---------------------------------------------------------------------------
// SearchResponse – output from the unified search()
// ---------------------------------------------------------------------------

export const SearchResponseSchema = z.object({
  /** Final synthesised answer with inline Markdown citation links */
  answer: z.string(),
  /** Ordered list of citations extracted from API annotations [REF A] */
  citations: z.array(CitationSchema),
  /** Tool-call action records (search/open_page/find_in_page) [REF A] */
  sources: z.array(SourceSchema),
  /** Debug & observability payload */
  debug: SearchDebugSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ---------------------------------------------------------------------------
// WebSearchConfig – loaded from config/web-search.json + env overrides
// ---------------------------------------------------------------------------

export const RetryConfigSchema = z.object({
  max: z.number().int().min(0).default(3),
  baseDelayMs: z.number().int().min(0).default(1500),
  exponent: z.number().min(1).default(2.0),
});
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

export const CircuitBreakerConfigSchema = z.object({
  consecutiveFailures: z.number().int().min(1).default(3),
  windowMs: z.number().int().min(1000).default(300000),
  downgradeMode: SearchModeSchema.default("lookup"),
});
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

export const WebSearchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(["openai", "azure"]).default("openai"),
  mode: SearchModeSchema.default("lookup"),
  timeoutMs: z.number().int().default(90000),
  searchContextSize: SearchContextSizeSchema.default("medium"),
  allowedDomains: z.array(z.string()).default([]),
  blocklistDomains: z.array(z.string()).default([]),
  maxPages: z.number().int().min(1).max(20).default(5),
  maxCostUSD: z.number().min(0).default(0.25),
  locale: z.string().default("en-IN"),
  userLocation: z
    .object({
      city: z.string().optional(),
      country: z.string().optional(),
    })
    .default({}),
  retries: RetryConfigSchema.default({}),
  failOpenToFallback: z.boolean().default(true),
  fallbackProviders: z.array(z.string()).default([]),
  circuitBreaker: CircuitBreakerConfigSchema.default({}),
});
export type WebSearchConfig = z.infer<typeof WebSearchConfigSchema>;

// ---------------------------------------------------------------------------
// Metric event types for observability hooks
// ---------------------------------------------------------------------------

export interface MetricEvent {
  type:
    | "tool.web_search.start"
    | "tool.web_search.done"
    | "tool.web_search.error";
  callId: string;
  timestamp: number;
  mode: SearchMode;
  provider: ProviderName;
  /** Present on done events */
  latencyMs?: number;
  costUSD?: number;
  citationCount?: number;
  /** Present on error events */
  error?: string;
  errorCode?: string;
  /** Action types performed during this call */
  actions?: string[];
}
