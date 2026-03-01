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
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (language !== undefined && !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }
  if (level !== undefined && !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid_seed_words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid_extra_instructions" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const lesson = await lessons.findById(String(lessonId));
    if (!lesson) {
      return res.status(404).json({ error: "lesson_not_found" });
    }
    if (language && language !== lesson.language) {
      return res.status(400).json({ error: "lesson_language_mismatch" });
    }
    if (level && level !== lesson.level) {
      return res.status(400).json({ error: "lesson_level_mismatch" });
    }
    const created = await orchestrator.generateForLesson({
      lesson,
      seedWords: Array.isArray(seedWords) ? seedWords.map(String) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no_new_phrases_generated" });
    }

    return res.status(201).json({ total: created.length, phrases: created });
  } catch (error) {
    console.error("AI generatePhrases LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}

export async function enhancePhrase(req: Request, res: Response) {
  const { id } = req.params;
  const { language, level } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }

  const phrase = await phrases.findById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  if (phrase.status === "published" || phrase.status === "finished") {
    return res.status(409).json({ error: "cannot_edit_non_draft" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const updated = await orchestrator.enhancePhrase({
      phrase,
      language: String(language) as "yoruba" | "igbo" | "hausa",
      level: String(level) as "beginner" | "intermediate" | "advanced"
    });

    if (!updated) {
      return res.status(422).json({ error: "no_valid_phrase_updates" });
    }

    return res.status(200).json({ phrase: updated });
  } catch (error) {
    console.error("AI enhancePhrase LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}
