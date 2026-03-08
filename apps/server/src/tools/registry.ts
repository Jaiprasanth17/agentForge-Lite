import { ToolContext, ToolResult, ToolDefinition } from "./types";

export const TOOL_REGISTRY: Record<string, ToolDefinition> = Object.create(null);

export function registerTool(def: ToolDefinition): void {
  TOOL_REGISTRY[def.name] = def;
}

export async function invokeTool(
  ctx: ToolContext,
  name: string,
  rawInput: unknown
): Promise<ToolResult> {
  const tool = TOOL_REGISTRY[name];
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}`, code: "TOOL_NOT_FOUND" };
  }

  try {
    const parseResult = tool.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return {
        ok: false,
        error: `Invalid input for tool "${name}": ${issues}`,
        code: "TOOL_VALIDATION",
      };
    }

    const input = parseResult.data;
    const startedAt = Date.now();
    const result = await tool.handler(ctx, input);
    const ms = Date.now() - startedAt;

    if (result.ok) {
      return {
        ...result,
        meta: { ...(result.meta || {}), ms, tool: name },
      };
    }
    return { ...result, meta: { ...(result.meta || {}), ms, tool: name } };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Tool failed";
    return { ok: false, error: message, code: "TOOL_RUNTIME" };
  }
}

/** Get the OpenAI-style function schema for a registered tool */
export function getToolFunctionSchema(name: string): object | null {
  const tool = TOOL_REGISTRY[name];
  if (!tool) return null;

  // Convert zod schema to a simplified JSON schema description
  // We store a hand-written parameters object per tool for provider compatibility
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
    },
  };
}
