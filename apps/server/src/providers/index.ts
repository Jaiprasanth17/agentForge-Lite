import { LLMProvider } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";

const providers: Record<string, LLMProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  mock: new MockProvider(),
};

export function getProvider(name?: string): LLMProvider {
  const providerName = name || process.env.LLM_PROVIDER || "mock";
  return providers[providerName] || providers.mock;
}

export function getAllProviders(): LLMProvider[] {
  return Object.values(providers);
}

export { providers };
