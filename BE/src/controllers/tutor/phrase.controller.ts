import type { Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import PhraseModel from "../../models/Phrase.js";
import { generatePhraseAudio } from "../../services/tts/index.js";
import { uploadAudio } from "../../services/storage/s3.js";
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
import {
  getSearchQuery,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const phraseUseCases = new TutorPhraseUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseQuestionRepository()
);
const lessonRepo = new MongooseLessonRepository();
const phraseRepo = new MongoosePhraseRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildManualAudioMeta(input: {
  lessonId: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const extensionByMime: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac"
  };
  const format = extensionByMime[input.mimeType] || "mp3";
  const key = `phrases/${input.lessonId}/manual/${crypto.randomUUID()}.${format}`;

  return uploadAudio(input.buffer, key, input.mimeType).then((url) => ({
    provider: "manual_upload",
    model: "",
    voice: "",
    locale: "",
    format,
    url,
    s3Key: key
  }));
}

function parseAudioUpload(audioUpload: unknown) {
  if (audioUpload === undefined) return null;
  if (typeof audioUpload !== "object" || audioUpload === null) return "invalid_audio_upload";

  const payload = audioUpload as { base64?: unknown; mimeType?: unknown };
  if (!payload.base64 || typeof payload.base64 !== "string") return "invalid_audio_upload";

  const dataUrlMatch = payload.base64.match(/^data:([^;]+).*?base64,(.+)$/);
  const base64Data = dataUrlMatch ? dataUrlMatch[2] : payload.base64;
  const mimeTypeFromDataUrl = dataUrlMatch ? dataUrlMatch[1] : undefined;
  const mimeType =
    typeof payload.mimeType === "string" && payload.mimeType.startsWith("audio/")
      ? payload.mimeType
      : mimeTypeFromDataUrl && mimeTypeFromDataUrl.startsWith("audio/")
        ? mimeTypeFromDataUrl
        : "audio/mpeg";

  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return "invalid_audio_upload";
    if (buffer.length > 15 * 1024 * 1024) return "audio_too_large";
    return { buffer, mimeType };
  } catch {
    return "invalid_audio_upload";
  }
}

export async function createPhrase(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonIds, text, translation, pronunciation, explanation, examples, difficulty, audioUpload } = req.body ?? {};

  if (!Array.isArray(lessonIds)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  const normalizedLessonIds = Array.isArray(lessonIds)
    ? Array.from(new Set(lessonIds.map(String)))
    : [];
  if (normalizedLessonIds.length === 0) {
    return res.status(400).json({ error: "lesson_ids_required" });
  }
  if (normalizedLessonIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
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

  const parsedAudioUpload = parseAudioUpload(audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") {
    return res.status(400).json({ error: "invalid_audio_upload" });
  }
  if (parsedAudioUpload === "audio_too_large") {
    return res.status(400).json({ error: "audio_too_large" });
  }

  let uploadedAudio: Awaited<ReturnType<typeof buildManualAudioMeta>> | undefined;
  if (parsedAudioUpload) {
    const scopedLessons = await Promise.all(
      normalizedLessonIds.map((lessonId) => lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language))
    );
    if (scopedLessons.some((lesson) => !lesson)) {
      return res.status(404).json({ error: "lesson_not_found_or_out_of_scope" });
    }
    uploadedAudio = await buildManualAudioMeta({
      lessonId: normalizedLessonIds[0] || "unassigned",
      mimeType: parsedAudioUpload.mimeType,
      buffer: parsedAudioUpload.buffer
    });
  }

  const phrase = await phraseUseCases.create(
    {
      lessonIds: normalizedLessonIds,
      language: tutorLanguage as Language,
      text: String(text).trim(),
      translation: String(translation).trim(),
      pronunciation: pronunciation ? String(pronunciation).trim() : "",
      explanation: explanation ? String(explanation).trim() : "",
      examples: Array.isArray(examples) ? examples : undefined,
      difficulty: difficulty !== undefined ? Number(difficulty) : undefined,
      audio: uploadedAudio,
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
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

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

  const query: Record<string, unknown> = {
    isDeleted: { $ne: true },
    language: tutorLanguage
  };
  if (status) query.status = status;
  if (lessonId) query.lessonIds = lessonId;
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { text: regex },
      { translation: regex },
      { pronunciation: regex },
      { explanation: regex },
      { status: regex },
      { language: regex }
    ];
  }

  const total = await PhraseModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);
  const skip = (page - 1) * paginationInput.limit;

  const phrases = await PhraseModel.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(paginationInput.limit)
    .lean();

  return res.status(200).json({
    total,
    phrases,
    pagination: {
      page,
      limit: paginationInput.limit,
      total,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages
    }
  });
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
  const { text, translation, pronunciation, explanation, examples, difficulty, lessonIds, audioUpload } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const update: Partial<{
    lessonIds: string[];
    language: Language;
    text: string;
    translation: string;
    pronunciation: string;
    explanation: string;
    examples: Array<{ original: string; translation: string }>;
    difficulty: number;
    audio: {
      provider: string;
      model: string;
      voice: string;
      locale: string;
      format: string;
      url: string;
      s3Key: string;
    };
  }> = {};

  if (lessonIds !== undefined) {
    if (!Array.isArray(lessonIds)) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
    const normalizedLessonIds = Array.from(new Set(lessonIds.map(String)));
    if (normalizedLessonIds.length === 0) {
      return res.status(400).json({ error: "lesson_ids_required" });
    }
    if (normalizedLessonIds.some((lessonId) => !mongoose.Types.ObjectId.isValid(lessonId))) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
    update.lessonIds = normalizedLessonIds;
  }
  update.language = tutorLanguage as Language;
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
  const parsedAudioUpload = parseAudioUpload(audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") {
    return res.status(400).json({ error: "invalid_audio_upload" });
  }
  if (parsedAudioUpload === "audio_too_large") {
    return res.status(400).json({ error: "audio_too_large" });
  }
  if (parsedAudioUpload) {
    const currentPhrase = await phraseRepo.findById(id);
    if (!currentPhrase) {
      return res.status(404).json({ error: "phrase_not_found" });
    }
    const targetLessonIds = update.lessonIds ?? currentPhrase.lessonIds;
    if (targetLessonIds.length > 0) {
      const scopedLessons = await Promise.all(
        targetLessonIds.map((lessonId) => lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language))
      );
      if (scopedLessons.some((lesson) => !lesson)) {
        return res.status(400).json({ error: "target_lesson_out_of_scope" });
      }
    }
    update.audio = await buildManualAudioMeta({
      lessonId: targetLessonIds[0] || "unassigned",
      mimeType: parsedAudioUpload.mimeType,
      buffer: parsedAudioUpload.buffer
    });
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

export async function bulkDeletePhrases(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "phrase_ids_required" });
  }
  const normalizedIds = Array.from(new Set(ids.map(String)));
  if (normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "invalid_phrase_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const deletedIds = await phraseUseCases.bulkDeleteInScope(normalizedIds, tutorLanguage as Language);
  return res.status(200).json({ deletedCount: deletedIds.length, deletedIds });
}

export async function finishPhrase(req: AuthRequest, res: Response) {
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
  const phrase = await phraseUseCases.finishInScope(id, tutorLanguage as Language);
  if (!phrase) {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  return res.status(200).json({ phrase });
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
  const primaryLessonId = phrase.lessonIds[0];
  if (!primaryLessonId) {
    return res.status(400).json({ error: "phrase_has_no_lessons" });
  }
  const lesson = await lessonRepo.findById(primaryLessonId);
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
