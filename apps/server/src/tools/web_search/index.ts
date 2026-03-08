/**
 * Web Search Module - Entry point
 *
 * Registers two tools:
 * 1. search_web - Performs web search queries, returns top 5 SERP results
 *    (delegates to production-grade webSearchTool when API keys available)
 * 2. click - Fetches and extracts content from a specific URL
 *
 * Also exports the query rewrite agent and compression utilities.
 */

import { z } from "zod";
import { registerTool } from "../registry";
import { searchWeb } from "./search_web";
import { clickUrl } from "./click";
import { compressText, compressSources, formatWithCitations } from "./compress";
import { filterTopResults } from "./scorer";
import { rewriteQuery, shouldSearch } from "./queryRewrite";
import { estimateTokens, MAX_SEARCH_CONTENT_TOKENS } from "./utils";
import type { SerpResult } from "./cache";
import { lastSerpResults } from "./cache";
import { search as productionSearch, isWebSearchEnabled } from "../webSearchTool";
import type { SearchResponse } from "../webSearchTool";

// ---------------------------------------------------------------------------
// search_web tool registration
// ---------------------------------------------------------------------------

registerTool({
  name: "search_web",
  description:
    "Search the web for information. Use when user asks for current events, facts beyond model knowledge, or when unsure.",
  inputSchema: z.object({
    queries: z
      .array(z.string().min(1))
      .min(1)
      .max(5)
      .describe("List of focused search queries"),
  }),
  async handler(_ctx, input) {
    const { queries } = input as { queries: string[] };

    try {
      // Try production-grade search (OpenAI Responses API / Azure) first
      const hasProductionKeys = !!(process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY);
      if (hasProductionKeys && isWebSearchEnabled()) {
        try {
          const combinedQuery = queries.join("; ");
          const response: SearchResponse = await productionSearch({ query: combinedQuery });

          // Map response to legacy format for backward compatibility
          lastSerpResults.clear();
          const mapped = response.sources.map((s, i) => {
            const id = `serp_${i}`;
            // Find matching citation for title
            const matchingCitation = response.citations.find((c) => c.url === s.url);
            const title = matchingCitation?.title || s.url;
            lastSerpResults.set(id, { url: s.url, title });
            return { id, title, url: s.url, snippet: s.action };
          });

          return {
            ok: true,
            data: {
              results: mapped,
              count: response.sources.length,
              answer: response.answer,
              citations: response.citations,
              debug: response.debug,
            },
          };
        } catch (productionErr) {
          console.warn(
            "[WebSearch] Production search failed, falling back to legacy:",
            productionErr instanceof Error ? productionErr.message : productionErr
          );
          // Fall through to legacy search
        }
      }

      // Legacy DuckDuckGo search fallback
      const results = await searchWeb(queries);

      if (results.length === 0) {
        return {
          ok: true,
          data: {
            results: [],
            count: 0,
            message: "No results found. Try different search terms.",
          },
        };
      }

      // Store results so click tool can resolve serp_X IDs
      lastSerpResults.clear();
      const mapped = results.map((r: SerpResult, i: number) => {
        const id = `serp_${i}`;
        lastSerpResults.set(id, { url: r.url, title: r.title });
        return { id, title: r.title, url: r.url, snippet: r.snippet };
      });

      return {
        ok: true,
        data: {
          results: mapped,
          count: results.length,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      return {
        ok: false,
        error: `Web search failed: ${message}`,
        code: "SEARCH_FAILED",
      };
    }
  },
});

// ---------------------------------------------------------------------------
// click tool registration
// ---------------------------------------------------------------------------

registerTool({
  name: "click",
  description:
    "Open a specific search result and return the content of the webpage.",
  inputSchema: z.object({
    id: z
      .string()
      .min(1)
      .describe("SERP result identifier or URL"),
  }),
  async handler(_ctx, input) {
    const { id } = input as { id: string };

    // Resolve serp_X ID to actual URL
    let url = id;
    let serpTitle = "";
    if (id.startsWith("serp_")) {
      const stored = lastSerpResults.get(id);
      if (stored) {
        url = stored.url;
        serpTitle = stored.title;
      } else {
        return {
          ok: false,
          error: `Unknown result ID: ${id}. Run search_web first to get result IDs.`,
          code: "INVALID_ID",
        };
      }
    }

    try {
      const result = await clickUrl(url);

      // Compress content to stay within token budget
      const compressed = compressText(result.content, 200);
      const tokens = estimateTokens(compressed);

      return {
        ok: true,
        data: {
          url: url,
          title: result.title || serpTitle,
          content: compressed,
          tokens,
          fromCache: result.fromCache,
        },
        meta: {
          originalLength: result.content.length,
          compressedTokens: tokens,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Click failed";
      return {
        ok: false,
        error: `Failed to fetch page: ${message}`,
        code: "CLICK_FAILED",
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Exports for use by WS handler and workflow runner
// ---------------------------------------------------------------------------

export { searchWeb } from "./search_web";
export { clickUrl } from "./click";
export { compressText, compressSources, formatWithCitations } from "./compress";
export { filterTopResults, rankResults } from "./scorer";
export { rewriteQuery, shouldSearch } from "./queryRewrite";
export { extractMainContent, extractTextFromHtml, extractTitle } from "./extract";
export { estimateTokens, MAX_SEARCH_CONTENT_TOKENS, MAX_TOKENS_PER_SOURCE, MAX_SERP_RESULTS, MAX_CLICK_RESULTS } from "./utils";
export { serpCache, pageCache } from "./cache";
export type { SerpResult } from "./cache";
export type { ClickResult } from "./click";
export type { RewrittenQueries } from "./queryRewrite";
