import prisma from "../db/prismaClient";
import type { KnowledgeSearchResult } from "../tools/types";

/**
 * BM25-style scoring: term frequency / (term frequency + k) * IDF-like weight.
 * Simple but effective for local search without external API calls.
 */
function bm25Score(query: string, text: string): number {
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const textTokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  const textLen = textTokens.length;
  if (textLen === 0 || queryTokens.length === 0) return 0;

  const k = 1.2;
  const b = 0.75;
  const avgDl = 500; // approximate average doc length

  let score = 0;
  const termFreqs = new Map<string, number>();
  for (const t of textTokens) {
    termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
  }

  for (const qt of queryTokens) {
    const tf = termFreqs.get(qt) || 0;
    if (tf > 0) {
      const idf = Math.log(1 + 1); // simplified IDF since we don't have corpus stats
      const tfNorm = (tf * (k + 1)) / (tf + k * (1 - b + b * (textLen / avgDl)));
      score += idf * tfNorm;
    }
  }

  return score;
}

export async function searchKnowledge(
  query: string,
  topK: number = 5
): Promise<KnowledgeSearchResult[]> {
  // Fetch all chunks with their document info
  const chunks = await prisma.chunk.findMany({
    include: {
      document: {
        select: { id: true, title: true, path: true },
      },
    },
  });

  if (chunks.length === 0) return [];

  // Score each chunk
  const scored = chunks.map((chunk) => ({
    text: chunk.text,
    documentId: chunk.document.id,
    title: chunk.document.title,
    path: chunk.document.path,
    score: bm25Score(query, chunk.text),
    index: chunk.index,
  }));

  // Sort by score descending and take topK
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter((s) => s.score > 0);
}

export async function getKnowledgeStatus(): Promise<{
  documentCount: number;
  chunkCount: number;
  provider: string;
}> {
  const documentCount = await prisma.document.count();
  const chunkCount = await prisma.chunk.count();
  const provider = process.env.KNOWLEDGE_PROVIDER || "bm25";
  return { documentCount, chunkCount, provider };
}

/** KnowledgeService adapter for ToolContext */
export const knowledgeService = {
  search: searchKnowledge,
};
