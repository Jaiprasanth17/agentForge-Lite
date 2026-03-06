import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { IncomingMessage } from "http";
import { handleApproval, handleCancel } from "./orchestrator/workflowRunner";

interface WSWorkflowMessage {
  type: string;
  stepId?: string;
  approved?: boolean;
  editedText?: string;
}

// Track clients per runId
const runClients = new Map<string, Set<WebSocket>>();

export function getWorkflowClients(runId: string): Set<WebSocket> {
  return runClients.get(runId) || new Set();
}

export function setupWorkflowWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const runId = url.searchParams.get("runId");

    if (!runId) {
      ws.send(JSON.stringify({ type: "error", text: "Missing runId parameter" }));
      ws.close();
      return;
    }

    // Register client
    if (!runClients.has(runId)) {
      runClients.set(runId, new Set());
    }
    runClients.get(runId)!.add(ws);

    ws.send(JSON.stringify({ type: "connected", runId }));

    ws.on("message", (data) => {
      try {
        const msg: WSWorkflowMessage = JSON.parse(data.toString());

        if (msg.type === "approval" && msg.stepId !== undefined) {
          handleApproval(runId, msg.stepId, msg.approved ?? false, msg.editedText);
        }

        if (msg.type === "cancel") {
          handleCancel(runId);
        }
      } catch (err) {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      const clients = runClients.get(runId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          runClients.delete(runId);
        }
      }
    });
  });
}
