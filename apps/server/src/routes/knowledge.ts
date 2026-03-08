import { Router } from "express";
import { searchKnowledge, getKnowledgeStatus } from "../knowledge/service";
import { exec } from "child_process";
import path from "path";

const router = Router();

// GET /api/knowledge/status
router.get("/status", async (_req, res) => {
  try {
    const status = await getKnowledgeStatus();
    res.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /api/knowledge/search?q=&topK=5
router.get("/search", async (req, res) => {
  const q = req.query.q as string;
  const topK = parseInt(req.query.topK as string) || 5;

  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }

  try {
    const results = await searchKnowledge(q, topK);
    res.json({ query: q, topK, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /api/knowledge/reindex
router.post("/reindex", (_req, res) => {
  const scriptPath = path.resolve(__dirname, "../knowledge/ingest.ts");
  exec(`npx tsx ${scriptPath}`, { cwd: path.resolve(__dirname, "../../../") }, (err, stdout, stderr) => {
    if (err) {
      console.error("[Knowledge Reindex] Error:", stderr);
      res.status(500).json({ error: "Reindex failed", details: stderr });
      return;
    }
    console.log("[Knowledge Reindex]", stdout);
    res.json({ ok: true, output: stdout });
  });
});

export default router;
