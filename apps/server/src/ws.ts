import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { IncomingMessage } from "http";
import prisma from "./db/prismaClient";
import { getProvider } from "./providers";
import { invokeTool } from "./tools";
import { storeMemory } from "./tools/memory";
import { knowledgeService } from "./knowledge/service";
import type { ToolContext } from "./tools/types";
import { applyTokenBudget, logBudgetDecision, compressRetrievalChunks } from "./lib/tokenBudget";
import type { ChatMessage, ToolSchema } from "./lib/tokenBudget";
import { shouldSearch } from "./tools/web_search/queryRewrite";

interface WSMessage {
  type: string;
  text?: string;
  toolApproval?: { toolCallId: string; approved: boolean };
  runWithTools?: boolean;
  humanInTheLoop?: boolean;
}

function buildToolContext(agentId: string): ToolContext {
  return {
    logger: console.log,
    knowledge: knowledgeService,
    agentId,
  };
}

/** Safely send a message over WebSocket, ignoring errors if connection is closing/closed */
function safeSend(ws: WebSocket, data: string): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  } catch (err) {
    console.warn("[WS] safeSend failed:", err instanceof Error ? err.message : err);
  }
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const agentId = url.searchParams.get("agentId");

    // Handle WebSocket errors to prevent unhandled exceptions
    ws.on("error", (err) => {
      console.warn("[WS] Connection error:", err.message);
    });

    if (!agentId) {
      safeSend(ws, JSON.stringify({ type: "error", text: "Missing agentId parameter" }));
      ws.close();
      return;
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      safeSend(ws, JSON.stringify({ type: "error", text: "Agent not found" }));
      ws.close();
      return;
    }

    const tools = typeof agent.tools === "string" ? JSON.parse(agent.tools) : (agent.tools as Record<string, boolean>);
    const parameters = typeof agent.parameters === "string" ? JSON.parse(agent.parameters) : (agent.parameters as Record<string, number | string>);
    const conversationMessages: { role: "user" | "assistant" | "system" | "tool"; content: string }[] = [];
    let runWithTools = true;
    let humanInTheLoop = false;
    const pendingToolApprovals = new Map<string, { name: string; args: string; resolve: (approved: boolean) => void }>();
    const toolCtx = buildToolContext(agentId);

    safeSend(ws, JSON.stringify({ type: "connected", agentId, agentName: agent.name }));

    ws.on("message", async (data) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());

        if (msg.type === "settings") {
          if (msg.runWithTools !== undefined) runWithTools = msg.runWithTools;
          if (msg.humanInTheLoop !== undefined) humanInTheLoop = msg.humanInTheLoop;
          return;
        }

        if (msg.type === "tool_approval") {
          const pending = pendingToolApprovals.get(msg.toolApproval?.toolCallId || "");
          if (pending) {
            pending.resolve(msg.toolApproval?.approved ?? false);
            pendingToolApprovals.delete(msg.toolApproval?.toolCallId || "");
          }
          return;
        }

        if (msg.type === "clear") {
          conversationMessages.length = 0;
          safeSend(ws, JSON.stringify({ type: "cleared" }));
          return;
        }

        if (msg.type !== "user_message" || !msg.text) return;

        const startTime = Date.now();
        conversationMessages.push({ role: "user", content: msg.text });

        // Store in memory if enabled
        if (tools.memory && runWithTools) {
          await storeMemory(msg.text, agentId);
          const memResult = await invokeTool(toolCtx, "memory", { query: msg.text, topK: 3 });
          if (memResult.ok) {
            const recalled = memResult.data as { text: string; score: number }[];
            if (recalled.length > 0) {
              safeSend(ws,
                JSON.stringify({
                  type: "tool_call_started",
                  name: "memory",
                  input: { query: msg.text, topK: 3 },
                })
              );
              safeSend(ws,
                JSON.stringify({
                  type: "tool_call_result",
                  name: "memory",
                  ok: true,
                  data: `Recalled ${recalled.length} relevant memories`,
                  ms: (memResult.meta as Record<string, unknown>)?.ms || 0,
                })
              );
            }
          }
        }

        // Determine provider from agent model
        let providerName = process.env.LLM_PROVIDER || "mock";
        if (agent.model.startsWith("gpt-") || agent.model.startsWith("o")) providerName = "openai";
        else if (agent.model.startsWith("claude-")) providerName = "anthropic";
        else if (agent.model.startsWith("mock-")) providerName = "mock";

        const provider = getProvider(providerName);

        // Build available tools list for the provider
        const availableTools: ToolSchema[] = [];
        if (runWithTools) {
          if (tools.webSearch) {
            availableTools.push({
              type: "function",
              function: {
                name: "search_web",
                description: "Search the web for information. Use when user asks for current events, facts beyond model knowledge, or when unsure.",
                parameters: {
                  type: "object",
                  properties: {
                    queries: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 5,
                      description: "List of focused search queries"
                    }
                  },
                  required: ["queries"]
                },
              },
            });
            availableTools.push({
              type: "function",
              function: {
                name: "click",
                description: "Open a specific search result and return the content of the webpage.",
                parameters: { type: "object", properties: { id: { type: "string", description: "SERP result identifier or URL" } }, required: ["id"] },
              },
            });
          }
          if (tools.codeInterpreter) {
            availableTools.push({
              type: "function",
              function: {
                name: "codeInterpreter",
                description: "Execute code in a sandboxed environment",
                parameters: { type: "object", properties: { code: { type: "string", description: "Code to execute" } }, required: ["code"] },
              },
            });
          }
          if (tools.knowledge) {
            availableTools.push({
              type: "function",
              function: {
                name: "knowledgeSearch",
                description: "Search the local PDF knowledge base for relevant information with citations",
                parameters: { type: "object", properties: { query: { type: "string", description: "Search query" }, topK: { type: "number", description: "Number of results" } }, required: ["query"] },
              },
            });
          }
          if (tools.advancedReasoning) {
            availableTools.push({
              type: "function",
              function: {
                name: "advancedReasoning",
                description: "Perform multi-step reasoning and analysis on a given topic or question",
                parameters: { type: "object", properties: { query: { type: "string", description: "Topic or question to analyze" }, steps: { type: "number", description: "Number of reasoning steps (1-10)" } }, required: ["query"] },
              },
            });
          }
        }

        // Enhance system prompt with search reasoning policy when web search is enabled
        let systemPrompt = agent.system || undefined;
        if (tools.webSearch && runWithTools) {
          const searchPolicy = `\n\nWhen you have search_web and click tools available:\n- Call search_web when: user asks for latest info, factual verification, you are uncertain, knowledge cutoff is exceeded, dates after 2024-10, or content relates to news/releases/APIs/libraries.\n- Do NOT call search_web for: purely conceptual tasks, coding problems without external dependencies, or internal document questions.\n- After searching, use click on 1-3 top results from official docs, credible news, government, or academic sources. Avoid SEO spam and AI-generated sites.\n- Compress and cite all sources. Format your final answer as:\n\n## Answer\n(Your synthesis with inline citations like "According to Source Title (URL)")\n\n## Sources\n- Title (URL)\n- Title (URL)\n\n- Surface any conflicts between sources.\n- Never hallucinate URLs or facts not found in search results.`;
          systemPrompt = (systemPrompt || "") + searchPolicy;
        }

        // Apply token budget to prevent context_length_exceeded
        const budgeted = applyTokenBudget(
          agent.model,
          systemPrompt,
          conversationMessages as ChatMessage[],
          availableTools.length > 0 ? availableTools : undefined,
          parameters.maxTokens as number | undefined
        );
        logBudgetDecision(budgeted.decision, console.log);

        // Notify client if budget was applied
        if (budgeted.decision.applied) {
          safeSend(ws, JSON.stringify({
            type: "token_budget",
            action: budgeted.decision.action,
            estimatedBefore: budgeted.decision.estimatedBefore,
            estimatedAfter: budgeted.decision.estimatedAfter,
            effectiveMaxTokens: budgeted.decision.effectiveMaxTokens,
            briefMode: budgeted.decision.briefMode,
          }));
        }

        await provider.generate({
          model: agent.model,
          system: budgeted.system,
          messages: budgeted.messages,
          tools: budgeted.tools,
          temperature: parameters.temperature as number,
          maxTokens: budgeted.maxTokens,
          topP: parameters.topP as number,
          reasoning: tools.advancedReasoning,
          onChunk: async (chunk) => {
            if (chunk.text) {
              safeSend(ws, JSON.stringify({ type: "chunk", text: chunk.text }));
            }
            if (chunk.toolCall) {
              const toolCallId = chunk.toolCall.id || `tc_${Date.now()}`;
              const toolName: string = chunk.toolCall.name || chunk.toolCall.function?.name || "";
              const toolArgsRaw: string = chunk.toolCall.arguments || chunk.toolCall.function?.arguments || "{}";

              // Skip tool calls with empty or missing names (malformed fragments)
              if (!toolName || toolName.trim().length === 0) {
                console.warn("[WS] Skipping tool call with empty name, id:", toolCallId);
                return;
              }

              // Parse tool arguments safely
              let toolInput: Record<string, unknown> = {};
              try {
                toolInput = JSON.parse(toolArgsRaw);
              } catch {
                console.warn("[WS] Failed to parse tool arguments for", toolName, ":", toolArgsRaw);
                toolInput = {};
              }

              safeSend(ws,
                JSON.stringify({
                  type: "tool_call_started",
                  toolCallId,
                  name: toolName,
                  input: toolInput,
                })
              );

              if (humanInTheLoop) {
                // Wait for approval
                safeSend(ws,
                  JSON.stringify({
                    type: "tool_pending",
                    toolCallId,
                    name: toolName,
                    arguments: toolArgsRaw,
                  })
                );

                const approved = await new Promise<boolean>((resolve) => {
                  pendingToolApprovals.set(toolCallId, { name: toolName, args: toolArgsRaw, resolve });
                  // Auto-timeout after 60s
                  setTimeout(() => {
                    if (pendingToolApprovals.has(toolCallId)) {
                      pendingToolApprovals.delete(toolCallId);
                      resolve(false);
                    }
                  }, 60000);
                });

                if (!approved) {
                  safeSend(ws, JSON.stringify({ type: "tool_rejected", toolCallId }));
                  return;
                }
              }

              // Execute tool via registry
              const result = await invokeTool(toolCtx, toolName, toolInput);

              // Emit tool_call_result event
              safeSend(ws,
                JSON.stringify({
                  type: "tool_call_result",
                  toolCallId,
                  name: toolName,
                  ok: result.ok,
                  data: result.ok ? result.data : undefined,
                  error: result.ok ? undefined : result.error,
                  code: result.ok ? undefined : result.code,
                  ms: (result.meta as Record<string, unknown>)?.ms || 0,
                })
              );
            }
            if (chunk.done) {
              const latency = Date.now() - startTime;
              safeSend(ws,
                JSON.stringify({
                  type: "done",
                  usage: chunk.usage,
                  latency,
                })
              );
            }
          },
        });

        // Save assistant response to conversation
        // (We collect the full text from chunks on the client side)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        safeSend(ws, JSON.stringify({ type: "error", text: message }));
      }
    });
  });
}
