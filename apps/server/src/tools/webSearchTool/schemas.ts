/**
 * Strict TypeScript Zod schemas for the production-grade web search tool.
 *
 * Defines:
 * - SearchMode (lookup | agentic | deep)
 * - SearchRequest  – input accepted by the unified search() function
 * - Citation, Source, SearchDebug – sub-structures
 * - SearchResponse – output returned to callers
 * - WebSearchConfig – runtime config loaded from config/web-search.json + env
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums & primitives
// ---------------------------------------------------------------------------

export const SearchModeSchema = z.enum(["lookup", "agentic", "deep"]);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const SearchContextSizeSchema = z.enum(["low", "medium", "high"]);
export type SearchContextSize = z.infer<typeof SearchContextSizeSchema>;

// ---------------------------------------------------------------------------
// Citation – maps to API message annotations
// ---------------------------------------------------------------------------

export const CitationSchema = z.object({
  /** Citation index (1-based) */
  index: z.number().int().min(1),
  /** Display title of the source */
  title: z.string(),
  /** Full URL */
  url: z.string().url(),
  /** Start offset in the answer text (if available) */
  startIndex: z.number().int().optional(),
  /** End offset in the answer text (if available) */
  endIndex: z.number().int().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

// ---------------------------------------------------------------------------
// Source – a single result from the search
// ---------------------------------------------------------------------------

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  /** Domain credibility score (0-10) */
  credibilityScore: z.number().min(0).max(10).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

// ---------------------------------------------------------------------------
// Debug / observability payload
// ---------------------------------------------------------------------------

export const SearchActionSchema = z.object({
  /** Action type from the API tool-call record */
  type: z.enum(["search", "open_page", "find_in_page"]),
  /** URL targeted by the action (if applicable) */
  url: z.string().optional(),
  /** Duration of the individual action in ms */
  durationMs: z.number().optional(),
});
export type SearchAction = z.infer<typeof SearchActionSchema>;

export const SearchDebugSchema = z.object({
  /** web_search_call.id from the Responses API */
  callId: z.string().optional(),
  /** Individual actions performed during the search */
  actions: z.array(SearchActionSchema).default([]),
  /** Estimated cost of this call in USD */
  costUSD: z.number().min(0).default(0),
  /** End-to-end latency in ms */
  latencyMs: z.number().int().min(0),
  /** Provider used (openai | azure) */
  provider: z.enum(["openai", "azure", "fallback"]),
  /** Depth mode used */
  mode: SearchModeSchema,
  /** Number of tokens consumed (input) */
  tokensIn: z.number().int().min(0).default(0),
  /** Number of tokens consumed (output) */
  tokensOut: z.number().int().min(0).default(0),
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
  /** Domain ban-list override */
  bannedDomains: z.array(z.string()).optional(),
  /** Max pages to fetch/open */
  maxPages: z.number().int().min(1).max(20).optional(),
  /** Context size override */
  searchContextSize: SearchContextSizeSchema.optional(),
  /** Locale / language hint */
  locale: z.string().optional(),
  /** User location hint */
  userLocation: z.object({
    city: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
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
  /** Ordered list of citations extracted from API annotations */
  citations: z.array(CitationSchema),
  /** All sources returned / opened during search */
  sources: z.array(SourceSchema),
  /** Debug & observability payload */
  debug: SearchDebugSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ---------------------------------------------------------------------------
// WebSearchConfig – loaded from config/web-search.json + env overrides
// ---------------------------------------------------------------------------

export const WebSearchConfigSchema = z.object({
  mode: SearchModeSchema.default("lookup"),
  allowedDomains: z.array(z.string()).default([]),
  bannedDomains: z.array(z.string()).default([]),
  maxPages: z.number().int().min(1).max(20).default(6),
  searchContextSize: SearchContextSizeSchema.default("medium"),
  defaultLocale: z.string().default("en-IN"),
  userLocation: z.object({
    city: z.string().optional(),
    country: z.string().optional(),
  }).default({}),
  timeoutMs: z.object({
    lookup: z.number().int().default(6000),
    agentic: z.number().int().default(20000),
    deep: z.number().int().default(240000),
  }).default({}),
  maxCostUSD: z.number().min(0).default(0.25),
  retries: z.number().int().min(0).default(3),
  retryBaseDelayMs: z.number().int().min(0).default(1000),
});
export type WebSearchConfig = z.infer<typeof WebSearchConfigSchema>;

// ---------------------------------------------------------------------------
// Metric event types for observability hooks
// ---------------------------------------------------------------------------

export interface MetricEvent {
  type: "tool.web_search.start" | "tool.web_search.done" | "tool.web_search.error";
  callId: string;
  timestamp: number;
  mode: SearchMode;
  provider: "openai" | "azure" | "fallback";
  /** Present on done events */
  latencyMs?: number;
  costUSD?: number;
  tokensIn?: number;
  tokensOut?: number;
  citationCount?: number;
  /** Present on error events */
  error?: string;
  errorCode?: string;
  /** Action types performed during this call */
  actions?: SearchAction[];
}
