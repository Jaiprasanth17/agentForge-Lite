const MOCK_RESULTS = [
  {
    title: "Understanding AI Agents - A Comprehensive Guide",
    url: "https://example.com/ai-agents-guide",
    snippet: "AI agents are autonomous systems that can perceive their environment, make decisions, and take actions to achieve specific goals.",
  },
  {
    title: "Building Production-Ready LLM Applications",
    url: "https://example.com/llm-apps",
    snippet: "Learn how to build scalable and reliable applications powered by large language models with best practices for deployment.",
  },
  {
    title: "The Future of Conversational AI",
    url: "https://example.com/conversational-ai",
    snippet: "Conversational AI is evolving rapidly with advances in natural language understanding, context management, and multi-turn dialogue.",
  },
];

export async function webSearch(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  // Deterministic seeded response based on query length
  const seed = query.length % MOCK_RESULTS.length;
  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(MOCK_RESULTS[(seed + i) % MOCK_RESULTS.length]);
  }
  return results;
}
