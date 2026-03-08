/**
 * OpenAI Responses API Web Search Provider
 *
 * Uses the OpenAI Responses API with `tools: [{ type: "web_search" }]` to
 * perform production-grade web searches with built-in citations.
 *
 * Features:
 * - Citations parsing from message annotations
 * - Action log extraction (search, open_page, find_in_page)
 * - Configurable timeout and retries with exponential backoff
 * - Cost tracking from API usage data
 * - Mode-specific model selection via OPENAI_WEB_SEARCH_MODEL env var
 *
 * Reference: [REF A] https://developers.openai.com/api/docs/guides/tools-web-search
 */

import type { PlannedQuery } from "./planner";
import type { Citation, Source, SearchDebug, SearchMode, RetryConfig } from "./schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenAISearchResult {
  answer: string;
  citations: Citation[];
  sources: Source[];
  debug: SearchDebug;
}

interface ResponsesAPIBody {
  model: string;
  input: string;
  tools: Record<string, unknown>[];
  /** Optional: used for streaming */
  stream?: boolean;
}

interface AnnotationObject {
  type: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  annotations?: AnnotationObject[];
}

interface OutputItem {
  type: string;
  /** For message items */
  content?: ContentBlock[];
  /** For web_search_call items */
  id?: string;
  status?: string;
  action?: { type: string; url?: string; query?: string };
}

interface ResponsesAPIResponse {
  id: string;
  output: OutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

// ---------------------------------------------------------------------------
// Model selection – OPENAI_WEB_SEARCH_MODEL with mode-specific defaults
// ---------------------------------------------------------------------------

const MODE_DEFAULT_MODELS: Record<SearchMode, string> = {
  lookup: "gpt-4o-mini",
  agentic: "gpt-4o",
  deep: "gpt-4o",
};

export function getModel(mode: SearchMode): string {
  return process.env.OPENAI_WEB_SEARCH_MODEL || MODE_DEFAULT_MODELS[mode];
}

function getApiKey(): string {
  return process.env.OPENAI_API_KEY || "";
}

// ---------------------------------------------------------------------------
// Retry helper with exponential backoff (exponent from config)
// ---------------------------------------------------------------------------

export async function retryFetch(
  url: string,
  init: RequestInit,
  retryConfig: RetryConfig,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retryConfig.max; attempt++) {
    try {
      const resp = await fetch(url, init);
      // Retry on 429 (rate limit) and 5xx
      if (resp.ok || (resp.status < 500 && resp.status !== 429)) {
        return resp;
      }
      lastError = new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < retryConfig.max) {
      const delay =
        retryConfig.baseDelayMs * Math.pow(retryConfig.exponent, attempt) +
        Math.random() * retryConfig.baseDelayMs;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error("Fetch failed after retries");
}

// ---------------------------------------------------------------------------
// Citation extraction from message annotations [REF A]
// ---------------------------------------------------------------------------

function extractCitations(output: OutputItem[]): Citation[] {
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();

  for (const item of output) {
    if (item.type !== "message" || !item.content) continue;
    for (const block of item.content) {
      if (block.type !== "output_text" || !block.annotations) continue;
      for (const ann of block.annotations) {
        if (ann.type === "url_citation" && ann.url && !seenUrls.has(ann.url)) {
          seenUrls.add(ann.url);
          citations.push({
            url: ann.url,
            title: ann.title || undefined,
          });
        }
      }
    }
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Action log extraction from web_search_call items [REF A]
// ---------------------------------------------------------------------------

function extractSources(output: OutputItem[]): Source[] {
  const sources: Source[] = [];

  for (const item of output) {
    if (item.type === "web_search_call") {
      if (item.action) {
        const actionType = item.action.type as "search" | "open_page" | "find_in_page";
        if (["search", "open_page", "find_in_page"].includes(actionType)) {
          sources.push({
            url: item.action.url || item.action.query || "",
            action: actionType,
            id: item.id || "",
          });
        }
      }
    }
  }

  return sources;
}

// ---------------------------------------------------------------------------
// Extract answer text from the response
// ---------------------------------------------------------------------------

function extractAnswer(response: ResponsesAPIResponse): string {
  // Prefer output_text (convenience field)
  if (response.output_text) return response.output_text;

  // Fall back to parsing output items
  for (const item of response.output) {
    if (item.type === "message" && item.content) {
      for (const block of item.content) {
        if (block.type === "output_text" && block.text) {
          return block.text;
        }
      }
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// Cost estimation [REF A – tool calls have additional cost]
// ---------------------------------------------------------------------------

/** Rough cost estimation based on model and token counts */
export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  // Pricing per 1M tokens (approximate, varies by model)
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4.1": { input: 2.00, output: 8.00 },
    "gpt-4.1-mini": { input: 0.40, output: 1.60 },
    "gpt-4.1-nano": { input: 0.10, output: 0.40 },
    "gpt-5": { input: 3.00, output: 12.00 },
    "o3-mini": { input: 1.10, output: 4.40 },
  };

  const p = pricing[model] || pricing["gpt-4o-mini"];
  // Add estimated web_search tool-call cost (~$0.03 per search call)
  const toolCallCost = 0.03;
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000 + toolCallCost;
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export async function openaiWebSearch(
  planned: PlannedQuery,
  retryConfig: RetryConfig,
): Promise<OpenAISearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured. Cannot perform web search.");
  }

  const model = getModel(planned.mode);
  const startTime = Date.now();

  // Build tool configuration [REF A]
  const webSearchTool: Record<string, unknown> = {
    type: "web_search",
    ...(planned.searchContextSize ? { search_context_size: planned.searchContextSize } : {}),
  };

  // Apply user_location if available [REF A]
  if (planned.userLocation && (planned.userLocation.city || planned.userLocation.country)) {
    const loc: Record<string, string> = { type: "approximate" };
    if (planned.userLocation.city) loc.city = planned.userLocation.city;
    if (planned.userLocation.country) loc.country = planned.userLocation.country;
    webSearchTool.user_location = loc;
  }

  const body: ResponsesAPIBody = {
    model,
    input: planned.prompt,
    tools: [webSearchTool],
  };

  const resp = await retryFetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(planned.timeoutMs),
    },
    retryConfig,
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI Responses API error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as ResponsesAPIResponse;
  const latencyMs = Date.now() - startTime;

  // Extract structured data
  const answer = extractAnswer(data);
  const citations = extractCitations(data.output);
  const sources = extractSources(data.output);

  const tokensIn = data.usage?.input_tokens ?? 0;
  const tokensOut = data.usage?.output_tokens ?? 0;
  const costUSD = estimateCost(model, tokensIn, tokensOut);

  return {
    answer,
    citations,
    sources,
    debug: {
      toolCalls: data.output.filter((o) => o.type === "web_search_call"),
      latencyMs,
      cost: { toolCallsUSD: costUSD },
    },
  };
}
