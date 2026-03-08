/**
 * Extractive compression for web search results.
 * Compresses text to a maximum token budget using sentence extraction.
 * No generative summarization - keeps original wording only.
 */

import { estimateTokens, MAX_TOKENS_PER_SOURCE, MAX_SEARCH_CONTENT_TOKENS } from "./utils";

/**
 * Extractively compress text to fit within a token budget.
 * Selects sentences that fit within maxTokens, preserving original wording.
 * 
 * @param text - The text to compress
 * @param maxTokens - Maximum tokens for the compressed output (default 200)
 * @returns Compressed text with original wording preserved
 */
export function compressText(text: string, maxTokens: number = MAX_TOKENS_PER_SOURCE): string {
  if (!text) return "";

  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Split into sentences
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  let compressed = "";
  let tokens = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    const sentenceTokens = estimateTokens(trimmed);
    if (tokens + sentenceTokens > maxTokens) break;

    compressed += (compressed ? " " : "") + trimmed;
    tokens += sentenceTokens;
  }

  // If we couldn't fit even one sentence, truncate by characters
  if (!compressed && sentences.length > 0) {
    const charLimit = Math.floor(maxTokens * 3.5);
    compressed = text.slice(0, charLimit).trim() + "...";
  }

  return compressed;
}

/**
 * Compress multiple search result texts with a total token budget.
 * Distributes tokens across sources, each capped at MAX_TOKENS_PER_SOURCE.
 * Stops when total reaches MAX_SEARCH_CONTENT_TOKENS.
 * 
 * @param sources - Array of { text, url, title } objects
 * @param totalBudget - Total token budget across all sources (default 600)
 * @returns Compressed sources with token counts
 */
export function compressSources(
  sources: { text: string; url: string; title: string }[],
  totalBudget: number = MAX_SEARCH_CONTENT_TOKENS
): { text: string; url: string; title: string; tokens: number }[] {
  const compressed: { text: string; url: string; title: string; tokens: number }[] = [];
  let totalTokens = 0;

  // Calculate per-source budget (distribute evenly, capped at MAX_TOKENS_PER_SOURCE)
  const perSourceBudget = Math.min(
    MAX_TOKENS_PER_SOURCE,
    Math.floor(totalBudget / Math.max(sources.length, 1))
  );

  for (const source of sources) {
    // Check if we'd exceed total budget
    if (totalTokens >= totalBudget) break;

    const remainingBudget = totalBudget - totalTokens;
    if (remainingBudget <= 0) break;

    // Use the smaller of per-source budget and remaining budget
    const sourceBudget = Math.min(perSourceBudget, remainingBudget);

    const compressedText = compressText(source.text, sourceBudget);
    const tokens = estimateTokens(compressedText);

    // Only add if it won't exceed total budget
    if (compressedText && totalTokens + tokens <= totalBudget) {
      compressed.push({
        text: compressedText,
        url: source.url,
        title: source.title,
        tokens,
      });
      totalTokens += tokens;
    }
  }

  return compressed;
}

/**
 * Format compressed sources with inline citations.
 * 
 * Output format:
 * According to Source Title (URL), [extracted text].
 * 
 * @param sources - Compressed sources with text, url, title
 * @returns Formatted text with citations and a sources list
 */
export function formatWithCitations(
  sources: { text: string; url: string; title: string }[]
): { citedText: string; sourcesList: string } {
  if (sources.length === 0) {
    return { citedText: "", sourcesList: "" };
  }

  const citedParts: string[] = [];
  const sourcesListParts: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    citedParts.push(`According to ${source.title} (${source.url}), ${source.text}`);
    sourcesListParts.push(`- ${source.title} (${source.url})`);
  }

  return {
    citedText: citedParts.join("\n\n"),
    sourcesList: sourcesListParts.join("\n"),
  };
}
