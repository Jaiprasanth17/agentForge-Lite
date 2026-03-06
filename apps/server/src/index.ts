import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import agentsRouter from "./routes/agents";
import providersRouter from "./routes/providers";
import workflowsRouter from "./routes/workflows";
import { setupWebSocket } from "./ws";
import { setupWorkflowWebSocket } from "./wsWorkflow";
import { initScheduler } from "./scheduler";

const app = express();
const server = createServer(app);

const PORT = parseInt(process.env.SERVER_PORT || "8080", 10);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// Routes
app.use("/api/agents", agentsRouter);
app.use("/api/providers", providersRouter);
app.use("/api/workflows", workflowsRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket - use noServer mode to handle multiple paths
const testWss = new WebSocketServer({ noServer: true });
const workflowWss = new WebSocketServer({ noServer: true });

setupWebSocket(testWss);
setupWorkflowWebSocket(workflowWss);

server.on("upgrade", (request, socket, head) => {
  const pathname = request.url?.split("?")[0];

  if (pathname === "/ws/test") {
    testWss.handleUpgrade(request, socket, head, (ws) => {
      testWss.emit("connection", ws, request);
    });
  } else if (pathname === "/ws/workflow") {
    workflowWss.handleUpgrade(request, socket, head, (ws) => {
      workflowWss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Initialize scheduler for cron-triggered workflows
initScheduler().catch((err) => {
  console.error("[Scheduler] Failed to initialize:", err);
});

server.listen(PORT, () => {
  console.log(`[Agentic Nexus Server] Running on http://localhost:${PORT}`);
  console.log(`[Agentic Nexus Server] WebSocket at ws://localhost:${PORT}/ws/test`);
  console.log(`[Agentic Nexus Server] Workflow WS at ws://localhost:${PORT}/ws/workflow`);
});

export default app;
