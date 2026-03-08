/**
 * Domain credibility scoring and result filtering.
 * Prioritizes official docs, government, academic sources.
 * Penalizes SEO spam, AI-generated sites, low-reputation domains.
 */

import type { SerpResult } from "./cache";

// High-credibility domain patterns
const HIGH_CREDIBILITY_PATTERNS: { pattern: RegExp; score: number }[] = [
  { pattern: /\.gov($|\/)/, score: 10 },
  { pattern: /\.edu($|\/)/, score: 9 },
  { pattern: /\.org($|\/)/, score: 7 },
  { pattern: /wikipedia\.org/, score: 8 },
  { pattern: /docs\.\w+\.com/, score: 8 },
  { pattern: /developer\.\w+\.com/, score: 8 },
  { pattern: /github\.com/, score: 7 },
  { pattern: /stackoverflow\.com/, score: 7 },
  { pattern: /arxiv\.org/, score: 9 },
  { pattern: /nature\.com/, score: 9 },
  { pattern: /science\.org/, score: 9 },
  { pattern: /reuters\.com/, score: 8 },
  { pattern: /apnews\.com/, score: 8 },
  { pattern: /bbc\.com|bbc\.co\.uk/, score: 8 },
  { pattern: /nytimes\.com/, score: 7 },
  { pattern: /washingtonpost\.com/, score: 7 },
  { pattern: /microsoft\.com/, score: 7 },
  { pattern: /google\.com/, score: 7 },
  { pattern: /aws\.amazon\.com/, score: 7 },
  { pattern: /cloud\.google\.com/, score: 7 },
  { pattern: /openai\.com/, score: 8 },
  { pattern: /anthropic\.com/, score: 8 },
];

// Low-credibility domain patterns to penalize
const LOW_CREDIBILITY_PATTERNS: RegExp[] = [
  /medium\.com/, // Often AI-generated
  /quora\.com/, // Variable quality
  /pinterest\.\w+/, // Not informational
  /facebook\.com/, // Social media
  /tiktok\.com/, // Social media
  /instagram\.com/, // Social media
  /twitter\.com|x\.com/, // Social media
  /reddit\.com\/r\/\w+\/comments/, // Deep Reddit threads (noisy)
  /blogspot\.com/, // Often low quality
  /wordpress\.com/, // Variable quality
  /wix\.com/, // Often low quality
  /weebly\.com/, // Often low quality
];

/**
 * Score a single search result based on domain credibility.
 * Higher score = more credible source.
 */
export function scoreResult(result: SerpResult): number {
  let score = 5; // Base score

  const url = result.url.toLowerCase();

  // Check high-credibility patterns
  for (const { pattern, score: bonus } of HIGH_CREDIBILITY_PATTERNS) {
    if (pattern.test(url)) {
      score = Math.max(score, bonus);
      break;
    }
  }

  // Check low-credibility patterns
  for (const pattern of LOW_CREDIBILITY_PATTERNS) {
    if (pattern.test(url)) {
      score = Math.max(1, score - 3);
      break;
    }
  }

  // Bonus for HTTPS
  if (url.startsWith("https://")) {
    score += 0.5;
  }

  // Bonus for having a substantive snippet
  if (result.snippet && result.snippet.length > 80) {
    score += 0.5;
  }

  return score;
}

/**
 * Score and rank search results by credibility.
 * Returns results sorted by score (descending).
 */
export function rankResults(results: SerpResult[]): (SerpResult & { credibilityScore: number })[] {
  return results
    .map((r) => ({ ...r, credibilityScore: scoreResult(r) }))
    .sort((a, b) => b.credibilityScore - a.credibilityScore);
}

/**
 * Filter results: remove low-credibility sources and duplicates.
 * Pick 1-3 results from: official documentation, credible news, gov domains, academic sources.
 */
export function filterTopResults(
  results: SerpResult[],
  maxResults: number = 3
): (SerpResult & { credibilityScore: number })[] {
  const ranked = rankResults(results);

  // Remove duplicates by domain
  const seenDomains = new Set<string>();
  const unique = ranked.filter((r) => {
    try {
      const domain = new URL(r.url).hostname.replace(/^www\./, "");
      if (seenDomains.has(domain)) return false;
      seenDomains.add(domain);
      return true;
    } catch {
      return true;
    }
  });

  // Filter out very low credibility (score < 3)
  const credible = unique.filter((r) => r.credibilityScore >= 3);

  return credible.slice(0, maxResults);
}
