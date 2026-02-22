import type { Response } from "express";
import mongoose from "mongoose";
import { generatePhraseAudio } from "../../services/tts/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorPhraseUseCases } from "../../application/use-cases/tutor/phrase/TutorPhraseUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
import {
  isValidPhraseDifficulty,
  isValidPhraseStatus
} from "../../interfaces/http/validators/phrase.validators.js";

const phraseUseCases = new TutorPhraseUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseQuestionRepository()
);
const lessonRepo = new MongooseLessonRepository();
const phraseRepo = new MongoosePhraseRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createPhrase(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId, text, translation, pronunciation, explanation, examples, difficulty } = req.body ?? {};

  if (!lessonId || !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (!text || String(text).trim().length === 0) {
    return res.status(400).json({ error: "text_required" });
  }
  if (!translation || String(translation).trim().length === 0) {
    return res.status(400).json({ error: "translation_required" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const phrase = await phraseUseCases.create(
    {
      lessonId: String(lessonId),
      text: String(text).trim(),
      translation: String(translation).trim(),
      pronunciation: pronunciation ? String(pronunciation).trim() : "",
      explanation: explanation ? String(explanation).trim() : "",
      examples: Array.isArray(examples) ? examples : undefined,
      difficulty: difficulty !== undefined ? Number(difficulty) : undefined,
      status: "draft"
    },
    tutorLanguage as Language
  );
  if (!phrase) {
    return res.status(404).json({ error: "lesson_not_found_or_out_of_scope" });
  }

  return res.status(201).json({ phrase });
}

export async function listPhrases(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const status = req.query.status ? String(req.query.status) : undefined;
  const lessonId = req.query.lessonId ? String(req.query.lessonId) : undefined;

  if (status && !isValidPhraseStatus(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }
  if (lessonId && !mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const phrases = await phraseUseCases.list(
    {
      status: status as "draft" | "published" | undefined,
      lessonId
    },
    tutorLanguage as Language
  );
  return res.status(200).json({ total: phrases.length, phrases });
}

export async function getPhraseById(req: AuthRequest, res: Response) {
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

  const result = await phraseUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!result) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  return res.status(200).json({ phrase: result.phrase });
}

export async function updatePhrase(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  const { text, translation, pronunciation, explanation, examples, difficulty, lessonId } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const update: Partial<{
    lessonId: string;
    text: string;
    translation: string;
    pronunciation: string;
    explanation: string;
    examples: Array<{ original: string; translation: string }>;
    difficulty: number;
  }> = {};

  if (lessonId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(lessonId))) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
    update.lessonId = String(lessonId);
  }
  if (text !== undefined) {
    if (!String(text).trim()) return res.status(400).json({ error: "text_required" });
    update.text = String(text).trim();
  }
  if (translation !== undefined) {
    if (!String(translation).trim()) return res.status(400).json({ error: "translation_required" });
    update.translation = String(translation).trim();
  }
  if (pronunciation !== undefined) update.pronunciation = String(pronunciation).trim();
  if (explanation !== undefined) update.explanation = String(explanation).trim();
  if (examples !== undefined) {
    if (!Array.isArray(examples)) return res.status(400).json({ error: "invalid_examples" });
    update.examples = examples;
  }
  if (difficulty !== undefined) {
    const value = Number(difficulty);
    if (!isValidPhraseDifficulty(value)) {
      return res.status(400).json({ error: "invalid_difficulty" });
    }
    update.difficulty = value;
  }
  const updated = await phraseUseCases.updateInScope(id, tutorLanguage as Language, update);
  if (updated === "target_lesson_out_of_scope") {
    return res.status(400).json({ error: "target_lesson_out_of_scope" });
  }
  if (!updated) {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  return res.status(200).json({ phrase: updated });
}

export async function deletePhrase(req: AuthRequest, res: Response) {
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

  const deleted = await phraseUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!deleted) {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  return res.status(200).json({ message: "phrase_deleted" });
}

export async function generatePhraseAudioById(req: AuthRequest, res: Response) {
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

  const phrase = await phraseRepo.findById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  const lesson = await lessonRepo.findById(phrase.lessonId);
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  try {
    const audio = await generatePhraseAudio({
      text: phrase.text,
      language: lesson.language as "yoruba" | "igbo" | "hausa",
      lessonId: lesson.id
    });

    const updated = await phraseRepo.updateById(phrase.id, { audio });
    if (!updated) {
      return res.status(404).json({ error: "phrase_not_found" });
    }
    return res.status(200).json({ phrase: updated });
  } catch (error) {
    console.error("Tutor generatePhraseAudioById TTS error", error);
    return res.status(502).json({ error: "tts_generation_failed" });
  }
}

export async function generateLessonPhrasesAudio(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found_or_out_of_scope" });
  }

  const phrases = await phraseRepo.findByLessonId(lesson.id);
  const updatedIds: string[] = [];
  const failedIds: string[] = [];

  for (const phrase of phrases) {
    try {
      const audio = await generatePhraseAudio({
        text: phrase.text,
        language: lesson.language as "yoruba" | "igbo" | "hausa",
        lessonId: lesson.id
      });
      const updated = await phraseRepo.updateById(phrase.id, { audio });
      if (updated) {
        updatedIds.push(phrase.id);
      } else {
        failedIds.push(phrase.id);
      }
    } catch {
      failedIds.push(phrase.id);
    }
  }

  return res.status(200).json({
    lessonId: lesson.id,
    total: phrases.length,
    updatedCount: updatedIds.length,
    failedCount: failedIds.length,
    updatedIds,
    failedIds
  });
}
