import { z } from "zod";
import { memoryStore } from "../lib/embeddings";
import { registerTool } from "./registry";

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

registerTool({
  name: "memory",
  description: "Search conversation memory for relevant context",
  inputSchema: z.object({
    query: z.string().min(1),
    topK: z.number().default(3),
  }),
  async handler(_ctx, input) {
    const { query, topK } = input as { query: string; topK: number };
    const results = await recallMemory(query, topK);
    return { ok: true, data: results };
  },
});
