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
export function scoreDomain(url: string, allowedDomains: string[]): number {
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
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Simple text similarity based on shared 3-gram overlap */
export function textSimilarity(a: string, b: string): number {
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

export interface RankedCitation extends Citation {
  /** Normalised score (0-1) */
  score: number;
  /** Original domain authority score */
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
 * Deduplicate, merge, and rerank citations and sources.
 *
 * 1. Remove exact URL duplicates
 * 2. Score by domain authority + allowed domain boost
 * 3. Sort descending by score
 * 4. Return top-k
 */
export function rerank(
  citations: Citation[],
  sources: Source[],
  options: RerankerOptions = {},
): { citations: RankedCitation[]; sources: Source[] } {
  const topK = options.topK ?? 5;
  const allowedDomains = options.allowedDomains ?? [];

  // Deduplicate citations by URL
  const seenUrls = new Set<string>();
  const uniqueCitations: Citation[] = [];
  for (const c of citations) {
    const norm = normaliseUrl(c.url);
    if (!seenUrls.has(norm)) {
      seenUrls.add(norm);
      uniqueCitations.push(c);
    }
  }

  // Score and rank citations
  const scored: RankedCitation[] = uniqueCitations.map((c) => {
    const domainScore = scoreDomain(c.url, allowedDomains);
    return {
      ...c,
      domainScore,
      score: domainScore / 10,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const topCitations = scored.slice(0, topK);

  return { citations: topCitations, sources };
}

/**
 * Merge results from multiple search passes.
 * Deduplicates and reranks the combined set.
 */
export function mergeSearchResults(
  results: { citations: Citation[]; sources: Source[] }[],
  options: RerankerOptions = {},
): { citations: RankedCitation[]; sources: Source[] } {
  const allCitations: Citation[] = [];
  const allSources: Source[] = [];

  for (const r of results) {
    allCitations.push(...r.citations);
    allSources.push(...r.sources);
  }

  return rerank(allCitations, allSources, options);
}
