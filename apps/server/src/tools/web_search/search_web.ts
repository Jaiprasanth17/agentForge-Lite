/**
 * search_web tool: Performs web search queries via DuckDuckGo HTML.
 * Returns top 5 SERP results with title, url, snippet, and id.
 * Supports retry with exponential backoff and query broadening on empty results.
 */

import { constructQuery, retryWithBackoff, broadenQuery, generateAlternativeQueries, MAX_SERP_RESULTS } from "./utils";
import { serpCache } from "./cache";
import { rankResults } from "./scorer";
import type { SerpResult } from "./cache";

/**
 * Parse DuckDuckGo HTML search results page.
 */
function parseDuckDuckGoHtml(html: string): SerpResult[] {
  const results: SerpResult[] = [];

  // DuckDuckGo HTML results are in <div class="result"> or <div class="web-result">
  // Each result has: <a class="result__a" href="...">title</a> and <a class="result__snippet">snippet</a>

  // Pattern 1: Standard DDG HTML results
  const resultBlocks = html.match(/<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?(?=<div[^>]*class="[^"]*result[^"]*"|$)/gi) || [];

  for (const block of resultBlocks) {
    // Extract URL from result link
    const urlMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>/i)
      || block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*result/i)
      || block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i);

    if (!urlMatch) continue;

    let url = urlMatch[1];
    // DDG sometimes wraps URLs in a redirect
    if (url.includes("uddg=")) {
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }
    }

    // Skip DDG internal links
    if (url.startsWith("/") || url.includes("duckduckgo.com")) continue;

    // Extract title
    const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href="https?:\/\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      : url;

    // Extract snippet
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<span[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      || block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      : "";

    if (title && url.startsWith("http")) {
      results.push({
        id: `serp_${results.length}`,
        title: title.slice(0, 200),
        url,
        snippet: snippet.slice(0, 300),
      });
    }

    if (results.length >= MAX_SERP_RESULTS) break;
  }

  return results;
}

/**
 * Perform a single search query against DuckDuckGo HTML.
 */
async function searchDuckDuckGo(query: string): Promise<SerpResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseDuckDuckGoHtml(html);
}

/**
 * Perform a web search with retry, broadening, and caching.
 * Returns top 5 ranked SERP results.
 *
 * @param queries - Array of search queries to execute
 * @returns Array of SerpResult objects
 */
export async function searchWeb(queries: string[]): Promise<SerpResult[]> {
  const allResults: SerpResult[] = [];
  const seenUrls = new Set<string>();

  for (const rawQuery of queries) {
    const query = constructQuery(rawQuery);
    if (!query) continue;

    // Check cache first
    const cached = serpCache.get(query);
    if (cached) {
      for (const r of cached) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
      continue;
    }

    try {
      // Search with retry
      let results = await retryWithBackoff(() => searchDuckDuckGo(query), 3, 1000);

      // If 0 results, try broader query
      if (results.length === 0) {
        const broader = broadenQuery(query);
        if (broader !== query) {
          console.log(`[WebSearch] 0 results for "${query}", trying broader: "${broader}"`);
          results = await retryWithBackoff(() => searchDuckDuckGo(broader), 2, 500);
        }
      }

      // If still 0, try alternative queries
      if (results.length === 0) {
        const alternatives = generateAlternativeQueries(rawQuery);
        for (const alt of alternatives) {
          if (results.length > 0) break;
          console.log(`[WebSearch] Trying alternative query: "${alt}"`);
          results = await retryWithBackoff(() => searchDuckDuckGo(alt), 1, 500);
        }
      }

      // Cache results
      if (results.length > 0) {
        serpCache.set(query, results);
      }

      // Deduplicate by URL
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    } catch (err) {
      console.error(`[WebSearch] Search failed for "${query}":`, err instanceof Error ? err.message : err);
    }
  }

  // Rank by credibility and return top results
  const ranked = rankResults(allResults);
  return ranked.slice(0, MAX_SERP_RESULTS).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    snippet: r.snippet,
  }));
}
