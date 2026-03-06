import { Router, Request, Response } from "express";
import { getAllProviders } from "../providers";

const router = Router();

// GET /api/providers/models
router.get("/models", async (_req: Request, res: Response) => {
  try {
    const providers = getAllProviders();
    const results = await Promise.all(
      providers.map(async (p) => ({
        name: p.name,
        models: await p.listModels(),
      }))
    );
    res.json({ providers: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
