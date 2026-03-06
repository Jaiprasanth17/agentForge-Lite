import { memoryStore } from "../lib/embeddings";

let entryCounter = 0;

export async function storeMemory(text: string, agentId: string): Promise<string> {
  entryCounter++;
  const id = `mem_${agentId}_${entryCounter}`;
  memoryStore.add(id, text, { agentId, timestamp: Date.now() });
  return `Stored memory entry ${id}`;
}

export async function recallMemory(query: string, topK: number = 3): Promise<{ text: string; score: number }[]> {
  const results = memoryStore.search(query, topK);
  return results.map((r) => ({ text: r.text, score: r.score }));
}
