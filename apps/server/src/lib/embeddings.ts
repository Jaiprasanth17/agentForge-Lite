/**
 * Simple in-memory vector store with cosine similarity.
 * Uses a basic bag-of-words embedding for demonstration.
 */

interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, any>;
}

// Simple vocabulary-based embedding
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function buildVocabulary(texts: string[]): Map<string, number> {
  const vocab = new Map<string, number>();
  let idx = 0;
  for (const text of texts) {
    for (const token of tokenize(text)) {
      if (!vocab.has(token)) {
        vocab.set(token, idx++);
      }
    }
  }
  return vocab;
}

function embed(text: string, vocab: Map<string, number>): number[] {
  const vector = new Array(Math.max(vocab.size, 1)).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const idx = vocab.get(token);
    if (idx !== undefined) {
      vector[idx] += 1;
    }
  }
  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum: number, v: number) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
}

export class InMemoryVectorStore {
  private entries: VectorEntry[] = [];
  private vocab: Map<string, number> = new Map();

  add(id: string, text: string, metadata?: Record<string, any>): void {
    // Rebuild vocabulary with new text
    const allTexts = [...this.entries.map((e) => e.text), text];
    this.vocab = buildVocabulary(allTexts);

    // Re-embed all existing entries with updated vocabulary
    for (const entry of this.entries) {
      entry.vector = embed(entry.text, this.vocab);
    }

    const vector = embed(text, this.vocab);
    this.entries.push({ id, text, vector, metadata });
  }

  search(query: string, topK: number = 3): { id: string; text: string; score: number; metadata?: Record<string, any> }[] {
    if (this.entries.length === 0) return [];

    // Add query tokens to vocab for embedding
    const allTexts = [...this.entries.map((e) => e.text), query];
    const tempVocab = buildVocabulary(allTexts);

    // Re-embed entries with temp vocab that includes query tokens
    const tempEntries = this.entries.map((e) => ({
      ...e,
      vector: embed(e.text, tempVocab),
    }));

    const queryVector = embed(query, tempVocab);

    const scored = tempEntries.map((entry) => ({
      id: entry.id,
      text: entry.text,
      score: cosineSimilarity(queryVector, entry.vector),
      metadata: entry.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  clear(): void {
    this.entries = [];
    this.vocab = new Map();
  }

  get size(): number {
    return this.entries.length;
  }
}

// Singleton instance for conversation memory
export const memoryStore = new InMemoryVectorStore();
