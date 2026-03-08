/**
 * Utility functions for web search: query construction, stop words,
 * token estimation, retry with exponential backoff + jitter.
 */

// Common English stop words to remove from queries
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "shall", "may", "might", "can", "must", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "out",
  "off", "over", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "about", "also", "am", "and", "but", "or", "if", "what", "which",
  "who", "whom", "this", "that", "these", "those", "i", "me", "my",
  "we", "our", "you", "your", "he", "him", "his", "she", "her", "it",
  "its", "they", "them", "their",
]);

/**
 * Remove stop words from a query string to focus on key terms.
 */
export function removeStopWords(query: string): string {
  const words = query.split(/\s+/).filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  return words.length > 0 ? words.join(" ") : query;
}

/**
 * Construct a focused search query:
 * - Remove stop words
 * - Preserve quoted phrases
 * - Preserve site: and date: filters
 */
export function constructQuery(raw: string): string {
  // Extract quoted phrases and filters
  const quoted: string[] = [];
  const filters: string[] = [];

  let cleaned = raw.replace(/"([^"]+)"/g, (_match, p1: string) => {
    quoted.push(`"${p1}"`);
    return "";
  });

  cleaned = cleaned.replace(/\b(site:\S+|after:\S+|before:\S+|filetype:\S+)/gi, (_match, p1: string) => {
    filters.push(p1);
    return "";
  });

  // Remove stop words from the remaining text
  const focused = removeStopWords(cleaned.trim());

  // Reconstruct query
  const parts = [focused, ...quoted, ...filters].filter(Boolean);
  return parts.join(" ").trim();
}

/**
 * Estimate token count for a string (~3.5 chars per token).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff and jitter.
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retries (default 3)
 * @param baseDelayMs - Base delay in milliseconds (default 1000)
 * @returns The result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) break;

      // Exponential backoff with jitter: delay = base * 2^attempt + random jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelayMs;
      const delay = exponentialDelay + jitter;

      console.warn(
        `[WebSearch] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${lastError.message}`
      );
      await sleep(delay);
    }
  }

  throw lastError || new Error("Retry failed");
}

/**
 * Broaden a query by removing filters and simplifying terms.
 * Used when a search returns 0 results.
 */
export function broadenQuery(query: string): string {
  // Remove site: filters
  let broadened = query.replace(/\bsite:\S+/gi, "").trim();
  // Remove quoted phrases (keep the words inside)
  broadened = broadened.replace(/"([^"]+)"/g, "$1");
  // Remove date filters
  broadened = broadened.replace(/\b(after|before):\S+/gi, "").trim();
  return broadened || query;
}

/**
 * Generate synonym-based alternative queries.
 */
export function generateAlternativeQueries(query: string): string[] {
  const alternatives: string[] = [];
  // Add a broader version
  const broadened = broadenQuery(query);
  if (broadened !== query) {
    alternatives.push(broadened);
  }
  // Add version with "what is" prefix for definitional queries
  if (!query.toLowerCase().startsWith("what") && query.split(/\s+/).length <= 4) {
    alternatives.push(`what is ${query}`);
  }
  return alternatives;
}

/** Maximum total tokens for all search content combined */
export const MAX_SEARCH_CONTENT_TOKENS = 600;

/** Maximum tokens per individual source after compression */
export const MAX_TOKENS_PER_SOURCE = 200;

/** Maximum number of SERP results to return */
export const MAX_SERP_RESULTS = 5;

/** Maximum number of results to click/fetch */
export const MAX_CLICK_RESULTS = 3;
