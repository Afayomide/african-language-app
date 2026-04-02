import type { Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import WordModel from "../../models/Word.js";
import { AudioAnalysisService } from "../../application/services/AudioAnalysisService.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorWordUseCases } from "../../application/use-cases/tutor/word/TutorWordUseCases.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { generatePhraseAudio } from "../../services/tts/index.js";
import { uploadAudio } from "../../services/storage/s3.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import type { Language } from "../../domain/entities/Lesson.js";
import type { WordEntity } from "../../domain/entities/Word.js";

import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { getSearchQuery, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const wordRepo = new MongooseWordRepository();
const lessonRepo = new MongooseLessonRepository();
const lessonContentRepo = new MongooseLessonContentItemRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const wordUseCases = new TutorWordUseCases(lessonRepo, wordRepo, lessonContentRepo, new MongooseQuestionRepository());
const audioAnalysisService = new AudioAnalysisService();

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function hydrateWordPayloads<T extends { _id?: mongoose.Types.ObjectId | string; id?: string }>(words: T[]) {
  const ids = words.map((item) => String(item.id || item._id || "")).filter(Boolean);
  const contentItems = await lessonContentRepo.listByContent("word", ids);
  const lessonIdsByWord = new Map<string, string[]>();
  for (const item of contentItems) {
    const existing = lessonIdsByWord.get(item.contentId) || [];
    if (!existing.includes(item.lessonId)) existing.push(item.lessonId);
    lessonIdsByWord.set(item.contentId, existing);
  }
  return words.map((word) => ({
    ...word,
    lessonIds: lessonIdsByWord.get(String(word.id || word._id || "")) || []
  }));
}

function isValidStatus(status: string) {
  return status === "draft" || status === "finished" || status === "published";
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

async function buildManualAudioMeta(input: { wordId: string; mimeType: string; buffer: Buffer }) {
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
  const key = `words/${input.wordId}/manual/${crypto.randomUUID()}.${format}`;
  const url = await uploadAudio(input.buffer, key, input.mimeType);
  const analysis = await audioAnalysisService.analyzeBuffer(input.buffer);
  return { provider: "manual_upload", model: "", voice: "", locale: "", format, url, s3Key: key, analysis };
}

function buildCreateOrUpdateInput(body: Record<string, unknown>) {
  const update: Partial<WordEntity & { lessonIds: string[] }> = {};
  if (body.lessonIds !== undefined) {
    if (!Array.isArray(body.lessonIds)) return "invalid_lesson_ids" as const;
    update.lessonIds = Array.from(new Set(body.lessonIds.map(String).filter(Boolean)));
  }
  if (body.language !== undefined) update.language = String(body.language) as Language;
  if (body.text !== undefined) {
    update.text = String(body.text).trim();
    update.textNormalized = update.text.toLowerCase();
  }
  if (body.translations !== undefined) {
    const normalizedTranslations = Array.isArray(body.translations)
      ? Array.from(new Set(body.translations.map((item) => String(item || "").trim()).filter(Boolean)))
      : [];
    if (normalizedTranslations.length === 0) return "invalid_translations" as const;
    update.translations = normalizedTranslations;
  }
  if (body.pronunciation !== undefined) update.pronunciation = String(body.pronunciation).trim();
  if (body.explanation !== undefined) update.explanation = String(body.explanation).trim();
  if (body.examples !== undefined) update.examples = Array.isArray(body.examples) ? body.examples as WordEntity['examples'] : [];
  if (body.difficulty !== undefined) {
    const difficulty = Number(body.difficulty);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return "invalid_difficulty" as const;
    update.difficulty = difficulty;
  }
  if (body.lemma !== undefined) update.lemma = String(body.lemma).trim();
  if (body.partOfSpeech !== undefined) update.partOfSpeech = String(body.partOfSpeech).trim();
  if (body.image !== undefined) {
    if (!body.image || typeof body.image !== "object") return "invalid_image" as const;
    const image = body.image as {
      imageAssetId?: unknown;
      url?: unknown;
      thumbnailUrl?: unknown;
      altText?: unknown;
    };
    const url = String(image.url || "").trim();
    const thumbnailUrl = String(image.thumbnailUrl || "").trim();
    const altText = String(image.altText || "").trim();
    const imageAssetId = String(image.imageAssetId || "").trim();
    update.image = url || thumbnailUrl || altText || imageAssetId
      ? { imageAssetId: imageAssetId || undefined, url, thumbnailUrl, altText }
      : null;
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!isValidStatus(status)) return "invalid_status" as const;
    update.status = status as WordEntity['status'];
  }
  return update;
}

export async function createWord(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const baseInput = buildCreateOrUpdateInput(req.body ?? {});
  if (baseInput === "invalid_lesson_ids") return res.status(400).json({ error: "invalid lesson id" });
  if (baseInput === "invalid_translations") return res.status(400).json({ error: "at least one translation required" });
  if (baseInput === "invalid_difficulty") return res.status(400).json({ error: "invalid difficulty" });
  if (baseInput === "invalid_image") return res.status(400).json({ error: "invalid image" });
  if (baseInput === "invalid_status") return res.status(400).json({ error: "invalid status" });
  if (!baseInput.language) return res.status(400).json({ error: "language required" });
  if (!baseInput.text) return res.status(400).json({ error: "text required" });
  if (!baseInput.translations || baseInput.translations.length === 0) return res.status(400).json({ error: "at least one translation required" });

  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsedAudioUpload === "audio_too_large") return res.status(400).json({ error: "audio too large" });

  const created = await wordUseCases.create({
    language: baseInput.language,
    text: baseInput.text,
    textNormalized: baseInput.textNormalized || baseInput.text.toLowerCase(),
    translations: baseInput.translations,
    pronunciation: baseInput.pronunciation || "",
    explanation: baseInput.explanation || "",
    examples: baseInput.examples || [],
    difficulty: baseInput.difficulty || 1,
    aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
    audio: parsedAudioUpload
      ? await buildManualAudioMeta({ wordId: "new", mimeType: parsedAudioUpload.mimeType, buffer: parsedAudioUpload.buffer })
      : { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    lemma: baseInput.lemma || "",
    partOfSpeech: baseInput.partOfSpeech || "",
    image: baseInput.image || null,
    status: baseInput.status || "draft",
    lessonIds: baseInput.lessonIds,
    createdBy: String(req.body?.createdBy || req.user?.id || "system")
  } as WordEntity & { lessonIds?: string[]; createdBy: string }, tutorLanguage as Language);

  if (!created) return res.status(400).json({ error: "failed to create word" });
  const [word] = await hydrateWordPayloads([created]);
  return res.status(201).json({ word });
}

export async function listWords(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const status = req.query.status ? String(req.query.status) : undefined;
  const lessonId = req.query.lessonId ? String(req.query.lessonId) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (status && !isValidStatus(status)) return res.status(400).json({ error: "invalid status" });
  if (lessonId && !mongoose.Types.ObjectId.isValid(lessonId)) return res.status(400).json({ error: "invalid lesson id" });

  let scopedIds: string[] | null = null;
  if (lessonId) {
    const contentItems = await lessonContentRepo.list({ lessonId, contentType: "word" });
    scopedIds = Array.from(new Set(contentItems.map((item) => item.contentId)));
    if (scopedIds.length === 0) {
      return res.status(200).json({ total: 0, words: [], pagination: { page: 1, limit: paginationInput.limit, total: 0, totalPages: 1, hasPrevPage: false, hasNextPage: false } });
    }
  }

  const query: Record<string, unknown> = { isDeleted: { $ne: true } };
  query.language = tutorLanguage;
  if (status) query.status = status;
  if (scopedIds) query._id = { $in: scopedIds };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [{ text: regex }, { translations: regex }, { pronunciation: regex }, { explanation: regex }, { lemma: regex }, { partOfSpeech: regex }];
  }

  const total = await WordModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);
  const skip = (page - 1) * paginationInput.limit;
  const words = await WordModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(paginationInput.limit).lean();
  return res.status(200).json({
    total,
    words: await hydrateWordPayloads(words),
    pagination: { page, limit: paginationInput.limit, total, totalPages, hasPrevPage: page > 1, hasNextPage: page < totalPages }
  });
}

export async function getWordById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const word = await wordUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!word) return res.status(404).json({ error: "word not found" });
  const [payload] = await hydrateWordPayloads([word]);
  return res.status(200).json({ word: payload });
}

export async function updateWord(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const baseInput = buildCreateOrUpdateInput(req.body ?? {});
  if (baseInput === "invalid_lesson_ids") return res.status(400).json({ error: "invalid lesson id" });
  if (baseInput === "invalid_translations") return res.status(400).json({ error: "at least one translation required" });
  if (baseInput === "invalid_difficulty") return res.status(400).json({ error: "invalid difficulty" });
  if (baseInput === "invalid_image") return res.status(400).json({ error: "invalid image" });
  if (baseInput === "invalid_status") return res.status(400).json({ error: "invalid status" });
  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsedAudioUpload === "audio_too_large") return res.status(400).json({ error: "audio too large" });
  if (parsedAudioUpload) {
    baseInput.audio = await buildManualAudioMeta({ wordId: id, mimeType: parsedAudioUpload.mimeType, buffer: parsedAudioUpload.buffer }) as any;
  }
  const updated = await wordUseCases.updateInScope(id, tutorLanguage as Language, { ...baseInput, createdBy: String(req.body?.createdBy || req.user?.id || "system") });
  if (updated === "target_lesson_out_of_scope") return res.status(400).json({ error: "invalid lesson id" });
  if (!updated) return res.status(404).json({ error: "word not found" });
  const [word] = await hydrateWordPayloads([updated]);
  return res.status(200).json({ word });
}

export async function deleteWord(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const deleted = await wordUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!deleted) return res.status(404).json({ error: "word not found" });
  return res.status(200).json({ message: "word_deleted" });
}

export async function bulkDeleteWords(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "word ids required" });
  const deleted = await wordUseCases.bulkDeleteInScope(ids.map(String), tutorLanguage as Language);
  return res.status(200).json({ deletedCount: deleted.length, deletedIds: deleted.map((item) => item.id) });
}

export async function finishWord(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const word = await wordUseCases.finishInScope(id, tutorLanguage as Language);
  if (!word) return res.status(404).json({ error: "word not found" });
  const [payload] = await hydrateWordPayloads([word]);
  return res.status(200).json({ word: payload });
}

export async function generateWordAudioById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const word = await wordUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!word) return res.status(404).json({ error: "word not found" });
  const contentItems = await lessonContentRepo.list({ contentType: "word", contentId: word.id });
  const primaryLessonId = contentItems[0]?.lessonId;
  if (!primaryLessonId) return res.status(400).json({ error: "word has no lessons" });
  const lesson = await lessonRepo.findByIdAndLanguage(primaryLessonId, tutorLanguage as Language);
  if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });
  try {
    const audio = await generatePhraseAudio({ text: word.text, language: lesson.language as Language, lessonId: lesson.id });
    const updated = await wordRepo.updateById(word.id, { audio });
    if (!updated) return res.status(404).json({ error: "word not found" });
    const [payload] = await hydrateWordPayloads([updated]);
    return res.status(200).json({ word: payload });
  } catch (error) {
    console.error("Admin generateWordAudioById TTS error", error);
    return res.status(502).json({ error: "tts generation failed" });
  }
}

export async function generateLessonWordsAudio(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) return res.status(400).json({ error: "invalid lesson id" });
  const lesson = await lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language);
  if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });
  const contentItems = await lessonContentRepo.list({ lessonId, contentType: "word" });
  const words = await wordRepo.findByIds(Array.from(new Set(contentItems.map((item) => item.contentId))));
  const updatedIds: string[] = [];
  const failedIds: string[] = [];
  for (const word of words) {
    try {
      const audio = await generatePhraseAudio({ text: word.text, language: lesson.language as Language, lessonId: lesson.id });
      const updated = await wordRepo.updateById(word.id, { audio });
      if (updated) updatedIds.push(word.id); else failedIds.push(word.id);
    } catch {
      failedIds.push(word.id);
    }
  }
  return res.status(200).json({ lessonId: lesson.id, total: words.length, updatedCount: updatedIds.length, failedCount: failedIds.length, updatedIds, failedIds });
}
