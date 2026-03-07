/**
 * Query Rewrite Agent (Bonus)
 * 
 * Multi-level query refinement:
 * 1. Focused search query - direct, specific
 * 2. Supporting query - broader context
 * 3. Filtered query - with site/date filters for precision
 */

import { removeStopWords } from "./utils";

export interface RewrittenQueries {
  focused: string;
  supporting: string;
  filtered: string;
}

/**
 * Detect if the query relates to recent events (dates, news, releases).
 */
function isRecentEventQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const recentIndicators = [
    /\b202[4-9]\b/,
    /\b203\d\b/,
    /\blatest\b/,
    /\brecent\b/,
    /\bnew\b/,
    /\btoday\b/,
    /\bthis (week|month|year)\b/,
    /\brelease[ds]?\b/,
    /\bupdate[ds]?\b/,
    /\bannounce[ds]?\b/,
    /\blaunch(ed|es)?\b/,
    /\bbreaking\b/,
    /\bcurrent\b/,
  ];
  return recentIndicators.some((pattern) => pattern.test(lowerQuery));
}

/**
 * Detect if the query is about a specific technology/API/library.
 */
function isTechQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const techIndicators = [
    /\bapi\b/,
    /\blibrary\b/,
    /\bframework\b/,
    /\bsdk\b/,
    /\bpackage\b/,
    /\bmodule\b/,
    /\bplugin\b/,
    /\bdocumentation\b/,
    /\bdocs\b/,
    /\bversion\b/,
    /\binstall\b/,
    /\bconfigure\b/,
    /\btutorial\b/,
    /\bguide\b/,
  ];
  return techIndicators.some((pattern) => pattern.test(lowerQuery));
}

/**
 * Extract the main entity/topic from a query.
 */
function extractEntity(query: string): string {
  // Remove question words and stop words to find the core topic
  const cleaned = query
    .replace(/^(what|how|why|when|where|who|which|can|does|is|are|tell me about|explain)\s+/i, "")
    .replace(/\?$/, "")
    .trim();
  return removeStopWords(cleaned);
}

/**
 * Rewrite a user question into multi-level search queries.
 * 
 * @param userQuery - The original user question
 * @returns RewrittenQueries with focused, supporting, and filtered variants
 */
export function rewriteQuery(userQuery: string): RewrittenQueries {
  const entity = extractEntity(userQuery);
  const isRecent = isRecentEventQuery(userQuery);
  const isTech = isTechQuery(userQuery);

  // 1. Focused query: direct, specific search
  let focused = entity;
  if (isRecent) {
    // Add year for recent events
    const currentYear = new Date().getFullYear();
    if (!focused.match(/\b20\d{2}\b/)) {
      focused = `${focused} ${currentYear}`;
    }
  }

  // 2. Supporting query: broader context
  let supporting = entity;
  if (entity.split(/\s+/).length <= 3) {
    supporting = `${entity} overview explanation`;
  } else {
    // For longer queries, simplify
    const words = entity.split(/\s+/);
    supporting = words.slice(0, Math.min(4, words.length)).join(" ");
  }

  // 3. Filtered query: with site/date filters for precision
  let filtered = entity;
  if (isTech) {
    // Add documentation site filter for tech queries
    filtered = `${entity} site:github.com OR site:stackoverflow.com`;
  } else if (isRecent) {
    // Add date filter for recent events
    const currentYear = new Date().getFullYear();
    filtered = `${entity} after:${currentYear - 1}-01-01`;
  } else {
    // Add credible source filter
    filtered = `"${entity}" site:gov OR site:edu OR site:org`;
  }

  return {
    focused: focused.trim(),
    supporting: supporting.trim(),
    filtered: filtered.trim(),
  };
}

/**
 * Determine if a search should be triggered based on the user query.
 * Implements the agent reasoning policy.
 * 
 * Call search_web when:
 * - User asks for latest info
 * - User asks for factual verification
 * - Model knowledge cutoff is exceeded
 * - Question includes dates after 2024-10
 * - Content relates to news, releases, APIs, libraries
 * 
 * Do NOT call when:
 * - Purely conceptual tasks (e.g., "explain recursion")
 * - Coding problems without external dependencies
 * - Internal document questions
 */
export function shouldSearch(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // DO NOT search for these patterns
  const noSearchPatterns = [
    /^(explain|define|what is the concept of)\s/i,
    /\b(write|create|build|implement|code)\s+(a|an|the)?\s*(function|class|program|script|algorithm)\b/i,
    /\b(how does? .+ work)\b/i, // Conceptual "how does X work"
    /\binternal\s+(doc|document|knowledge|wiki)\b/i,
    /\b(calculate|compute|solve)\s/i,
    /\b(sort|search|traverse|parse)\s+(algorithm|array|list|tree|graph)\b/i,
  ];

  // But DO search for these even if conceptual patterns match
  const forceSearchPatterns = [
    /\b(latest|newest|recent|current|updated?|breaking)\b/i,
    /\b(news|release[ds]?|announce|launch)\b/i,
    /\bprice\b/i,
    /\bweather\b/i,
    /\bstock\b/i,
    /\b202[5-9]\b/, // Dates after 2024
    /\b203\d\b/,
    /\bwho (is|are|was|were)\b/i,
    /\bhow (much|many)\b/i,
    /\b(compare|versus|vs\.?)\b/i,
    /\bapi\b/i,
    /\blibrary\b/i,
    /\bframework\b/i,
    /\bversion\b/i,
    /\bnpm\b/i,
    /\bpip\b/i,
    /\bdependency\b/i,
    /\b(true|false|fact|verify|confirm|accurate)\b/i,
    /\?$/, // Questions are more likely to need search
  ];

  // Check force-search patterns first (higher priority)
  const shouldForceSearch = forceSearchPatterns.some((p) => p.test(lowerQuery));
  if (shouldForceSearch) return true;

  // Check no-search patterns
  const shouldSkipSearch = noSearchPatterns.some((p) => p.test(lowerQuery));
  if (shouldSkipSearch) return false;

  // Default: search for queries > 3 words (likely seeking information)
  return lowerQuery.split(/\s+/).length > 3;
}
