import { z } from "zod";
import { registerTool } from "./registry";

registerTool({
  name: "knowledgeSearch",
  description: "Searches local PDF knowledge base and returns topK chunks with citations.",
  inputSchema: z.object({
    query: z.string().min(1),
    topK: z.number().min(1).max(10).default(5),
  }),
  async handler(ctx, input) {
    const { query, topK } = input as { query: string; topK: number };
    if (!ctx.knowledge) {
      return { ok: false, error: "Knowledge service not available", code: "KNOWLEDGE_UNAVAILABLE" };
    }
    const results = await ctx.knowledge.search(query, topK);
    return {
      ok: true,
      data: {
        chunks: results,
        query,
        count: results.length,
      },
    };
  },
});
