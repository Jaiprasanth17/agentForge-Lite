/**
 * Query Planner for production-grade web search.
 *
 * Responsibilities:
 * - Reformulate user queries into optimised search prompts
 * - Apply site/domain allow-list and block-list filters
 * - Set time window hints based on recency signals
 * - Select language/locale
 * - Choose depth mode (lookup / agentic / deep)
 *
 * References:
 * - [REF A] https://developers.openai.com/api/docs/guides/tools-web-search
 */

import type { SearchMode, SearchContextSize, WebSearchConfig, SearchRequest } from "./schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedQuery {
  /** Final prompt string sent to the Responses API */
  prompt: string;
  /** Resolved depth mode */
  mode: SearchMode;
  /** Resolved context size */
  searchContextSize: SearchContextSize;
  /** Resolved timeout in ms */
  timeoutMs: number;
  /** Domain allow-list to pass to the API / Agents SDK filters */
  allowedDomains: string[];
  /** Domain block-list */
  blocklistDomains: string[];
  /** Locale hint */
  locale: string;
  /** User location hint */
  userLocation?: { city?: string; country?: string };
  /** Maximum pages to open */
  maxPages: number;
  /** Cost cap for this call */
  maxCostUSD: number;
}

// ---------------------------------------------------------------------------
// Mode-specific timeout defaults
// ---------------------------------------------------------------------------

const MODE_TIMEOUTS: Record<SearchMode, number> = {
  lookup: 60000,
  agentic: 120000,
  deep: 240000,
};

// ---------------------------------------------------------------------------
// Recency detection
// ---------------------------------------------------------------------------

const RECENCY_PATTERNS: RegExp[] = [
  /\b(latest|recent|newest|current|updated?|breaking)\b/i,
  /\blast\s+\d+\s+(days?|weeks?|months?|quarters?)\b/i,
  /\bin the past\s+(\d+\s+)?(days?|weeks?|months?|quarters?|year)/i,
  /\bthis\s+(week|month|quarter|year)\b/i,
  /\b202[5-9]\b/,
  /\b203\d\b/,
  /\btoday\b/i,
  /\byesterday\b/i,
  /\bmost recent\b/i,
];

const DEEP_RESEARCH_PATTERNS: RegExp[] = [
  /\b(summarize|synthesis|comprehensive|thorough|detailed|in-depth|deep\s*dive)\b/i,
  /\b(compare\s+and\s+contrast|pros?\s+and\s+cons?)\b/i,
  /\bcompare\b.{0,40}\b(approaches|policies|frameworks|methods|strategies|regulations?)\b/i,
  /\bwith\s+\d+\s+citations?\b/i,
  /\binclude\s+(quotes?|citations?|references?|links?)\b/i,
  /\bbullet\s+list\s+with\s+links\b/i,
  /\bresearch\s+paper\b/i,
];

const AGENTIC_PATTERNS: RegExp[] = [
  /\b(verify|fact.?check|evidence|prove|confirm)\b/i,
  /\b(step.by.step|walk\s+me\s+through)\b/i,
  /\b(find\s+the\s+exact|locate|pinpoint)\b/i,
  /\bquote[ds]?\s+from\b/i,
];

// ---------------------------------------------------------------------------
// Time window extraction
// ---------------------------------------------------------------------------

interface TimeWindow {
  label: string;
  afterDate?: string;
}

function extractTimeWindow(query: string): TimeWindow | null {
  const lowerQ = query.toLowerCase();

  // "in the past quarter" (without a number)
  const pastPeriodMatch = lowerQ.match(/\bin the past\s+(quarter|month|week|year)\b/);
  if (pastPeriodMatch) {
    const unit = pastPeriodMatch[1];
    const now = new Date();
    let daysBack = 90; // default quarter
    if (unit === "week") daysBack = 7;
    else if (unit === "month") daysBack = 30;
    else if (unit === "year") daysBack = 365;
    const after = new Date(now.getTime() - daysBack * 86400000);
    return {
      label: `past ${unit}`,
      afterDate: after.toISOString().slice(0, 10),
    };
  }

  // "last N days/weeks/months"
  const lastNMatch = lowerQ.match(/\blast\s+(\d+)\s+(days?|weeks?|months?|quarters?)\b/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1], 10);
    const unit = lastNMatch[2].replace(/s$/, "");
    const now = new Date();
    let daysBack = n;
    if (unit === "week") daysBack = n * 7;
    else if (unit === "month") daysBack = n * 30;
    else if (unit === "quarter") daysBack = n * 90;
    const after = new Date(now.getTime() - daysBack * 86400000);
    return {
      label: `last ${n} ${lastNMatch[2]}`,
      afterDate: after.toISOString().slice(0, 10),
    };
  }

  // "this week/month/quarter/year"
  const thisMatch = lowerQ.match(/\bthis\s+(week|month|quarter|year)\b/);
  if (thisMatch) {
    const now = new Date();
    let after: Date;
    switch (thisMatch[1]) {
      case "week": {
        const dayOfWeek = now.getDay();
        after = new Date(now.getTime() - dayOfWeek * 86400000);
        break;
      }
      case "month":
        after = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter": {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        after = new Date(now.getFullYear(), qMonth, 1);
        break;
      }
      case "year":
        after = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        after = new Date(now.getFullYear(), 0, 1);
    }
    return {
      label: `this ${thisMatch[1]}`,
      afterDate: after.toISOString().slice(0, 10),
    };
  }

  // Generic recency
  if (RECENCY_PATTERNS.some((p) => p.test(query))) {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    return {
      label: "recent (60 days)",
      afterDate: sixtyDaysAgo.toISOString().slice(0, 10),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Mode inference
// ---------------------------------------------------------------------------

export function inferMode(query: string, configMode: SearchMode): SearchMode {
  // Deep research patterns override config unless config is already deep
  if (configMode === "deep") return "deep";

  if (DEEP_RESEARCH_PATTERNS.some((p) => p.test(query))) return "deep";
  if (AGENTIC_PATTERNS.some((p) => p.test(query))) return "agentic";

  // Short / simple queries stay at lookup
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount <= 5 && configMode === "lookup") return "lookup";

  return configMode;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSearchPrompt(
  query: string,
  timeWindow: TimeWindow | null,
  allowedDomains: string[],
  locale: string,
): string {
  const parts: string[] = [];

  parts.push(query);

  if (timeWindow?.afterDate) {
    parts.push(`(Focus on information published after ${timeWindow.afterDate}.)`);
  }

  if (allowedDomains.length > 0) {
    parts.push(
      `Prefer authoritative sources from these domains: ${allowedDomains.join(", ")}.`
    );
  }

  if (locale && locale !== "en-US") {
    parts.push(`Language/locale preference: ${locale}.`);
  }

  // Always request citations
  parts.push("Include citations with URLs for all factual claims.");

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Domain validation helpers
// ---------------------------------------------------------------------------

export function isDomainAllowed(
  url: string,
  allowedDomains: string[],
  blocklistDomains: string[],
): boolean {
  if (allowedDomains.length === 0 && blocklistDomains.length === 0) return true;

  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }

  // Block-list takes priority
  if (blocklistDomains.length > 0) {
    for (const blocked of blocklistDomains) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) return false;
    }
  }

  // If no allow-list, all non-blocked domains pass
  if (allowedDomains.length === 0) return true;

  // Check allow-list
  for (const allowed of allowedDomains) {
    if (hostname === allowed || hostname.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

export function filterDomains(
  urls: string[],
  allowedDomains: string[],
  blocklistDomains: string[],
): string[] {
  return urls.filter((u) => isDomainAllowed(u, allowedDomains, blocklistDomains));
}

// ---------------------------------------------------------------------------
// Main plan() function
// ---------------------------------------------------------------------------

export function plan(request: SearchRequest, config: WebSearchConfig): PlannedQuery {
  const mode = request.mode ?? inferMode(request.query, config.mode);
  const allowedDomains = request.allowedDomains ?? config.allowedDomains;
  const blocklistDomains = request.blocklistDomains ?? config.blocklistDomains;
  const locale = request.locale ?? config.locale;
  const searchContextSize = request.searchContextSize ?? config.searchContextSize;
  const maxPages = request.maxPages ?? config.maxPages;
  const maxCostUSD = request.maxCostUSD ?? config.maxCostUSD;
  const userLocation = request.userLocation ?? config.userLocation;

  // Use mode-specific timeout if no override, falling back to config.timeoutMs
  const timeoutMs = request.timeoutMs ?? MODE_TIMEOUTS[mode] ?? config.timeoutMs;

  // Warn if allowedDomains is empty
  if (allowedDomains.length === 0) {
    console.warn("[WebSearch:planner] WARNING: allowedDomains is empty – all domains permitted.");
  }

  const timeWindow = extractTimeWindow(request.query);
  const prompt = buildSearchPrompt(request.query, timeWindow, allowedDomains, locale);

  return {
    prompt,
    mode,
    searchContextSize,
    timeoutMs,
    allowedDomains,
    blocklistDomains,
    locale,
    userLocation,
    maxPages,
    maxCostUSD,
  };
}
