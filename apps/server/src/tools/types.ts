import { z } from "zod";

export interface KnowledgeSearchResult {
  text: string;
  documentId: string;
  title: string;
  path: string;
  score: number;
  index: number;
}

export interface KnowledgeService {
  search(query: string, topK?: number): Promise<KnowledgeSearchResult[]>;
}

export interface ToolContext {
  logger: (...args: unknown[]) => void;
  knowledge?: KnowledgeService;
  agentId?: string;
}

export type ToolResult =
  | { ok: true; data: unknown; meta?: Record<string, unknown> }
  | { ok: false; error: string; code?: string; meta?: Record<string, unknown> };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (ctx: ToolContext, input: Record<string, unknown>) => Promise<ToolResult>;
}
