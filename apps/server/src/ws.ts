import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { IncomingMessage } from "http";
import prisma from "./db/prismaClient";
import { getProvider } from "./providers";
import { invokeTool } from "./tools";
import { storeMemory } from "./tools/memory";
import { knowledgeService } from "./knowledge/service";
import type { ToolContext } from "./tools/types";

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

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const agentId = url.searchParams.get("agentId");

    if (!agentId) {
      ws.send(JSON.stringify({ type: "error", text: "Missing agentId parameter" }));
      ws.close();
      return;
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      ws.send(JSON.stringify({ type: "error", text: "Agent not found" }));
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

    ws.send(JSON.stringify({ type: "connected", agentId, agentName: agent.name }));

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
          ws.send(JSON.stringify({ type: "cleared" }));
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
              ws.send(
                JSON.stringify({
                  type: "tool_call_started",
                  name: "memory",
                  input: { query: msg.text, topK: 3 },
                })
              );
              ws.send(
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
        const availableTools: { type: string; function: { name: string; description: string; parameters: object } }[] = [];
        if (runWithTools) {
          if (tools.webSearch) {
            availableTools.push({
              type: "function",
              function: {
                name: "webSearch",
                description: "Search the web for information",
                parameters: { type: "object", properties: { query: { type: "string" }, topK: { type: "number" } }, required: ["query"] },
              },
            });
          }
          if (tools.codeInterpreter) {
            availableTools.push({
              type: "function",
              function: {
                name: "codeInterpreter",
                description: "Execute code in a sandboxed environment",
                parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
              },
            });
          }
          if (tools.knowledge) {
            availableTools.push({
              type: "function",
              function: {
                name: "knowledgeSearch",
                description: "Search the local PDF knowledge base for relevant information with citations",
                parameters: { type: "object", properties: { query: { type: "string" }, topK: { type: "number" } }, required: ["query"] },
              },
            });
          }
        }

        await provider.generate({
          model: agent.model,
          system: agent.system || undefined,
          messages: conversationMessages,
          tools: availableTools.length > 0 ? availableTools : undefined,
          temperature: parameters.temperature as number,
          maxTokens: parameters.maxTokens as number,
          topP: parameters.topP as number,
          reasoning: tools.advancedReasoning,
          onChunk: async (chunk) => {
            if (chunk.text) {
              ws.send(JSON.stringify({ type: "chunk", text: chunk.text }));
            }
            if (chunk.toolCall) {
              const toolCallId = chunk.toolCall.id || `tc_${Date.now()}`;
              const toolName: string = chunk.toolCall.name || chunk.toolCall.function?.name || "";
              const toolArgsRaw: string = chunk.toolCall.arguments || chunk.toolCall.function?.arguments || "{}";

              // Parse tool arguments safely
              let toolInput: Record<string, unknown> = {};
              try {
                toolInput = JSON.parse(toolArgsRaw);
              } catch {
                toolInput = {};
              }

              ws.send(
                JSON.stringify({
                  type: "tool_call",
                  toolCallId,
                  name: toolName,
                  arguments: toolArgsRaw,
                })
              );

              // Emit tool_call_started event
              ws.send(
                JSON.stringify({
                  type: "tool_call_started",
                  toolCallId,
                  name: toolName,
                  input: toolInput,
                })
              );

              if (humanInTheLoop) {
                // Wait for approval
                ws.send(
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
                  ws.send(JSON.stringify({ type: "tool_rejected", toolCallId }));
                  return;
                }
              }

              // Execute tool via registry
              const result = await invokeTool(toolCtx, toolName, toolInput);

              // Emit tool_call_result event
              ws.send(
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

              // Also send legacy tool_result for backward compatibility
              ws.send(
                JSON.stringify({
                  type: "tool_result",
                  toolCallId,
                  tool: toolName,
                  result: result.ok
                    ? (typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2))
                    : `Tool error: ${result.error}`,
                })
              );
            }
            if (chunk.done) {
              const latency = Date.now() - startTime;
              ws.send(
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
        ws.send(JSON.stringify({ type: "error", text: message }));
      }
    });
  });
}
