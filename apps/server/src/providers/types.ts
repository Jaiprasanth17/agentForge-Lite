export type ProviderResponseChunk = {
  text?: string;
  toolCall?: any;
  done?: boolean;
  usage?: { tokensIn: number; tokensOut: number };
};

export interface LLMProvider {
  name: string;
  listModels(): Promise<string[]>;
  generate(opts: {
    model: string;
    system?: string;
    messages: { role: "user" | "assistant" | "system" | "tool"; content: string }[];
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    reasoning?: boolean;
    onChunk?: (c: ProviderResponseChunk) => void;
  }): Promise<void>;
}
