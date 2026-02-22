import type { Request, Response, NextFunction } from "express";

const AI_API_KEY = process.env.AI_API_KEY || "";

export function requireAiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.header("x-ai-key");
  if (!header) {
    console.error("AI request missing x-ai-key");
    return res.status(401).json({ error: "missing_ai_key" });
  }
  if (!AI_API_KEY) {
    console.error("AI_API_KEY not set on server");
    return res.status(500).json({ error: "server_misconfigured" });
  }
  if (header !== AI_API_KEY) {
    console.error("AI request invalid x-ai-key");
    return res.status(403).json({ error: "invalid_ai_key" });
  }

  return next();
}
