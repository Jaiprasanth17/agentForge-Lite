/**
 * Web Search Tool – Unified Entry Point
 *
 * Production-grade web search using OpenAI Responses API with automatic
 * Azure OpenAI fallback when AZURE_OPENAI_ENABLED=true.
 *
 * Features:
 * - Three depth modes: lookup (fast), agentic (evidence-gathering), deep (thorough)
 * - Domain allow-list and ban-list filtering
 * - Citations always present (Markdown links mapped to API annotations)
 * - Configurable context size and user location hints
 * - Observability hooks: metric events for start/done/error
 * - Cost cap per call with auto-downgrade to lookup
 * - Graceful fallback to legacy DuckDuckGo search if API keys missing
 *
 * Config: apps/server/config/web-search.json + env vars
 * Env: WEB_SEARCH_ENABLED, AZURE_OPENAI_ENABLED, WEB_SEARCH_MODE, ALLOWED_DOMAINS
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { WebSearchConfigSchema } from "./schemas";
import type {
  SearchRequest,
  SearchResponse,
  WebSearchConfig,
  MetricEvent,
  SearchMode,
} from "./schemas";
import { plan } from "./planner";
import { openaiWebSearch } from "./provider.openai";
import { azureWebSearch, isAzureEnabled } from "./provider.azure";
import { rerank } from "./reranker";

// Re-export all sub-modules for external use
export { plan, inferMode, isDomainAllowed, filterDomains } from "./planner";
export type { PlannedQuery } from "./planner";
export { openaiWebSearch } from "./provider.openai";
export { azureWebSearch, isAzureEnabled } from "./provider.azure";
export { rerank, mergeSearchResults } from "./reranker";
export type { RankedSource, RerankerOptions } from "./reranker";
export * from "./schemas";

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

let _config: WebSearchConfig | null = null;

export function loadConfig(): WebSearchConfig {
  if (_config) return _config;

  let rawConfig: Record<string, unknown> = {};

  // Load from config/web-search.json
  try {
    const configPath = resolve(__dirname, "../../../../config/web-search.json");
    const raw = readFileSync(configPath, "utf-8");
    rawConfig = JSON.parse(raw);
  } catch {
    console.warn("[WebSearch] config/web-search.json not found, using defaults");
  }

  // Apply env overrides
  if (process.env.WEB_SEARCH_MODE) {
    rawConfig.mode = process.env.WEB_SEARCH_MODE;
  }
  if (process.env.ALLOWED_DOMAINS) {
    rawConfig.allowedDomains = process.env.ALLOWED_DOMAINS.split(",").map((d) => d.trim());
  }

  _config = WebSearchConfigSchema.parse(rawConfig);
  return _config;
}

/** Reset cached config (useful for testing) */
export function resetConfig(): void {
  _config = null;
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export function isWebSearchEnabled(): boolean {
  // Default to true if env var not set
  const flag = process.env.WEB_SEARCH_ENABLED;
  if (flag === undefined) return true;
  return flag === "true" || flag === "1";
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

type MetricListener = (event: MetricEvent) => void;
const listeners: MetricListener[] = [];

export function onMetric(listener: MetricListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function emit(event: MetricEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[WebSearch] Metric listener error:", err);
    }
  }
  // Also log structured event
  const tag = event.type.split(".").pop();
  console.log(
    `[WebSearch:${tag}] callId=${event.callId} mode=${event.mode} provider=${event.provider}` +
    (event.latencyMs !== undefined ? ` latency=${event.latencyMs}ms` : "") +
    (event.costUSD !== undefined ? ` cost=$${event.costUSD.toFixed(4)}` : "") +
    (event.error ? ` error=${event.error}` : "")
  );
}

// ---------------------------------------------------------------------------
// Fallback to legacy DuckDuckGo search
// ---------------------------------------------------------------------------

async function fallbackSearch(query: string): Promise<SearchResponse> {
  // Import the legacy search module
  const { searchWeb } = await import("../web_search/search_web");
  const { compressText } = await import("../web_search/compress");

  const startTime = Date.now();
  const results = await searchWeb([query]);

  const citations = results.map((r, i) => ({
    index: i + 1,
    title: r.title,
    url: r.url,
    startIndex: undefined,
    endIndex: undefined,
  }));

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    credibilityScore: undefined,
  }));

  // Build a simple answer with citations
  const answerParts = results.map(
    (r, i) => `[${i + 1}] **${r.title}**: ${compressText(r.snippet, 50)} ([source](${r.url}))`
  );
  const answer = answerParts.length > 0
    ? `Here are the search results:\n\n${answerParts.join("\n\n")}`
    : "No results found for the given query.";

  return {
    answer,
    citations,
    sources,
    debug: {
      callId: `fallback_${Date.now()}`,
      actions: [{ type: "search" as const }],
      costUSD: 0,
      latencyMs: Date.now() - startTime,
      provider: "fallback",
      mode: "lookup",
      tokensIn: 0,
      tokensOut: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Unified search() entry point
// ---------------------------------------------------------------------------

/**
 * Perform a production-grade web search.
 *
 * Routes to OpenAI Responses API by default, or Azure OpenAI when
 * AZURE_OPENAI_ENABLED=true. Falls back to legacy DuckDuckGo search
 * if no API keys are configured.
 *
 * @param request - Search request parameters
 * @returns SearchResponse with answer, citations, sources, and debug info
 */
export async function search(request: SearchRequest): Promise<SearchResponse> {
  const config = loadConfig();
  const planned = plan(request, config);
  const callId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Check feature flag
  if (!isWebSearchEnabled()) {
    return {
      answer: "Web search is currently disabled. Enable with WEB_SEARCH_ENABLED=true.",
      citations: [],
      sources: [],
      debug: {
        callId,
        actions: [],
        costUSD: 0,
        latencyMs: 0,
        provider: "fallback",
        mode: planned.mode,
        tokensIn: 0,
        tokensOut: 0,
      },
    };
  }

  // Emit start event
  const provider = isAzureEnabled() ? "azure" : "openai";
  emit({
    type: "tool.web_search.start",
    callId,
    timestamp: Date.now(),
    mode: planned.mode,
    provider,
  });

  try {
    let result: SearchResponse;

    // Check if we have the necessary API keys
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAzure = isAzureEnabled() && !!process.env.AZURE_OPENAI_API_KEY;

    if (hasAzure) {
      // Azure OpenAI with web_search_preview
      const azureResult = await azureWebSearch(planned, config.retries, config.retryBaseDelayMs);
      result = {
        answer: azureResult.answer,
        citations: azureResult.citations,
        sources: azureResult.sources,
        debug: { ...azureResult.debug, callId },
      };
    } else if (hasOpenAI) {
      // OpenAI Responses API with web_search
      const openaiResult = await openaiWebSearch(planned, config.retries, config.retryBaseDelayMs);
      result = {
        answer: openaiResult.answer,
        citations: openaiResult.citations,
        sources: openaiResult.sources,
        debug: { ...openaiResult.debug, callId },
      };
    } else {
      // Fallback to legacy DuckDuckGo search
      console.warn(
        "[WebSearch] No OpenAI or Azure API keys found. Falling back to legacy DuckDuckGo search."
      );
      result = await fallbackSearch(request.query);
      result.debug.callId = callId;
    }

    // Cost cap check: if cost exceeds limit and mode isn't already lookup, warn
    if (result.debug.costUSD > planned.maxCostUSD) {
      console.warn(
        `[WebSearch] Cost $${result.debug.costUSD.toFixed(4)} exceeds cap $${planned.maxCostUSD.toFixed(4)}. ` +
        `Consider downgrading to lookup mode.`
      );
    }

    // Rerank sources
    const reranked = rerank(result.sources, result.citations, {
      topK: planned.maxPages,
      allowedDomains: planned.allowedDomains,
    });
    result.sources = reranked.sources;
    result.citations = reranked.citations;

    // Emit done event
    emit({
      type: "tool.web_search.done",
      callId,
      timestamp: Date.now(),
      mode: planned.mode,
      provider: result.debug.provider,
      latencyMs: result.debug.latencyMs,
      costUSD: result.debug.costUSD,
      tokensIn: result.debug.tokensIn,
      tokensOut: result.debug.tokensOut,
      citationCount: result.citations.length,
      actions: result.debug.actions,
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Emit error event
    emit({
      type: "tool.web_search.error",
      callId,
      timestamp: Date.now(),
      mode: planned.mode,
      provider,
      error: errorMsg,
      errorCode: err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : undefined,
    });

    // Try fallback if primary provider failed
    try {
      console.warn(`[WebSearch] Primary provider (${provider}) failed: ${errorMsg}. Trying fallback...`);
      const fallbackResult = await fallbackSearch(request.query);
      fallbackResult.debug.callId = callId;
      return fallbackResult;
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`Web search failed (${provider}: ${errorMsg}, fallback: ${fallbackMsg})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience: auto-downgrade mode if cost budget would be exceeded
// ---------------------------------------------------------------------------

/**
 * Search with automatic mode downgrade if the estimated cost for a higher
 * mode would exceed the budget.
 */
export async function searchWithBudget(
  request: SearchRequest,
  costBudgetUSD?: number,
): Promise<SearchResponse> {
  const config = loadConfig();
  const budget = costBudgetUSD ?? config.maxCostUSD;

  // If mode is deep or agentic but budget is very low, downgrade
  let effectiveMode: SearchMode = request.mode ?? config.mode;
  if (budget <= 0.05 && effectiveMode === "deep") {
    console.log("[WebSearch] Budget too low for deep mode, downgrading to agentic");
    effectiveMode = "agentic";
  }
  if (budget <= 0.02 && effectiveMode === "agentic") {
    console.log("[WebSearch] Budget too low for agentic mode, downgrading to lookup");
    effectiveMode = "lookup";
  }

  return search({ ...request, mode: effectiveMode, maxCostUSD: budget });
}
