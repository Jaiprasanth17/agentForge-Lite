/**
 * Reranker for web search results.
 *
 * Responsibilities:
 * - Deduplicate results by URL and near-duplicate content
 * - Merge results from multiple search passes
 * - Emphasize allowed/authoritative domains with score boost
 * - Produce top-k results with normalised scores
 */

import type { Citation, Source } from "./schemas";

// ---------------------------------------------------------------------------
// Domain authority scores (banking / finance / regulatory focus)
// ---------------------------------------------------------------------------

const AUTHORITY_DOMAINS: Record<string, number> = {
  // Regulatory / government
  "bis.org": 10,
  "imf.org": 10,
  "rbi.org.in": 10,
  "bankofengland.co.uk": 10,
  "sec.gov": 10,
  "europa.eu": 10,
  "federalreserve.gov": 10,
  "treasury.gov": 10,
  "fsb.org": 9,
  "oecd.org": 9,
  "worldbank.org": 9,

  // Academic / research
  "arxiv.org": 9,
  "nature.com": 9,
  "science.org": 9,
  "ssrn.com": 8,
  "nber.org": 8,

  // News / journalism
  "reuters.com": 8,
  "bloomberg.com": 8,
  "ft.com": 8,
  "economist.com": 8,
  "wsj.com": 8,
  "apnews.com": 7,
  "bbc.com": 7,
  "bbc.co.uk": 7,

  // Tech documentation
  "openai.com": 8,
  "anthropic.com": 8,
  "github.com": 7,
  "docs.github.com": 8,
  "developer.mozilla.org": 8,
  "stackoverflow.com": 7,
  "learn.microsoft.com": 8,

  // General .gov / .edu / .org boost
};

const DOMAIN_SUFFIX_SCORES: { suffix: string; score: number }[] = [
  { suffix: ".gov", score: 9 },
  { suffix: ".edu", score: 8 },
  { suffix: ".org", score: 6 },
  { suffix: ".ac.uk", score: 8 },
  { suffix: ".gov.uk", score: 9 },
  { suffix: ".gov.in", score: 9 },
];

// Low-credibility domains to penalise
const LOW_CREDIBILITY_DOMAINS = new Set([
  "medium.com",
  "quora.com",
  "pinterest.com",
  "facebook.com",
  "tiktok.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "blogspot.com",
  "wordpress.com",
  "wix.com",
  "weebly.com",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getBaseDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  // Handle co.uk, org.in etc
  if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

/** Score a URL based on domain authority */
function scoreDomain(url: string, allowedDomains: string[]): number {
  const hostname = extractHostname(url);
  if (!hostname) return 0;
  const baseDomain = getBaseDomain(hostname);

  // Check explicit authority map
  if (AUTHORITY_DOMAINS[hostname]) return AUTHORITY_DOMAINS[hostname];
  if (AUTHORITY_DOMAINS[baseDomain]) return AUTHORITY_DOMAINS[baseDomain];

  // Boost if in allowed domains list
  for (const allowed of allowedDomains) {
    if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
      return 9;
    }
  }

  // Check domain suffix patterns
  for (const { suffix, score } of DOMAIN_SUFFIX_SCORES) {
    if (hostname.endsWith(suffix)) return score;
  }

  // Penalise low-credibility
  if (LOW_CREDIBILITY_DOMAINS.has(hostname) || LOW_CREDIBILITY_DOMAINS.has(baseDomain)) {
    return 2;
  }

  // HTTPS bonus
  if (url.startsWith("https://")) return 5.5;
  return 5;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Normalise URL for deduplication (remove trailing slash, query params, fragments) */
function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Simple text similarity based on shared 3-gram overlap */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aNorm = a.toLowerCase().slice(0, 500);
  const bNorm = b.toLowerCase().slice(0, 500);

  const ngramSize = 3;
  const aGrams = new Set<string>();
  for (let i = 0; i <= aNorm.length - ngramSize; i++) {
    aGrams.add(aNorm.slice(i, i + ngramSize));
  }

  let shared = 0;
  let total = 0;
  for (let i = 0; i <= bNorm.length - ngramSize; i++) {
    total++;
    if (aGrams.has(bNorm.slice(i, i + ngramSize))) shared++;
  }

  return total > 0 ? shared / total : 0;
}

// ---------------------------------------------------------------------------
// Reranker interface
// ---------------------------------------------------------------------------

export interface RankedSource extends Source {
  /** Normalised score (0-1) */
  score: number;
  /** Original credibility score */
  domainScore: number;
}

export interface RerankerOptions {
  /** Maximum results to return */
  topK?: number;
  /** Domain allow-list for boost */
  allowedDomains?: string[];
  /** Text similarity threshold for near-duplicate detection (0-1) */
  dedupeThreshold?: number;
}

// ---------------------------------------------------------------------------
// Main reranker
// ---------------------------------------------------------------------------

/**
 * Deduplicate, merge, and rerank sources.
 *
 * 1. Remove exact URL duplicates
 * 2. Remove near-duplicate content (text similarity > threshold)
 * 3. Score by domain authority + allowed domain boost
 * 4. Sort descending by score
 * 5. Return top-k with normalised scores
 */
export function rerank(
  sources: Source[],
  citations: Citation[],
  options: RerankerOptions = {},
): { sources: RankedSource[]; citations: Citation[] } {
  const topK = options.topK ?? 5;
  const allowedDomains = options.allowedDomains ?? [];
  const dedupeThreshold = options.dedupeThreshold ?? 0.8;

  // Step 1: Merge sources and citations into a unified list
  const allItems = new Map<string, Source>();
  for (const s of sources) {
    const key = normaliseUrl(s.url);
    if (!allItems.has(key)) {
      allItems.set(key, s);
    }
  }
  for (const c of citations) {
    const key = normaliseUrl(c.url);
    if (!allItems.has(key)) {
      allItems.set(key, { title: c.title, url: c.url, snippet: "" });
    }
  }

  // Step 2: Near-duplicate removal
  const unique: Source[] = [];
  const uniqueSnippets: string[] = [];
  for (const item of allItems.values()) {
    const snippet = item.snippet || item.title;
    let isDupe = false;
    for (const existing of uniqueSnippets) {
      if (textSimilarity(snippet, existing) > dedupeThreshold) {
        isDupe = true;
        break;
      }
    }
    if (!isDupe) {
      unique.push(item);
      uniqueSnippets.push(snippet);
    }
  }

  // Step 3: Score and rank
  const scored: RankedSource[] = unique.map((s) => {
    const domainScore = scoreDomain(s.url, allowedDomains);
    return {
      ...s,
      credibilityScore: domainScore,
      domainScore,
      score: domainScore / 10, // Normalise to 0-1
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Step 4: Take top-k
  const topSources = scored.slice(0, topK);

  // Step 5: Filter citations to only include those with URLs in the top sources
  const topUrls = new Set(topSources.map((s) => normaliseUrl(s.url)));
  const filteredCitations = citations.filter((c) => topUrls.has(normaliseUrl(c.url)));

  // Re-index citations
  const reindexed = filteredCitations.map((c, i) => ({ ...c, index: i + 1 }));

  return { sources: topSources, citations: reindexed };
}

/**
 * Merge results from multiple search passes (e.g., lookup + follow-up).
 * Deduplicates and reranks the combined set.
 */
export function mergeSearchResults(
  results: { sources: Source[]; citations: Citation[] }[],
  options: RerankerOptions = {},
): { sources: RankedSource[]; citations: Citation[] } {
  const allSources: Source[] = [];
  const allCitations: Citation[] = [];

  for (const r of results) {
    allSources.push(...r.sources);
    allCitations.push(...r.citations);
  }

  return rerank(allSources, allCitations, options);
}
