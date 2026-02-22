import type { Request, Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import { isValidLanguage, isValidLevel } from "../../interfaces/http/validators/ai.validators.js";

export async function suggestLesson(req: Request, res: Response) {
  const { language, level, topic } = req.body ?? {};

  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (topic !== undefined && String(topic).trim().length === 0) {
    return res.status(400).json({ error: "invalid_topic" });
  }

  const llm = getLlmClient();

  try {
    const suggestion = await llm.suggestLesson({
      language: String(language),
      level: String(level),
      topic: topic ? String(topic) : undefined
    });

    return res.status(200).json({ suggestion });
  } catch (error) {
    console.error("AI suggestLesson LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}
