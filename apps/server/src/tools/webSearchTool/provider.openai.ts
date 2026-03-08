/**
 * OpenAI Responses API Web Search Provider
 *
 * Uses the OpenAI Responses API with `tools: [{ type: "web_search" }]` to
 * perform production-grade web searches with built-in citations.
 *
 * Features:
 * - Citations parsing from message annotations
 * - Action log extraction (search, open_page, find_in_page)
 * - Configurable timeout and retries
 * - Cost tracking from API usage data
 * - Streaming support for real-time results
 *
 * Reference: https://developers.openai.com/api/docs/guides/tools-web-search
 */

import type { PlannedQuery } from "./planner";
import type { Citation, Source, SearchAction, SearchDebug } from "./schemas";

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
  tools: { type: string; search_context_size?: string }[];
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
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  return process.env.OPENAI_API_KEY || "";
}

function getModel(): string {
  return process.env.WEB_SEARCH_MODEL || "gpt-4o-mini";
}

/** Retry helper with exponential backoff and jitter */
async function retryFetch(
  url: string,
  init: RequestInit,
  retries: number,
  baseDelayMs: number,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
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
    if (attempt < retries) {
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error("Fetch failed after retries");
}

// ---------------------------------------------------------------------------
// Citation extraction from message annotations
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
            index: citations.length + 1,
            title: ann.title || ann.url,
            url: ann.url,
            startIndex: ann.start_index,
            endIndex: ann.end_index,
          });
        }
      }
    }
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Action log extraction from web_search_call items
// ---------------------------------------------------------------------------

function extractActions(output: OutputItem[]): { actions: SearchAction[]; callId: string } {
  const actions: SearchAction[] = [];
  let callId = "";

  for (const item of output) {
    if (item.type === "web_search_call") {
      if (item.id) callId = item.id;
      if (item.action) {
        const actionType = item.action.type as "search" | "open_page" | "find_in_page";
        if (["search", "open_page", "find_in_page"].includes(actionType)) {
          actions.push({
            type: actionType,
            url: item.action.url || item.action.query,
          });
        }
      }
    }
  }

  return { actions, callId };
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
// Sources extraction from citations
// ---------------------------------------------------------------------------

function citationsToSources(citations: Citation[]): Source[] {
  return citations.map((c) => ({
    title: c.title,
    url: c.url,
    snippet: "",
    credibilityScore: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/** Rough cost estimation based on model and token counts */
function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  // Pricing per 1M tokens (approximate, varies by model)
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4.1": { input: 2.00, output: 8.00 },
    "gpt-4.1-mini": { input: 0.40, output: 1.60 },
    "gpt-4.1-nano": { input: 0.10, output: 0.40 },
    "o3-mini": { input: 1.10, output: 4.40 },
  };

  const p = pricing[model] || pricing["gpt-4o-mini"];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export async function openaiWebSearch(
  planned: PlannedQuery,
  retries: number = 3,
  retryBaseDelayMs: number = 1000,
): Promise<OpenAISearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured. Cannot perform web search.");
  }

  const model = getModel();
  const startTime = Date.now();

  const body: ResponsesAPIBody = {
    model,
    input: planned.prompt,
    tools: [
      {
        type: "web_search",
        ...(planned.searchContextSize ? { search_context_size: planned.searchContextSize } : {}),
      },
    ],
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
    retries,
    retryBaseDelayMs,
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
  const { actions, callId } = extractActions(data.output);
  const sources = citationsToSources(citations);

  const tokensIn = data.usage?.input_tokens ?? 0;
  const tokensOut = data.usage?.output_tokens ?? 0;
  const costUSD = estimateCost(model, tokensIn, tokensOut);

  return {
    answer,
    citations,
    sources,
    debug: {
      callId: callId || data.id,
      actions,
      costUSD,
      latencyMs,
      provider: "openai",
      mode: planned.mode,
      tokensIn,
      tokensOut,
    },
  };
}
