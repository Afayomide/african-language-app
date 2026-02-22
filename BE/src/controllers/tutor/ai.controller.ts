import type { Response } from "express";
import mongoose from "mongoose";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { AiPhraseOrchestrator } from "../../application/services/AiPhraseOrchestrator.js";
import { isValidLevel, validateLessonId } from "../../interfaces/http/validators/ai.validators.js";

const lessons = new MongooseLessonRepository();
const phrases = new MongoosePhraseRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function suggestLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { level, topic } = req.body ?? {};
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (topic !== undefined && String(topic).trim().length === 0) {
    return res.status(400).json({ error: "invalid_topic" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const llm = getLlmClient();
  try {
    const suggestion = await llm.suggestLesson({
      language: tutorLanguage,
      level: String(level),
      topic: topic ? String(topic) : undefined
    });

    return res.status(200).json({ suggestion });
  } catch (error) {
    console.error("Tutor AI suggestLesson LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}

export async function generatePhrases(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId, seedWords } = req.body ?? {};
  if (!validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid_seed_words" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessons.findById(String(lessonId));
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "lesson_not_found_or_out_of_scope" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const created = await orchestrator.generateForLesson({
      lesson,
      seedWords: Array.isArray(seedWords) ? seedWords.map(String) : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no_new_phrases_generated" });
    }

    return res.status(201).json({ total: created.length, phrases: created });
  } catch (error) {
    console.error("Tutor AI generatePhrases LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}

export async function enhancePhrase(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const phrase = await phrases.findById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  if (phrase.status === "published" || phrase.status === "finished") {
    return res.status(409).json({ error: "cannot_edit_non_draft" });
  }

  const primaryLessonId = phrase.lessonIds[0];
  if (!primaryLessonId) {
    return res.status(400).json({ error: "phrase_has_no_lessons" });
  }
  const lesson = await lessons.findById(primaryLessonId);
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "phrase_not_found_or_out_of_scope" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const updated = await orchestrator.enhancePhrase({
      phrase,
      language: tutorLanguage,
      level: lesson.level
    });

    if (!updated) {
      return res.status(422).json({ error: "no_valid_phrase_updates" });
    }

    return res.status(200).json({ phrase: updated });
  } catch (error) {
    console.error("Tutor AI enhancePhrase LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}
