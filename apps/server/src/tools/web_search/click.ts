/**
 * click tool: Fetches webpage content by URL.
 * Extracts main content, strips navigation/ads, returns clean text.
 * Supports retry with backoff, caching, and fallback to cached versions.
 */

import { retryWithBackoff } from "./utils";
import { pageCache } from "./cache";
import { extractMainContent, extractTitle } from "./extract";

/** Maximum page size to process (5MB) */
const MAX_PAGE_SIZE = 5 * 1024 * 1024;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Fetch a webpage and return its raw HTML.
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Check content type - only process HTML
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Non-HTML content type: ${contentType}`);
  }

  // Read with size limit
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalSize += value.length;
    if (totalSize > MAX_PAGE_SIZE) {
      reader.cancel();
      break;
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let html = "";
  for (const chunk of chunks) {
    html += decoder.decode(chunk, { stream: true });
  }
  html += decoder.decode();

  return html;
}

/**
 * Try to fetch a Google cached version of a page.
 */
async function fetchCachedVersion(url: string): Promise<string | null> {
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
    const response = await fetch(cacheUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Cache fetch failed silently
  }
  return null;
}

export interface ClickResult {
  url: string;
  title: string;
  content: string;
  fromCache: boolean;
  error?: string;
}

/**
 * Click (fetch) a URL and return extracted text content.
 * Handles errors gracefully with fallback to cached version.
 * 
 * @param urlOrId - URL or SERP result identifier
 * @returns ClickResult with extracted content
 */
export async function clickUrl(urlOrId: string): Promise<ClickResult> {
  // Resolve URL (could be a direct URL or a SERP result ID)
  const url = urlOrId.startsWith("http") ? urlOrId : urlOrId;

  // Check page cache first
  const cached = pageCache.get(url);
  if (cached) {
    return {
      url,
      title: "",
      content: cached,
      fromCache: true,
    };
  }

  try {
    // Fetch with retry
    const html = await retryWithBackoff(() => fetchPage(url), 3, 1000);

    // Extract content
    const title = extractTitle(html);
    const content = extractMainContent(html);

    if (!content || content.length < 50) {
      return {
        url,
        title,
        content: content || "Page content could not be extracted (too short or empty).",
        fromCache: false,
        error: "Content extraction yielded minimal text",
      };
    }

    // Cache the extracted content
    pageCache.set(url, content);

    return {
      url,
      title,
      content,
      fromCache: false,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[WebSearch:click] Failed to fetch ${url}: ${errorMsg}`);

    // Try cached version as fallback
    const cachedHtml = await fetchCachedVersion(url);
    if (cachedHtml) {
      const title = extractTitle(cachedHtml);
      const content = extractMainContent(cachedHtml);
      if (content && content.length > 50) {
        pageCache.set(url, content);
        return {
          url,
          title,
          content,
          fromCache: true,
        };
      }
    }

    // Return error with uncertainty disclaimer
    return {
      url,
      title: "",
      content: `Unable to fetch page content. Error: ${errorMsg}. The information from this source could not be verified.`,
      fromCache: false,
      error: errorMsg,
    };
  }
}
