import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import express from "express";
import cors from "cors";
import { createServer } from "http";
import agentsRouter from "./routes/agents";
import providersRouter from "./routes/providers";
import { setupWebSocket } from "./ws";

const app = express();
const server = createServer(app);

const PORT = parseInt(process.env.SERVER_PORT || "8080", 10);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// Routes
app.use("/api/agents", agentsRouter);
app.use("/api/providers", providersRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`[AgentForge Server] Running on http://localhost:${PORT}`);
  console.log(`[AgentForge Server] WebSocket at ws://localhost:${PORT}/ws/test`);
});

export default app;
