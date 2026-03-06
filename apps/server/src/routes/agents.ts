import { Router, Request, Response } from "express";
import prisma from "../db/prismaClient";
import { z } from "zod";

const router = Router();

const AgentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().min(1, "Model is required"),
  role: z.string().optional().nullable(),
  system: z.string().optional().nullable(),
  tools: z.object({
    webSearch: z.boolean().default(false),
    codeInterpreter: z.boolean().default(false),
    memory: z.boolean().default(false),
    advancedReasoning: z.boolean().default(false),
  }).default({}),
  parameters: z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().min(1).max(128000).default(2048),
    topP: z.number().min(0).max(1).default(1),
    toolChoice: z.enum(["auto", "none"]).default("auto"),
    contextBudget: z.number().min(1000).max(200000).default(16000),
  }).default({}),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
});

// GET /api/agents
router.get("/", async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { updatedAt: "desc" },
    });
    const parsed = agents.map((a) => ({
      ...a,
      tools: JSON.parse(a.tools),
      parameters: JSON.parse(a.parameters),
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({
      ...agent,
      tools: JSON.parse(agent.tools),
      parameters: JSON.parse(agent.parameters),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents
router.post("/", async (req: Request, res: Response) => {
  try {
    const data = AgentSchema.parse(req.body);
    const agent = await prisma.agent.create({
      data: {
        name: data.name,
        model: data.model,
        role: data.role ?? null,
        system: data.system ?? null,
        tools: JSON.stringify(data.tools),
        parameters: JSON.stringify(data.parameters),
        status: data.status,
      },
    });
    res.status(201).json({
      ...agent,
      tools: JSON.parse(agent.tools),
      parameters: JSON.parse(agent.parameters),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const data = AgentSchema.partial().parse(req.body);
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.role !== undefined && { role: data.role ?? null }),
        ...(data.system !== undefined && { system: data.system ?? null }),
        ...(data.tools !== undefined && { tools: JSON.stringify(data.tools) }),
        ...(data.parameters !== undefined && { parameters: JSON.stringify(data.parameters) }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
    res.json({
      ...agent,
      tools: JSON.parse(agent.tools),
      parameters: JSON.parse(agent.parameters),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
