/**
 * Azure OpenAI Web Search Provider (Preview)
 *
 * Uses Azure OpenAI's `web_search_preview` tool type for web search
 * grounded with Bing. Automatically activated when AZURE_OPENAI_ENABLED=true
 * or config.provider === "azure".
 *
 * Key differences from OpenAI provider:
 * - Tool type is "web_search_preview" instead of "web_search"  [REF B]
 * - Uses Azure-specific endpoint and API key
 * - Subject to Grounding with Bing data-flow and governance constraints
 * - Requires Azure OpenAI deployment name instead of model name
 *
 * Reference: [REF B] https://learn.microsoft.com/azure/foundry/openai/how-to/web-search
 *
 * COMPLIANCE NOTES:
 * - Data from Bing is subject to Microsoft's privacy policy
 * - Search results may be logged by Azure for abuse monitoring
 * - Ensure your Azure subscription allows Grounding with Bing
 * - Review data residency requirements for your region
 */

import type { PlannedQuery } from "./planner";
import type { Citation, Source, SearchDebug, RetryConfig } from "./schemas";
import { retryFetch } from "./provider.openai";

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
// Citation & source extraction (same structure as OpenAI, tool type differs)
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
            url: ann.url,
            title: ann.title || undefined,
          });
        }
      }
    }
  }

  return citations;
}

function extractSources(output: AzureOutputItem[]): Source[] {
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

// ---------------------------------------------------------------------------
// Main Azure search function
// ---------------------------------------------------------------------------

export async function azureWebSearch(
  planned: PlannedQuery,
  retryConfig: RetryConfig,
): Promise<AzureSearchResult> {
  const apiKey = getAzureApiKey();
  const endpoint = getAzureEndpoint();
  const deployment = getAzureDeployment();

  if (!apiKey || !endpoint || !deployment) {
    throw new Error(
      "Azure OpenAI not fully configured. Required: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT"
    );
  }

  // Emit compliance banner [REF B]
  console.log(
    "[WebSearch:Azure] Using Azure OpenAI web_search_preview. " +
    "Results are grounded with Bing and subject to Microsoft's privacy policy and " +
    "Azure AI Services terms. Ensure Grounding with Bing is enabled on your subscription."
  );

  const startTime = Date.now();
  const apiVersion = getAzureApiVersion();

  const url = `${endpoint}/openai/deployments/${deployment}/responses?api-version=${apiVersion}`;

  // Build tool configuration – type is "web_search_preview" for Azure [REF B]
  const webSearchTool: Record<string, unknown> = {
    type: "web_search_preview",
    ...(planned.searchContextSize ? { search_context_size: planned.searchContextSize } : {}),
  };

  // Apply user_location if available
  if (planned.userLocation && (planned.userLocation.city || planned.userLocation.country)) {
    const loc: Record<string, string> = { type: "approximate" };
    if (planned.userLocation.city) loc.city = planned.userLocation.city;
    if (planned.userLocation.country) loc.country = planned.userLocation.country;
    webSearchTool.user_location = loc;
  }

  const body = {
    input: planned.prompt,
    tools: [webSearchTool],
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
    retryConfig,
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Azure OpenAI Responses API error (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as AzureResponsesAPIResponse;
  const latencyMs = Date.now() - startTime;

  const answer = extractAnswer(data);
  const citations = extractCitations(data.output);
  const sources = extractSources(data.output);

  const tokensIn = data.usage?.input_tokens ?? 0;
  const tokensOut = data.usage?.output_tokens ?? 0;
  // Azure pricing varies by deployment; use a conservative estimate + tool call cost
  const costUSD = (tokensIn * 0.15 + tokensOut * 0.60) / 1_000_000 + 0.03;

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
