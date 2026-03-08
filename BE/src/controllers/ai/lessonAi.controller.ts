import type { Request, Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import { isValidLanguage, isValidLevel } from "../../interfaces/http/validators/ai.validators.js";

function isEnglishLikeTitle(value: string) {
  const title = String(value || "").trim();
  if (!title) return false;
  return /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/.test(title);
}

export async function suggestLesson(req: Request, res: Response) {
  const { language, level, topic } = req.body ?? {};

  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (topic !== undefined && String(topic).trim().length === 0) {
    return res.status(400).json({ error: "invalid topic" });
  }

  const llm = getLlmClient();

  try {
    const suggestion = await llm.suggestLesson({
      language: String(language),
      level: String(level),
      topic: topic ? String(topic) : undefined
    });

    if (!isEnglishLikeTitle(String(suggestion.title || ""))) {
      return res.status(422).json({ error: "AI title must be in English." });
    }

    return res.status(200).json({ suggestion });
  } catch (error) {
    console.error("AI suggestLesson LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}
