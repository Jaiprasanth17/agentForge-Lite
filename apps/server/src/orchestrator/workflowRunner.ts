import prisma from "../db/prismaClient";
import { getProvider } from "../providers";
import { getWorkflowClients } from "../wsWorkflow";
import { invokeTool } from "../tools";
import { knowledgeService } from "../knowledge/service";
import type { ToolContext } from "../tools/types";

interface StepLogEntry {
  stepId: string;
  stepTitle: string;
  order: number;
  status: "pending" | "running" | "waiting_approval" | "succeeded" | "failed" | "skipped";
  output: string;
  startedAt?: string;
  finishedAt?: string;
  tokensIn?: number;
  tokensOut?: number;
}

function broadcast(runId: string, data: Record<string, unknown>): void {
  const clients = getWorkflowClients(runId);
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

// Map of runId -> Map of stepId -> approval resolver
const pendingApprovals = new Map<string, Map<string, {
  resolve: (result: { approved: boolean; editedText?: string }) => void;
}>>();

export function handleApproval(runId: string, stepId: string, approved: boolean, editedText?: string): void {
  const runApprovals = pendingApprovals.get(runId);
  if (runApprovals) {
    const pending = runApprovals.get(stepId);
    if (pending) {
      pending.resolve({ approved, editedText });
      runApprovals.delete(stepId);
    }
  }
}

export function handleCancel(runId: string): void {
  // Reject all pending approvals for this run
  const runApprovals = pendingApprovals.get(runId);
  if (runApprovals) {
    for (const [, pending] of runApprovals) {
      pending.resolve({ approved: false });
    }
    runApprovals.clear();
  }
}

export async function executeWorkflow(workflowId: string, runId: string, inputText?: string): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  if (!workflow) {
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), log: JSON.stringify([{ error: "Workflow not found" }]) },
    });
    return;
  }

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  broadcast(runId, { type: "run_started", runId, workflowId, workflowName: workflow.name });

  const logEntries: StepLogEntry[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let failed = false;
  let previousStepOutput = inputText || "";

  for (const step of workflow.steps) {
    const entry: StepLogEntry = {
      stepId: step.id,
      stepTitle: step.title,
      order: step.order,
      status: "running",
      output: "",
      startedAt: new Date().toISOString(),
    };

    broadcast(runId, { type: "step_started", stepId: step.id, stepTitle: step.title, order: step.order });

    try {
      // Determine provider
      let providerName = process.env.LLM_PROVIDER || "mock";
      let model = "mock-advanced";

      let agentTools: Record<string, boolean> = {};
      if (step.agentId) {
        const agent = await prisma.agent.findUnique({ where: { id: step.agentId } });
        if (agent) {
          model = agent.model;
          if (model.startsWith("gpt-") || model.startsWith("o")) providerName = "openai";
          else if (model.startsWith("claude-")) providerName = "anthropic";
          else if (model.startsWith("mock-")) providerName = "mock";
          agentTools = typeof agent.tools === "string" ? JSON.parse(agent.tools) : (agent.tools as Record<string, boolean>);
        }
      }

      const provider = getProvider(providerName);
      const toolCtx: ToolContext = {
        logger: console.log,
        knowledge: knowledgeService,
        agentId: step.agentId || undefined,
      };

      // Build available tools list for the provider
      const availableTools: { type: string; function: { name: string; description: string; parameters: object } }[] = [];
      if (agentTools.webSearch) {
        availableTools.push({
          type: "function",
          function: {
            name: "webSearch",
            description: "Search the web for information",
            parameters: { type: "object", properties: { query: { type: "string" }, topK: { type: "number" } }, required: ["query"] },
          },
        });
      }
      if (agentTools.codeInterpreter) {
        availableTools.push({
          type: "function",
          function: {
            name: "codeInterpreter",
            description: "Execute code in a sandboxed environment",
            parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
          },
        });
      }
      if (agentTools.knowledge) {
        availableTools.push({
          type: "function",
          function: {
            name: "knowledgeSearch",
            description: "Search the local PDF knowledge base for relevant information with citations",
            parameters: { type: "object", properties: { query: { type: "string" }, topK: { type: "number" } }, required: ["query"] },
          },
        });
      }

      // Build messages
      const systemMsg = step.instruction + (previousStepOutput
        ? `\n\nContext from previous step:\n${previousStepOutput}`
        : "");

      const messages: { role: "user" | "assistant" | "system" | "tool"; content: string }[] = [
        { role: "user", content: previousStepOutput || "Execute this step." },
      ];

      // Check if approval is required before executing
      if (step.requireApproval) {
        entry.status = "waiting_approval";
        broadcast(runId, {
          type: "approval_required",
          stepId: step.id,
          stepTitle: step.title,
          draftMessage: `Step "${step.title}" requires approval before execution.\nInstruction: ${step.instruction}`,
        });

        // Wait for approval
        if (!pendingApprovals.has(runId)) {
          pendingApprovals.set(runId, new Map());
        }

        const result = await new Promise<{ approved: boolean; editedText?: string }>((resolve) => {
          pendingApprovals.get(runId)!.set(step.id, { resolve });
          // Auto-timeout after 5 minutes
          setTimeout(() => {
            const runApprovals = pendingApprovals.get(runId);
            if (runApprovals?.has(step.id)) {
              runApprovals.delete(step.id);
              resolve({ approved: false });
            }
          }, 300000);
        });

        if (!result.approved) {
          entry.status = "skipped";
          entry.output = "Step rejected by user";
          entry.finishedAt = new Date().toISOString();
          logEntries.push(entry);
          broadcast(runId, { type: "step_skipped", stepId: step.id, reason: "rejected" });
          // Update log
          await prisma.workflowRun.update({
            where: { id: runId },
            data: { log: JSON.stringify(logEntries) },
          });
          continue;
        }

        // Use edited text if provided
        if (result.editedText) {
          messages[0] = { role: "user", content: result.editedText };
        }
      }

      entry.status = "running";
      broadcast(runId, { type: "step_executing", stepId: step.id });

      // Generate response
      let stepOutput = "";
      let stepTokensIn = 0;
      let stepTokensOut = 0;

      await provider.generate({
        model,
        system: systemMsg,
        messages,
        tools: availableTools.length > 0 ? availableTools : undefined,
        temperature: 0.7,
        maxTokens: 2048,
        onChunk: async (chunk) => {
          if (chunk.text) {
            stepOutput += chunk.text;
            broadcast(runId, { type: "chunk", stepId: step.id, text: chunk.text });
          }
          if (chunk.toolCall) {
            const toolCallId = chunk.toolCall.id || `tc_${Date.now()}`;
            const toolName: string = chunk.toolCall.name || chunk.toolCall.function?.name || "";
            const toolArgsRaw: string = chunk.toolCall.arguments || chunk.toolCall.function?.arguments || "{}";

            let toolInput: Record<string, unknown> = {};
            try {
              toolInput = JSON.parse(toolArgsRaw);
            } catch {
              toolInput = {};
            }

            broadcast(runId, {
              type: "tool_call_started",
              stepId: step.id,
              toolCallId,
              name: toolName,
              input: toolInput,
            });

            const result = await invokeTool(toolCtx, toolName, toolInput);

            broadcast(runId, {
              type: "tool_call_result",
              stepId: step.id,
              toolCallId,
              name: toolName,
              ok: result.ok,
              data: result.ok ? result.data : undefined,
              error: result.ok ? undefined : (result as { error: string }).error,
              code: result.ok ? undefined : (result as { code?: string }).code,
              ms: (result.meta as Record<string, unknown>)?.ms || 0,
            });
          }
          if (chunk.done && chunk.usage) {
            stepTokensIn = chunk.usage.tokensIn;
            stepTokensOut = chunk.usage.tokensOut;
          }
        },
      });

      entry.status = "succeeded";
      entry.output = stepOutput;
      entry.finishedAt = new Date().toISOString();
      entry.tokensIn = stepTokensIn;
      entry.tokensOut = stepTokensOut;
      totalTokensIn += stepTokensIn;
      totalTokensOut += stepTokensOut;
      previousStepOutput = stepOutput;

      broadcast(runId, {
        type: "step_completed",
        stepId: step.id,
        output: stepOutput,
        tokensIn: stepTokensIn,
        tokensOut: stepTokensOut,
      });
    } catch (err: any) {
      entry.status = "failed";
      entry.output = `Error: ${err.message}`;
      entry.finishedAt = new Date().toISOString();
      failed = true;
      broadcast(runId, { type: "step_failed", stepId: step.id, error: err.message });
    }

    logEntries.push(entry);

    // Update log incrementally
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { log: JSON.stringify(logEntries) },
    });

    if (failed) break;
  }

  // Finalize
  const finalStatus = failed ? "failed" : "succeeded";
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      log: JSON.stringify(logEntries),
      usage: JSON.stringify({ tokensIn: totalTokensIn, tokensOut: totalTokensOut }),
    },
  });

  broadcast(runId, {
    type: finalStatus === "succeeded" ? "completed" : "failed",
    runId,
    status: finalStatus,
    usage: { tokensIn: totalTokensIn, tokensOut: totalTokensOut },
  });

  // Clean up approvals
  pendingApprovals.delete(runId);
}
