import dotenv from "dotenv";
import path from "path";
// Load .env from project root (works regardless of cwd)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
// Also try loading from server directory and cwd as fallbacks
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import agentsRouter from "./routes/agents";
import providersRouter from "./routes/providers";
import workflowsRouter from "./routes/workflows";
import knowledgeRouter from "./routes/knowledge";
import toolsRouter from "./routes/tools";
import { setupWebSocket } from "./ws";
import { setupWorkflowWebSocket } from "./wsWorkflow";
import { initScheduler } from "./scheduler";

// Import tools index to register all tools in the registry
import "./tools";

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
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/tools", toolsRouter);

// Serve PDFs read-only from knowledge directory
const knowledgeDir = process.env.KNOWLEDGE_DIR || path.resolve(__dirname, "../../knowledge");
app.use("/static/knowledge", express.static(knowledgeDir));

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
