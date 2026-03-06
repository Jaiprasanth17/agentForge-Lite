import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { IncomingMessage } from "http";
import prisma from "./db/prismaClient";
import { getProvider } from "./providers";
import { webSearch } from "./tools/webSearch";
import { codeInterpreter } from "./tools/codeInterpreter";
import { storeMemory, recallMemory } from "./tools/memory";

interface WSMessage {
  type: string;
  text?: string;
  toolApproval?: { toolCallId: string; approved: boolean };
  runWithTools?: boolean;
  humanInTheLoop?: boolean;
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
          const recalled = await recallMemory(msg.text, 3);
          if (recalled.length > 0) {
            const memoryContext = recalled
              .filter((r) => r.score > 0.3)
              .map((r) => r.text)
              .join("\n");
            if (memoryContext) {
              ws.send(
                JSON.stringify({
                  type: "tool_result",
                  tool: "memory",
                  result: `Recalled ${recalled.length} relevant memories`,
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
        const availableTools: any[] = [];
        if (runWithTools) {
          if (tools.webSearch) {
            availableTools.push({
              type: "function",
              function: {
                name: "webSearch",
                description: "Search the web for information",
                parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
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
        }

        await provider.generate({
          model: agent.model,
          system: agent.system || undefined,
          messages: conversationMessages,
          tools: availableTools.length > 0 ? availableTools : undefined,
          temperature: parameters.temperature,
          maxTokens: parameters.maxTokens,
          topP: parameters.topP,
          reasoning: tools.advancedReasoning,
          onChunk: async (chunk) => {
            if (chunk.text) {
              ws.send(JSON.stringify({ type: "chunk", text: chunk.text }));
            }
            if (chunk.toolCall) {
              const toolCallId = chunk.toolCall.id || `tc_${Date.now()}`;
              const toolName = chunk.toolCall.name || chunk.toolCall.function?.name;
              const toolArgs = chunk.toolCall.arguments || chunk.toolCall.function?.arguments || "{}";

              ws.send(
                JSON.stringify({
                  type: "tool_call",
                  toolCallId,
                  name: toolName,
                  arguments: toolArgs,
                })
              );

              if (humanInTheLoop) {
                // Wait for approval
                ws.send(
                  JSON.stringify({
                    type: "tool_pending",
                    toolCallId,
                    name: toolName,
                    arguments: toolArgs,
                  })
                );

                const approved = await new Promise<boolean>((resolve) => {
                  pendingToolApprovals.set(toolCallId, { name: toolName, args: toolArgs, resolve });
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

              // Execute tool
              let toolResult = "";
              try {
                if (toolName === "webSearch") {
                  const parsed = JSON.parse(toolArgs);
                  const results = await webSearch(parsed.query);
                  toolResult = JSON.stringify(results, null, 2);
                } else if (toolName === "codeInterpreter") {
                  const parsed = JSON.parse(toolArgs);
                  toolResult = await codeInterpreter(parsed.code);
                } else {
                  toolResult = `Unknown tool: ${toolName}`;
                }
              } catch (e: any) {
                toolResult = `Tool error: ${e.message}`;
              }

              ws.send(
                JSON.stringify({
                  type: "tool_result",
                  toolCallId,
                  tool: toolName,
                  result: toolResult,
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
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", text: err.message }));
      }
    });
  });
}
