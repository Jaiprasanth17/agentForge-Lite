/**
 * Token Budget Manager
 *
 * Prevents context_length_exceeded errors by:
 * 1. Estimating token counts for messages, tools, and planned output
 * 2. Summarizing conversation history when over budget
 * 3. Compressing retrieval chunks to ≤200 tokens extractively
 * 4. Slimming function/tool schemas
 * 5. Capping max_tokens with brief-mode fallback
 *
 * All thresholds and limits are configurable via TokenBudgetConfig.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenBudgetConfig {
  /** Context window size for the model (tokens). Default per-model. */
  contextLimit: number;
  /** Fraction of contextLimit at which we start compressing (0.85). */
  softThreshold: number;
  /** Hard cap: truncate until projected total ≤ this fraction × contextLimit (0.75). */
  hardThreshold: number;
  /** Default max_tokens for generation output. */
  maxOutputTokens: number;
  /** Brief-mode max_tokens fallback when budget is tight. */
  briefModeMaxTokens: number;
  /** Max number of retrieval chunks to keep after compression. */
  retrievalTopK: number;
  /** Max tokens per compressed chunk. */
  maxTokensPerChunk: number;
  /** Number of recent turns to keep verbatim (rest get summarized). */
  keepRecentTurns: number;
  /** Target lines for history summary bullet list. */
  summaryMaxLines: number;
}

export interface BudgetDecision {
  /** Whether the budget was applied (context was over threshold). */
  applied: boolean;
  /** The action taken: 'none' | 'summarized' | 'truncated' | 'brief_mode'. */
  action: string;
  /** Estimated tokens before budgeting. */
  estimatedBefore: number;
  /** Estimated tokens after budgeting. */
  estimatedAfter: number;
  /** The effective max_tokens for generation. */
  effectiveMaxTokens: number;
  /** Whether brief mode was activated. */
  briefMode: boolean;
  /** Details for logging. */
  details: string[];
}

export interface BudgetedPayload {
  system: string | undefined;
  messages: ChatMessage[];
  tools: ToolSchema[] | undefined;
  maxTokens: number;
  decision: BudgetDecision;
}

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export type ToolSchema = {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: object;
  };
};

// ---------------------------------------------------------------------------
// Default model context limits
// ---------------------------------------------------------------------------

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o-mini": 128000,
  "gpt-4o": 128000,
  "o3-mini": 128000,
  "gpt-3.5-turbo": 16385,
  "gpt-4": 8192,
  "gpt-4-turbo": 128000,
  "claude-3-haiku-20240307": 200000,
  "claude-3-sonnet-20240229": 200000,
  "claude-3-5-sonnet-20241022": 200000,
  "mock-basic": 8192,
  "mock-advanced": 8192,
  "mock-reasoning": 8192,
};

export function getModelContextLimit(model: string): number {
  if (MODEL_CONTEXT_LIMITS[model]) return MODEL_CONTEXT_LIMITS[model];
  // Fallback: if model name contains a known prefix, use that family's limit
  if (model.startsWith("gpt-4o")) return 128000;
  if (model.startsWith("gpt-4")) return 8192;
  if (model.startsWith("gpt-3")) return 16385;
  if (model.startsWith("claude-3")) return 200000;
  if (model.startsWith("o")) return 128000;
  if (model.startsWith("mock")) return 8192;
  return 8192; // Conservative default
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export function getDefaultBudgetConfig(model: string): TokenBudgetConfig {
  const contextLimit = getModelContextLimit(model);
  return {
    contextLimit,
    softThreshold: 0.85,
    hardThreshold: 0.75,
    maxOutputTokens: contextLimit >= 128000 ? 2048 : 768,
    briefModeMaxTokens: 500,
    retrievalTopK: 3,
    maxTokensPerChunk: 200,
    keepRecentTurns: 2,
    summaryMaxLines: 15,
  };
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count for a string using a simple heuristic.
 * ~4 characters per token for English text (GPT tokenizer average).
 * This is intentionally conservative (overestimates slightly) to stay safe.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~1 token per 3.5 chars for English; round up for safety
  return Math.ceil(text.length / 3.5);
}

/** Estimate tokens for a single chat message (content + role overhead). */
export function estimateMessageTokens(msg: ChatMessage): number {
  // Every message has ~4 tokens of overhead (role, delimiters)
  return 4 + estimateTokens(msg.content);
}

/** Estimate tokens for the system prompt. */
export function estimateSystemTokens(system: string | undefined): number {
  if (!system) return 0;
  return 4 + estimateTokens(system);
}

/** Estimate tokens for tool/function schemas. */
export function estimateToolSchemaTokens(tools: ToolSchema[] | undefined): number {
  if (!tools || tools.length === 0) return 0;
  // Each tool definition costs roughly: name + description + params JSON
  let total = 0;
  for (const tool of tools) {
    const fn = tool.function;
    total += estimateTokens(fn.name);
    total += estimateTokens(fn.description);
    total += estimateTokens(JSON.stringify(fn.parameters));
    total += 10; // overhead per function definition
  }
  return total;
}

/** Estimate total input tokens for a generate call. */
export function estimateTotalInputTokens(
  system: string | undefined,
  messages: ChatMessage[],
  tools: ToolSchema[] | undefined
): number {
  let total = estimateSystemTokens(system);
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  total += estimateToolSchemaTokens(tools);
  total += 3; // base overhead for the request
  return total;
}

// ---------------------------------------------------------------------------
// History summarization
// ---------------------------------------------------------------------------

/**
 * Summarize older conversation turns into a bullet synopsis.
 * Keeps the last `keepRecentTurns` turns verbatim.
 * Older turns are compressed into a summary message.
 */
export function summarizeHistory(
  messages: ChatMessage[],
  keepRecentTurns: number,
  summaryMaxLines: number
): ChatMessage[] {
  if (messages.length <= keepRecentTurns * 2) {
    // Not enough history to summarize (each "turn" = user + assistant)
    return messages;
  }

  // Split into old and recent
  const recentCount = keepRecentTurns * 2; // user+assistant pairs
  const oldMessages = messages.slice(0, messages.length - recentCount);
  const recentMessages = messages.slice(messages.length - recentCount);

  // Build bullet summary from old messages
  const bullets: string[] = [];
  for (const msg of oldMessages) {
    const prefix = msg.role === "user" ? "User" : msg.role === "assistant" ? "AI" : msg.role;
    // Take first 150 chars of each message for the summary
    const snippet = msg.content.length > 150
      ? msg.content.slice(0, 150).trim() + "..."
      : msg.content.trim();
    if (snippet) {
      bullets.push(`- ${prefix}: ${snippet}`);
    }
    if (bullets.length >= summaryMaxLines) break;
  }

  const summaryText = `[Conversation summary - ${oldMessages.length} earlier messages]\n${bullets.join("\n")}`;

  return [
    { role: "system" as const, content: summaryText },
    ...recentMessages,
  ];
}

// ---------------------------------------------------------------------------
// Chunk compression
// ---------------------------------------------------------------------------

/**
 * Compress a retrieval chunk extractively to fit within maxTokens.
 * Takes the first N sentences that fit within the token budget.
 */
export function compressChunk(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Split into sentences
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  let compressed = "";
  let tokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    if (tokens + sentenceTokens > maxTokens) break;
    compressed += sentence;
    tokens += sentenceTokens;
  }

  // If we couldn't fit even one sentence, truncate by character
  if (!compressed) {
    const charLimit = Math.floor(maxTokens * 3.5);
    compressed = text.slice(0, charLimit) + "...";
  }

  return compressed.trim();
}

/**
 * Compress and limit retrieval chunks.
 * Keeps top-k chunks, each compressed to maxTokensPerChunk.
 */
export function compressRetrievalChunks(
  chunks: { text: string; score: number; [key: string]: unknown }[],
  topK: number,
  maxTokensPerChunk: number
): { text: string; score: number; [key: string]: unknown }[] {
  // Already sorted by score (descending) from the retrieval service
  const topChunks = chunks.slice(0, topK);
  return topChunks.map((chunk) => ({
    ...chunk,
    text: compressChunk(chunk.text, maxTokensPerChunk),
  }));
}

// ---------------------------------------------------------------------------
// Schema slimming
// ---------------------------------------------------------------------------

/** Slim tool schemas: shorten descriptions, remove optional fields. */
export function slimToolSchemas(tools: ToolSchema[]): ToolSchema[] {
  return tools.map((tool) => {
    const fn = tool.function;

    // Shorten description to max 60 chars
    const shortDesc = fn.description.length > 60
      ? fn.description.slice(0, 57) + "..."
      : fn.description;

    // Slim parameters: keep only required fields, remove descriptions from properties
    const params = fn.parameters as Record<string, unknown>;
    const slimParams: Record<string, unknown> = { type: "object" };

    if (params.properties && typeof params.properties === "object") {
      const required = (params.required as string[]) || [];
      const slimProps: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(params.properties as Record<string, unknown>)) {
        // Keep required fields; for optional, only include if few enough
        if (required.includes(key)) {
          // Preserve essential schema properties (type, items, minItems, maxItems)
          // while stripping descriptions
          const prop = val as Record<string, unknown>;
          const slimProp: Record<string, unknown> = { type: prop.type };
          
          // Preserve array constraints and item schema
          if (prop.items) {
            slimProp.items = prop.items;
          }
          if (prop.minItems !== undefined) {
            slimProp.minItems = prop.minItems;
          }
          if (prop.maxItems !== undefined) {
            slimProp.maxItems = prop.maxItems;
          }
          
          slimProps[key] = slimProp;
        }
      }
      slimParams.properties = slimProps;
      slimParams.required = required;
    }

    return {
      type: tool.type,
      function: {
        name: fn.name,
        description: shortDesc,
        parameters: slimParams,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Pre-flight budget check & adjustment
// ---------------------------------------------------------------------------

/**
 * Main entry point: check token budget and apply adjustments.
 *
 * Call this BEFORE provider.generate() with the planned payload.
 * Returns the adjusted payload + decision log.
 */
export function applyTokenBudget(
  model: string,
  system: string | undefined,
  messages: ChatMessage[],
  tools: ToolSchema[] | undefined,
  requestedMaxTokens: number | undefined,
  configOverrides?: Partial<TokenBudgetConfig>
): BudgetedPayload {
  const config = { ...getDefaultBudgetConfig(model), ...configOverrides };
  const details: string[] = [];

  let currentSystem = system;
  let currentMessages = [...messages];
  let currentTools = tools ? [...tools] : undefined;
  let maxTokens = requestedMaxTokens ?? config.maxOutputTokens;
  let briefMode = false;

  // Step 1: Estimate current total
  const estimatedInput = estimateTotalInputTokens(currentSystem, currentMessages, currentTools);
  const estimatedTotal = estimatedInput + maxTokens;
  const softLimit = config.contextLimit * config.softThreshold;
  const hardLimit = config.contextLimit * config.hardThreshold;

  details.push(
    `[TokenBudget] Model=${model}, contextLimit=${config.contextLimit}, ` +
    `estimatedInput=${estimatedInput}, maxTokens=${maxTokens}, ` +
    `estimatedTotal=${estimatedTotal}, softLimit=${Math.round(softLimit)}, hardLimit=${Math.round(hardLimit)}`
  );

  if (estimatedTotal <= softLimit) {
    // Under budget - no action needed
    details.push("[TokenBudget] Under soft threshold, no adjustments needed");
    return {
      system: currentSystem,
      messages: currentMessages,
      tools: currentTools,
      maxTokens,
      decision: {
        applied: false,
        action: "none",
        estimatedBefore: estimatedTotal,
        estimatedAfter: estimatedTotal,
        effectiveMaxTokens: maxTokens,
        briefMode: false,
        details,
      },
    };
  }

  details.push("[TokenBudget] Over soft threshold, applying budget adjustments...");

  // Step 2: Slim tool schemas
  if (currentTools && currentTools.length > 0) {
    const beforeToolTokens = estimateToolSchemaTokens(currentTools);
    currentTools = slimToolSchemas(currentTools);
    const afterToolTokens = estimateToolSchemaTokens(currentTools);
    details.push(
      `[TokenBudget] Slimmed tool schemas: ${beforeToolTokens} -> ${afterToolTokens} tokens ` +
      `(saved ${beforeToolTokens - afterToolTokens})`
    );
  }

  // Step 3: Summarize conversation history
  if (currentMessages.length > config.keepRecentTurns * 2) {
    const beforeMsgTokens = currentMessages.reduce((s, m) => s + estimateMessageTokens(m), 0);
    currentMessages = summarizeHistory(currentMessages, config.keepRecentTurns, config.summaryMaxLines);
    const afterMsgTokens = currentMessages.reduce((s, m) => s + estimateMessageTokens(m), 0);
    details.push(
      `[TokenBudget] Summarized history: ${beforeMsgTokens} -> ${afterMsgTokens} tokens ` +
      `(saved ${beforeMsgTokens - afterMsgTokens})`
    );
  }

  // Step 4: Re-estimate after summarization + schema slimming
  let newEstimatedInput = estimateTotalInputTokens(currentSystem, currentMessages, currentTools);
  let newEstimatedTotal = newEstimatedInput + maxTokens;

  // Step 5: If still over hard threshold, cap max_tokens to 768
  if (newEstimatedTotal > softLimit) {
    maxTokens = Math.min(maxTokens, 768);
    details.push(`[TokenBudget] Capped max_tokens to ${maxTokens}`);
    newEstimatedTotal = newEstimatedInput + maxTokens;
  }

  // Step 6: If STILL over hard threshold, activate brief mode (500 tokens)
  if (newEstimatedTotal > config.contextLimit * config.hardThreshold) {
    maxTokens = config.briefModeMaxTokens;
    briefMode = true;
    details.push(`[TokenBudget] Brief mode activated, max_tokens=${maxTokens}`);
    newEstimatedTotal = newEstimatedInput + maxTokens;
  }

  // Step 7: If STILL over context limit, aggressively truncate messages
  if (newEstimatedTotal > config.contextLimit) {
    details.push("[TokenBudget] Still over context limit, truncating messages...");
    while (
      currentMessages.length > 1 &&
      estimateTotalInputTokens(currentSystem, currentMessages, currentTools) + maxTokens > config.contextLimit * config.hardThreshold
    ) {
      const removed = currentMessages.shift();
      if (removed) {
        details.push(`[TokenBudget] Dropped message (${removed.role}): ${removed.content.slice(0, 50)}...`);
      }
    }
    newEstimatedInput = estimateTotalInputTokens(currentSystem, currentMessages, currentTools);
    newEstimatedTotal = newEstimatedInput + maxTokens;
  }

  const action = briefMode ? "brief_mode" : currentMessages.length < messages.length ? "truncated" : "summarized";

  return {
    system: currentSystem,
    messages: currentMessages,
    tools: currentTools,
    maxTokens,
    decision: {
      applied: true,
      action,
      estimatedBefore: estimatedInput + (requestedMaxTokens ?? config.maxOutputTokens),
      estimatedAfter: newEstimatedTotal,
      effectiveMaxTokens: maxTokens,
      briefMode,
      details,
    },
  };
}

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------

export function logBudgetDecision(decision: BudgetDecision, logger: (...args: unknown[]) => void): void {
  if (!decision.applied) {
    logger(
      `[TokenBudget] No adjustment needed (estimated ${decision.estimatedBefore} tokens, ` +
      `within budget)`
    );
    return;
  }

  for (const detail of decision.details) {
    logger(detail);
  }
  logger(
    `[TokenBudget] Final: ${decision.estimatedBefore} -> ${decision.estimatedAfter} tokens, ` +
    `max_tokens=${decision.effectiveMaxTokens}, briefMode=${decision.briefMode}, action=${decision.action}`
  );
}
