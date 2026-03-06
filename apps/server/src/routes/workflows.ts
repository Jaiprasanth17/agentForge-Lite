import { Router, Request, Response } from "express";
import prisma from "../db/prismaClient";
import { z } from "zod";
import { executeWorkflow } from "../orchestrator/workflowRunner";

const router = Router();

const WorkflowStepSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(0),
  title: z.string().min(1, "Step title is required"),
  instruction: z.string().min(1, "Step instruction is required"),
  agentId: z.string().nullable().optional(),
  requireApproval: z.boolean().default(false),
});

const WorkflowSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional().nullable(),
  trigger: z.enum(["manual", "schedule", "webhook", "event"]).default("manual"),
  scheduleCron: z.string().optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  steps: z.array(WorkflowStepSchema).min(1, "At least one step is required"),
});

// Basic cron validation
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

// GET /api/workflows - list with pagination + search
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const where = search
      ? { name: { contains: search } }
      : {};

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        include: { steps: { orderBy: { order: "asc" } }, _count: { select: { runs: true } } },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.workflow.count({ where }),
    ]);

    res.json({ workflows, total, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows - create
router.post("/", async (req: Request, res: Response) => {
  try {
    const data = WorkflowSchema.parse(req.body);

    if (data.trigger === "schedule" && data.scheduleCron) {
      if (!isValidCron(data.scheduleCron)) {
        res.status(400).json({ error: "Invalid cron expression" });
        return;
      }
    }

    const workflow = await prisma.workflow.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        trigger: data.trigger,
        scheduleCron: data.scheduleCron ?? null,
        status: data.status,
        steps: {
          create: data.steps.map((s) => ({
            order: s.order,
            title: s.title,
            instruction: s.instruction,
            agentId: s.agentId ?? null,
            requireApproval: s.requireApproval,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    res.status(201).json(workflow);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/:id - single with steps
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json(workflow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/workflows/:id - update including reordering steps
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const data = WorkflowSchema.parse(req.body);

    if (data.trigger === "schedule" && data.scheduleCron) {
      if (!isValidCron(data.scheduleCron)) {
        res.status(400).json({ error: "Invalid cron expression" });
        return;
      }
    }

    // Delete existing steps and recreate
    await prisma.workflowStep.deleteMany({ where: { workflowId: req.params.id } });

    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        description: data.description ?? null,
        trigger: data.trigger,
        scheduleCron: data.scheduleCron ?? null,
        status: data.status,
        steps: {
          create: data.steps.map((s) => ({
            order: s.order,
            title: s.title,
            instruction: s.instruction,
            agentId: s.agentId ?? null,
            requireApproval: s.requireApproval,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    res.json(workflow);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workflows/:id - archive (soft delete)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    await prisma.workflow.update({
      where: { id: req.params.id },
      data: { status: "archived" },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows/:id/execute - run now
router.post("/:id/execute", async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: "queued",
        log: JSON.stringify([]),
      },
    });

    // Start execution asynchronously
    executeWorkflow(workflow.id, run.id).catch((err) => {
      console.error(`Workflow run ${run.id} failed:`, err);
    });

    res.status(201).json(run);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/:id/runs - list runs
router.get("/:id/runs", async (req: Request, res: Response) => {
  try {
    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: req.params.id },
      orderBy: { startedAt: "desc" },
    });
    const parsed = runs.map((r) => ({
      ...r,
      log: r.log ? JSON.parse(r.log) : [],
      usage: r.usage ? JSON.parse(r.usage) : null,
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/runs/:runId - run details
router.get("/runs/:runId", async (req: Request, res: Response) => {
  try {
    const run = await prisma.workflowRun.findUnique({
      where: { id: req.params.runId },
      include: { workflow: { include: { steps: { orderBy: { order: "asc" } } } } },
    });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json({
      ...run,
      log: run.log ? JSON.parse(run.log) : [],
      usage: run.usage ? JSON.parse(run.usage) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows/:id/webhook - webhook trigger
router.post("/:id/webhook", async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    if (workflow.status !== "active") {
      res.status(400).json({ error: "Workflow is not active" });
      return;
    }
    if (workflow.trigger !== "webhook") {
      res.status(400).json({ error: "Workflow is not configured for webhook trigger" });
      return;
    }

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: "queued",
        log: JSON.stringify([]),
      },
    });

    executeWorkflow(workflow.id, run.id, req.body?.input).catch((err) => {
      console.error(`Webhook workflow run ${run.id} failed:`, err);
    });

    res.status(201).json(run);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
