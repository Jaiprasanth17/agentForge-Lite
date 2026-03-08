/**
 * Azure OpenAI Web Search Provider (Preview)
 *
 * Uses Azure OpenAI's `web_search_preview` tool type for web search
 * grounded with Bing. Automatically activated when AZURE_OPENAI_ENABLED=true.
 *
 * Key differences from OpenAI provider:
 * - Tool type is "web_search_preview" instead of "web_search"
 * - Uses Azure-specific endpoint and API key
 * - Subject to Grounding with Bing data-flow and governance constraints
 * - Requires Azure OpenAI deployment name instead of model name
 *
 * Reference: https://learn.microsoft.com/azure/foundry/openai/how-to/web-search
 *
 * COMPLIANCE NOTES:
 * - Data from Bing is subject to Microsoft's privacy policy
 * - Search results may be logged by Azure for abuse monitoring
 * - Ensure your Azure subscription allows Grounding with Bing
 * - Review data residency requirements for your region
 */

import type { PlannedQuery } from "./planner";
import type { Citation, Source, SearchAction, SearchDebug } from "./schemas";

// ---------------------------------------------------------------------------
// Types (mirrors OpenAI structure with Azure-specific fields)
// ---------------------------------------------------------------------------

export interface AzureSearchResult {
  answer: string;
  citations: Citation[];
  sources: Source[];
  debug: SearchDebug;
}

interface AzureResponsesAPIResponse {
  id: string;
  output: AzureOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface AzureOutputItem {
  type: string;
  content?: AzureContentBlock[];
  id?: string;
  status?: string;
  action?: { type: string; url?: string; query?: string };
}

interface AzureContentBlock {
  type: string;
  text?: string;
  annotations?: AzureAnnotation[];
}

interface AzureAnnotation {
  type: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getAzureApiKey(): string {
  return process.env.AZURE_OPENAI_API_KEY || "";
}

function getAzureEndpoint(): string {
  return process.env.AZURE_OPENAI_ENDPOINT || "";
}

function getAzureDeployment(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT || "";
}

function getAzureApiVersion(): string {
  return process.env.AZURE_OPENAI_API_VERSION || "2025-03-01-preview";
}

export function isAzureEnabled(): boolean {
  return process.env.AZURE_OPENAI_ENABLED === "true";
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

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
  throw lastError ?? new Error("Azure fetch failed after retries");
}

// ---------------------------------------------------------------------------
// Citation & action extraction (same structure as OpenAI, tool type differs)
// ---------------------------------------------------------------------------

function extractCitations(output: AzureOutputItem[]): Citation[] {
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

function extractActions(output: AzureOutputItem[]): { actions: SearchAction[]; callId: string } {
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

function extractAnswer(response: AzureResponsesAPIResponse): string {
  if (response.output_text) return response.output_text;

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

function citationsToSources(citations: Citation[]): Source[] {
  return citations.map((c) => ({
    title: c.title,
    url: c.url,
    snippet: "",
    credibilityScore: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Main Azure search function
// ---------------------------------------------------------------------------

export async function azureWebSearch(
  planned: PlannedQuery,
  retries: number = 3,
  retryBaseDelayMs: number = 1000,
): Promise<AzureSearchResult> {
  const apiKey = getAzureApiKey();
  const endpoint = getAzureEndpoint();
  const deployment = getAzureDeployment();

  if (!apiKey || !endpoint || !deployment) {
    throw new Error(
      "Azure OpenAI not fully configured. Required: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT"
    );
  }

  // Emit compliance banner
  console.log(
    "[WebSearch:Azure] Using Azure OpenAI web_search_preview. " +
    "Results are grounded with Bing and subject to Microsoft's privacy policy and " +
    "Azure AI Services terms. Ensure Grounding with Bing is enabled on your subscription."
  );

  const startTime = Date.now();
  const apiVersion = getAzureApiVersion();

  const url = `${endpoint}/openai/deployments/${deployment}/responses?api-version=${apiVersion}`;

  const body = {
    input: planned.prompt,
    tools: [
      {
        type: "web_search_preview",
        ...(planned.searchContextSize ? { search_context_size: planned.searchContextSize } : {}),
      },
    ],
  };

  const resp = await retryFetch(
    url,
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
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
    throw new Error(`Azure OpenAI Responses API error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as AzureResponsesAPIResponse;
  const latencyMs = Date.now() - startTime;

  const answer = extractAnswer(data);
  const citations = extractCitations(data.output);
  const { actions, callId } = extractActions(data.output);
  const sources = citationsToSources(citations);

  const tokensIn = data.usage?.input_tokens ?? 0;
  const tokensOut = data.usage?.output_tokens ?? 0;
  // Azure pricing varies by deployment; use a conservative estimate
  const costUSD = (tokensIn * 0.15 + tokensOut * 0.60) / 1_000_000;

  return {
    answer,
    citations,
    sources,
    debug: {
      callId: callId || data.id,
      actions,
      costUSD,
      latencyMs,
      provider: "azure",
      mode: planned.mode,
      tokensIn,
      tokensOut,
    },
  };
}
