import { Router } from "express";
import { invokeTool, TOOL_REGISTRY } from "../tools";
import { knowledgeService } from "../knowledge/service";

const router = Router();

// POST /api/tools/invoke
router.post("/invoke", async (req, res) => {
  const { name, input } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ ok: false, error: "Missing or invalid 'name' field", code: "BAD_REQUEST" });
    return;
  }

  if (input !== undefined && typeof input !== "object") {
    res.status(400).json({ ok: false, error: "'input' must be an object", code: "BAD_REQUEST" });
    return;
  }

  const ctx = {
    logger: console.log,
    knowledge: knowledgeService,
  };

  const result = await invokeTool(ctx, name, input || {});
  const status = result.ok ? 200 : (result.code === "TOOL_NOT_FOUND" ? 404 : 400);
  res.status(status).json(result);
});

// GET /api/tools - list registered tools
router.get("/", (_req, res) => {
  const tools = Object.values(TOOL_REGISTRY).map((t) => ({
    name: t.name,
    description: t.description,
  }));
  res.json({ tools });
});

export default router;
