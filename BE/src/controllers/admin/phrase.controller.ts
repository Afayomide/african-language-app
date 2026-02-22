import type { Request, Response } from "express";
import mongoose from "mongoose";
import { generatePhraseAudio } from "../../services/tts/index.js";
import { AdminPhraseUseCases } from "../../application/use-cases/admin/phrase/AdminPhraseUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import {
  isValidPhraseDifficulty,
  isValidPhraseStatus
} from "../../interfaces/http/validators/phrase.validators.js";

const phraseUseCases = new AdminPhraseUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseQuestionRepository()
);
const lessonRepo = new MongooseLessonRepository();
const phraseRepo = new MongoosePhraseRepository();

export async function createPhrase(req: Request, res: Response) {
  const {
    lessonId,
    text,
    translation,
    pronunciation,
    explanation,
    examples,
    difficulty,
    aiMeta
  } = req.body ?? {};

  if (!lessonId || !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (!text || String(text).trim().length === 0) {
    return res.status(400).json({ error: "text_required" });
  }
  if (!translation || String(translation).trim().length === 0) {
    return res.status(400).json({ error: "translation_required" });
  }
  if (examples !== undefined && !Array.isArray(examples)) {
    return res.status(400).json({ error: "invalid_examples" });
  }
  if (difficulty !== undefined) {
    const value = Number(difficulty);
    if (!isValidPhraseDifficulty(value)) {
      return res.status(400).json({ error: "invalid_difficulty" });
    }
  }
  if (aiMeta !== undefined) {
    if (typeof aiMeta !== "object" || aiMeta === null) {
      return res.status(400).json({ error: "invalid_ai_meta" });
    }
  }

  const phrase = await phraseUseCases.create({
    lessonId: String(lessonId),
    text: String(text).trim(),
    translation: String(translation).trim(),
    pronunciation: pronunciation ? String(pronunciation).trim() : "",
    explanation: explanation ? String(explanation).trim() : "",
    examples: Array.isArray(examples) ? examples : undefined,
    difficulty: difficulty !== undefined ? Number(difficulty) : undefined,
    aiMeta: aiMeta !== undefined ? aiMeta : undefined,
    status: "draft"
  });
  if (!phrase) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(201).json({ phrase });
}

export async function listPhrases(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status) : undefined;
  const lessonId = req.query.lessonId ? String(req.query.lessonId) : undefined;
  const language = req.query.language ? String(req.query.language) : undefined;

  if (status && !isValidPhraseStatus(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }
  if (lessonId && !mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "invalid_language" });
  }

  const phrases = await phraseUseCases.list({
    status: status as "draft" | "published" | undefined,
    lessonId,
    language: language as Language | undefined
  });
  return res.status(200).json({ total: phrases.length, phrases });
}

export async function getPhraseById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const phrase = await phraseUseCases.getById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  return res.status(200).json({ phrase });
}

export async function updatePhrase(req: Request, res: Response) {
  const { id } = req.params;
  const { text, translation, pronunciation, explanation, examples, difficulty, aiMeta } =
    req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const update: Record<string, unknown> = {};
  if (text !== undefined) {
    if (!String(text).trim()) {
      return res.status(400).json({ error: "text_required" });
    }
    update.text = String(text).trim();
  }
  if (translation !== undefined) {
    if (!String(translation).trim()) {
      return res.status(400).json({ error: "translation_required" });
    }
    update.translation = String(translation).trim();
  }
  if (pronunciation !== undefined) {
    update.pronunciation = String(pronunciation).trim();
  }
  if (explanation !== undefined) {
    update.explanation = String(explanation).trim();
  }
  if (examples !== undefined) {
    if (!Array.isArray(examples)) {
      return res.status(400).json({ error: "invalid_examples" });
    }
    update.examples = examples;
  }
  if (difficulty !== undefined) {
    const value = Number(difficulty);
    if (!isValidPhraseDifficulty(value)) {
      return res.status(400).json({ error: "invalid_difficulty" });
    }
    update.difficulty = value;
  }
  if (aiMeta !== undefined) {
    if (typeof aiMeta !== "object" || aiMeta === null) {
      return res.status(400).json({ error: "invalid_ai_meta" });
    }
    update.aiMeta = aiMeta;
  }

  const phrase = await phraseUseCases.update(id, update);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  return res.status(200).json({ phrase });
}

export async function deletePhrase(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const phrase = await phraseUseCases.delete(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  return res.status(200).json({ message: "phrase_deleted" });
}

export async function publishPhrase(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const phrase = await phraseUseCases.publish(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  return res.status(200).json({ phrase });
}

export async function generatePhraseAudioById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const phrase = await phraseRepo.findById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }

  const lesson = await lessonRepo.findById(phrase.lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
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
    console.error("Admin generatePhraseAudioById TTS error", error);
    return res.status(502).json({ error: "tts_generation_failed" });
  }
}

export async function generateLessonPhrasesAudio(req: Request, res: Response) {
  const { lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const lesson = await lessonRepo.findById(lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
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
    } catch (error) {
      console.error("Admin generateLessonPhrasesAudio TTS error", {
        phraseId: phrase.id,
        error
      });
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
