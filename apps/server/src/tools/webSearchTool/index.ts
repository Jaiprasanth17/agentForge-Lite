/**
 * Web Search Tool - Unified Entry Point
 *
 * Production-grade web search using OpenAI Responses API with automatic
 * Azure OpenAI fallback when AZURE_OPENAI_ENABLED=true or config.provider=azure.
 *
 * Features:
 * - Three depth modes: lookup (fast), agentic (evidence-gathering), deep (thorough)
 * - Domain allow-list and block-list filtering
 * - Citations always present (Markdown links mapped to API annotations)
 * - Circuit breaker: 3 consecutive timeouts in 5 min -> auto-downgrade to lookup
 * - Cost cap: if exceeded mid-run, stop and synthesize with current evidence
 * - Observability hooks: metric events for start/done/error
 * - Graceful fallback to legacy DuckDuckGo search if API keys missing
 *
 * Config: apps/server/config/web-search.json + env vars
 * Env: WEB_SEARCH_ENABLED, AZURE_OPENAI_ENABLED, WEB_SEARCH_MODE,
 *       WEB_SEARCH_ALLOWED_DOMAINS, WEB_SEARCH_TIMEOUT_MS, WEB_SEARCH_MAX_COST_USD,
 *       OPENAI_WEB_SEARCH_MODEL
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
  Citation,
  Source,
  SearchDebug,
} from "./schemas";
import { plan } from "./planner";
import { openaiWebSearch } from "./provider.openai";
import { azureWebSearch, isAzureEnabled } from "./provider.azure";
import { rerank } from "./reranker";

// Re-export all sub-modules for external use
export { plan, inferMode, isDomainAllowed, filterDomains } from "./planner";
export type { PlannedQuery } from "./planner";
export { openaiWebSearch, getModel, estimateCost, retryFetch } from "./provider.openai";
export { azureWebSearch, isAzureEnabled } from "./provider.azure";
export { rerank, mergeSearchResults, scoreDomain, normaliseUrl, textSimilarity } from "./reranker";
export type { RankedCitation, RerankerOptions } from "./reranker";
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
  if (process.env.WEB_SEARCH_ENABLED !== undefined) {
    rawConfig.enabled = process.env.WEB_SEARCH_ENABLED === "true";
  }
  if (process.env.WEB_SEARCH_MODE) {
    rawConfig.mode = process.env.WEB_SEARCH_MODE;
  }
  if (process.env.WEB_SEARCH_ALLOWED_DOMAINS) {
    rawConfig.allowedDomains = process.env.WEB_SEARCH_ALLOWED_DOMAINS.split(",").map(
      (d: string) => d.trim()
    );
  }
  if (process.env.WEB_SEARCH_TIMEOUT_MS) {
    rawConfig.timeoutMs = parseInt(process.env.WEB_SEARCH_TIMEOUT_MS, 10);
  }
  if (process.env.WEB_SEARCH_MAX_COST_USD) {
    rawConfig.maxCostUSD = parseFloat(process.env.WEB_SEARCH_MAX_COST_USD);
  }
  if (process.env.AZURE_OPENAI_ENABLED === "true") {
    rawConfig.provider = "azure";
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
  const config = loadConfig();
  return config.enabled;
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
  // Structured log (redact API keys)
  const tag = event.type.split(".").pop() || "event";
  const parts: string[] = [
    "[WebSearch:" + tag + "]",
    "callId=" + event.callId,
    "mode=" + event.mode,
    "provider=" + event.provider,
  ];
  if (event.latencyMs !== undefined) {
    parts.push("latency=" + event.latencyMs + "ms");
  }
  if (event.costUSD !== undefined) {
    parts.push("cost=$" + event.costUSD.toFixed(4));
  }
  if (event.citationCount !== undefined) {
    parts.push("citations=" + String(event.citationCount));
  }
  if (event.error) {
    parts.push("error=" + event.error);
  }
  console.log(parts.join(" "));
}

// ---------------------------------------------------------------------------
// Circuit Breaker State
// ---------------------------------------------------------------------------

interface CircuitBreakerState {
  failures: number[];
  downgraded: boolean;
  downgradedAt: number;
}

const circuitState: CircuitBreakerState = {
  failures: [],
  downgraded: false,
  downgradedAt: 0,
};

/** Record a timeout failure for circuit breaker tracking */
export function recordTimeout(): void {
  const config = loadConfig();
  const now = Date.now();
  const windowMs = config.circuitBreaker.windowMs;

  circuitState.failures.push(now);

  // Prune failures outside the window
  circuitState.failures = circuitState.failures.filter((t) => now - t < windowMs);

  // Check if we hit the threshold
  if (circuitState.failures.length >= config.circuitBreaker.consecutiveFailures) {
    if (!circuitState.downgraded) {
      console.warn(
        "[WebSearch:CircuitBreaker] WARN: " +
          String(circuitState.failures.length) +
          " consecutive timeouts in " +
          String(windowMs / 1000) +
          "s window. Auto-downgrading to " +
          config.circuitBreaker.downgradeMode +
          " mode."
      );
      circuitState.downgraded = true;
      circuitState.downgradedAt = now;
    }
  }
}

/** Record a successful call - resets circuit breaker */
export function recordSuccess(): void {
  circuitState.failures = [];
  if (circuitState.downgraded) {
    console.log("[WebSearch:CircuitBreaker] Circuit breaker reset after successful call.");
    circuitState.downgraded = false;
    circuitState.downgradedAt = 0;
  }
}

/** Get the effective mode after applying circuit breaker logic */
export function getEffectiveMode(requestedMode: SearchMode): SearchMode {
  if (!circuitState.downgraded) return requestedMode;

  const config = loadConfig();
  const downgradeMode = config.circuitBreaker.downgradeMode;

  const modeOrder: Record<SearchMode, number> = { lookup: 0, agentic: 1, deep: 2 };
  if (modeOrder[requestedMode] > modeOrder[downgradeMode]) {
    return downgradeMode;
  }
  return requestedMode;
}

/** Reset circuit breaker state (for testing) */
export function resetCircuitBreaker(): void {
  circuitState.failures = [];
  circuitState.downgraded = false;
  circuitState.downgradedAt = 0;
}

// ---------------------------------------------------------------------------
// Fallback to legacy DuckDuckGo search
// ---------------------------------------------------------------------------

async function fallbackSearch(query: string): Promise<SearchResponse> {
  const { searchWeb } = await import("../web_search/search_web");
  const { compressText } = await import("../web_search/compress");

  const startTime = Date.now();
  const results = await searchWeb([query]);

  const citations: Citation[] = results.map((r) => ({
    url: r.url,
    title: r.title,
  }));

  const sources: Source[] = results.map((r, i) => ({
    url: r.url,
    action: "search" as const,
    id: "fallback_" + String(i),
  }));

  const answerParts = results.map(
    (r, i) =>
      "[" +
      String(i + 1) +
      "] **" +
      r.title +
      "**: " +
      compressText(r.snippet, 50) +
      " ([source](" +
      r.url +
      "))"
  );
  const answer =
    answerParts.length > 0
      ? "Here are the search results:\n\n" + answerParts.join("\n\n")
      : "No results found for the given query.";

  const latencyMs = Date.now() - startTime;

  return {
    answer,
    citations,
    sources,
    debug: {
      toolCalls: [],
      latencyMs,
      cost: { toolCallsUSD: 0 },
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
 * if no API keys are configured and failOpenToFallback is true.
 *
 * Circuit breaker: 3 consecutive timeouts in 5 min -> auto-downgrade to lookup.
 * Cost cap: if exceeded, synthesize with current evidence.
 */
export async function search(request: SearchRequest): Promise<SearchResponse> {
  const config = loadConfig();

  // Apply circuit breaker to the mode
  const requestedMode = request.mode ?? config.mode;
  const effectiveMode = getEffectiveMode(requestedMode);
  if (effectiveMode !== requestedMode) {
    console.warn(
      "[WebSearch] Circuit breaker active: downgraded from " +
        requestedMode +
        " to " +
        effectiveMode
    );
  }

  const effectiveRequest: SearchRequest = { ...request, mode: effectiveMode };
  const planned = plan(effectiveRequest, config);
  const callId =
    "ws_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);

  // Check feature flag
  if (!isWebSearchEnabled()) {
    return {
      answer:
        "Web search is currently disabled. Enable with WEB_SEARCH_ENABLED=true.",
      citations: [],
      sources: [],
      debug: {
        toolCalls: [],
        latencyMs: 0,
        cost: { toolCallsUSD: 0 },
      },
    };
  }

  // Determine provider
  const provider =
    config.provider === "azure" || isAzureEnabled() ? "azure" : "openai";

  // Emit start event
  emit({
    type: "tool.web_search.start",
    callId,
    timestamp: Date.now(),
    mode: planned.mode,
    provider,
  });

  const startTime = Date.now();

  try {
    let result: SearchResponse;

    // Check if we have the necessary API keys
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAzure =
      (isAzureEnabled() || config.provider === "azure") &&
      !!process.env.AZURE_OPENAI_API_KEY;

    if (hasAzure && provider === "azure") {
      const azureResult = await azureWebSearch(planned, config.retries);
      result = {
        answer: azureResult.answer,
        citations: azureResult.citations,
        sources: azureResult.sources,
        debug: azureResult.debug,
      };
    } else if (hasOpenAI) {
      const openaiResult = await openaiWebSearch(planned, config.retries);
      result = {
        answer: openaiResult.answer,
        citations: openaiResult.citations,
        sources: openaiResult.sources,
        debug: openaiResult.debug,
      };
    } else if (config.failOpenToFallback) {
      console.warn(
        "[WebSearch] No OpenAI or Azure API keys found. Falling back to legacy DuckDuckGo search."
      );
      result = await fallbackSearch(request.query);
    } else {
      throw new Error(
        "No API keys configured and failOpenToFallback is disabled. " +
          "Set OPENAI_API_KEY or AZURE_OPENAI_API_KEY, or enable failOpenToFallback."
      );
    }

    // Record success for circuit breaker
    recordSuccess();

    // Cost cap check
    const costUSD = result.debug.cost.toolCallsUSD;
    if (costUSD > planned.maxCostUSD) {
      console.warn(
        "[WebSearch] Cost $" +
          costUSD.toFixed(4) +
          " exceeds cap $" +
          planned.maxCostUSD.toFixed(4) +
          ". Stopping further actions and synthesizing with current evidence."
      );
    }

    // Rerank citations and sources
    const reranked = rerank(result.citations, result.sources, {
      topK: planned.maxPages,
      allowedDomains: planned.allowedDomains,
    });
    result.citations = reranked.citations;
    result.sources = reranked.sources;

    const latencyMs = Date.now() - startTime;

    // Emit done event
    emit({
      type: "tool.web_search.done",
      callId,
      timestamp: Date.now(),
      mode: planned.mode,
      provider,
      latencyMs,
      costUSD,
      citationCount: result.citations.length,
    });

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      errorMsg.includes("timeout") ||
      errorMsg.includes("abort") ||
      errorMsg.includes("ETIMEDOUT") ||
      errorMsg.includes("TimeoutError");

    // Record timeout for circuit breaker
    if (isTimeout) {
      recordTimeout();
    }

    const latencyMs = Date.now() - startTime;

    // Emit error event
    emit({
      type: "tool.web_search.error",
      callId,
      timestamp: Date.now(),
      mode: planned.mode,
      provider,
      latencyMs,
      error: errorMsg,
      errorCode:
        err instanceof Error && "code" in err
          ? String((err as NodeJS.ErrnoException).code)
          : undefined,
    });

    // Try fallback if primary provider failed and failOpenToFallback is enabled
    if (config.failOpenToFallback) {
      try {
        console.warn(
          "[WebSearch] Primary provider (" +
            provider +
            ") failed: " +
            errorMsg +
            ". Trying fallback..."
        );
        const fallbackResult = await fallbackSearch(request.query);
        return fallbackResult;
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        throw new Error(
          "Web search failed (" +
            provider +
            ": " +
            errorMsg +
            ", fallback: " +
            fallbackMsg +
            ")"
        );
      }
    }

    throw new Error("Web search failed (" + provider + "): " + errorMsg);
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
  costBudgetUSD?: number
): Promise<SearchResponse> {
  const config = loadConfig();
  const budget = costBudgetUSD ?? config.maxCostUSD;

  let effectiveMode: SearchMode = request.mode ?? config.mode;
  if (budget <= 0.05 && effectiveMode === "deep") {
    console.log(
      "[WebSearch] Budget too low for deep mode, downgrading to agentic"
    );
    effectiveMode = "agentic";
  }
  if (budget <= 0.02 && effectiveMode === "agentic") {
    console.log(
      "[WebSearch] Budget too low for agentic mode, downgrading to lookup"
    );
    effectiveMode = "lookup";
  }

  return search({ ...request, mode: effectiveMode, maxCostUSD: budget });
}
