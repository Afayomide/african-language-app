import type { Request, Response } from "express";
import mongoose from "mongoose";
import { getLlmClient } from "../../services/llm/index.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { AiPhraseOrchestrator } from "../../application/services/AiPhraseOrchestrator.js";
import { isValidLanguage, isValidLevel, validateLessonId } from "../../interfaces/http/validators/ai.validators.js";

const lessons = new MongooseLessonRepository();
const phrases = new MongoosePhraseRepository();

export async function generatePhrases(req: Request, res: Response) {
  const { lessonId, language, level, seedWords, extraInstructions } = req.body ?? {};

  if (!validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (language !== undefined && !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (level !== undefined && !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const lesson = await lessons.findById(String(lessonId));
    if (!lesson) {
      return res.status(404).json({ error: "lesson not found" });
    }
    if (language && language !== lesson.language) {
      return res.status(400).json({ error: "lesson language mismatch" });
    }
    if (level && level !== lesson.level) {
      return res.status(400).json({ error: "lesson level mismatch" });
    }
    const created = await orchestrator.generateForLesson({
      lesson,
      seedWords: Array.isArray(seedWords) ? seedWords.map(String) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no new phrases generated" });
    }

    return res.status(201).json({ total: created.length, phrases: created });
  } catch (error) {
    console.error("AI generatePhrases LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function enhancePhrase(req: Request, res: Response) {
  const { id } = req.params;
  const { language, level } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }

  const phrase = await phrases.findById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase not found" });
  }
  if (phrase.status === "published" || phrase.status === "finished") {
    return res.status(409).json({ error: "cannot edit non draft" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const updated = await orchestrator.enhancePhrase({
      phrase,
      language: String(language) as "yoruba" | "igbo" | "hausa",
      level: String(level) as "beginner" | "intermediate" | "advanced"
    });

    if (!updated) {
      return res.status(422).json({ error: "no valid phrase updates" });
    }

    return res.status(200).json({ phrase: updated });
  } catch (error) {
    console.error("AI enhancePhrase LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}
