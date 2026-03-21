import type { Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import SentenceModel from "../../models/Sentence.js";
import { AudioAnalysisService } from "../../application/services/AudioAnalysisService.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorSentenceUseCases } from "../../application/use-cases/tutor/sentence/TutorSentenceUseCases.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { generatePhraseAudio } from "../../services/tts/index.js";
import { uploadAudio } from "../../services/storage/s3.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import type { Language } from "../../domain/entities/Lesson.js";
import type { ContentComponentRef } from "../../domain/entities/Content.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { getSearchQuery, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const sentenceRepo = new MongooseSentenceRepository();
const lessonRepo = new MongooseLessonRepository();
const lessonContentRepo = new MongooseLessonContentItemRepository();
const wordRepo = new MongooseWordRepository();
const expressionRepo = new MongooseExpressionRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const sentenceUseCases = new TutorSentenceUseCases(lessonRepo, sentenceRepo, lessonContentRepo, new MongooseQuestionRepository(), wordRepo, expressionRepo);
const audioAnalysisService = new AudioAnalysisService();

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function hydrateSentencePayloads<T extends { _id?: mongoose.Types.ObjectId | string; id?: string }>(sentences: T[]) {
  const ids = sentences.map((item) => String(item.id || item._id || "")).filter(Boolean);
  const contentItems = await lessonContentRepo.listByContent("sentence", ids);
  const lessonIdsBySentence = new Map<string, string[]>();
  for (const item of contentItems) {
    const existing = lessonIdsBySentence.get(item.contentId) || [];
    if (!existing.includes(item.lessonId)) existing.push(item.lessonId);
    lessonIdsBySentence.set(item.contentId, existing);
  }
  return sentences.map((sentence) => ({
    ...sentence,
    lessonIds: lessonIdsBySentence.get(String(sentence.id || sentence._id || "")) || []
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

async function buildManualAudioMeta(input: { sentenceId: string; mimeType: string; buffer: Buffer }) {
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
  const key = `sentences/${input.sentenceId}/manual/${crypto.randomUUID()}.${format}`;
  const url = await uploadAudio(input.buffer, key, input.mimeType);
  const analysis = await audioAnalysisService.analyzeBuffer(input.buffer);
  return { provider: "manual_upload", model: "", voice: "", locale: "", format, url, s3Key: key, analysis };
}

function parseComponents(value: unknown): ContentComponentRef[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.map((item, index) => ({
    type: item?.type === "expression" ? "expression" : "word",
    refId: String(item?.refId || ""),
    orderIndex: Number.isInteger(item?.orderIndex) ? Number(item.orderIndex) : index,
    textSnapshot: item?.textSnapshot ? String(item.textSnapshot) : undefined
  }));
}

function buildCreateOrUpdateInput(body: Record<string, unknown>) {
  const update: Partial<SentenceEntity & { lessonIds: string[] }> = {};
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
  if (body.examples !== undefined) update.examples = Array.isArray(body.examples) ? body.examples as SentenceEntity['examples'] : [];
  if (body.difficulty !== undefined) {
    const difficulty = Number(body.difficulty);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return "invalid_difficulty" as const;
    update.difficulty = difficulty;
  }
  if (body.literalTranslation !== undefined) update.literalTranslation = String(body.literalTranslation).trim();
  if (body.usageNotes !== undefined) update.usageNotes = String(body.usageNotes).trim();
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!isValidStatus(status)) return "invalid_status" as const;
    update.status = status as SentenceEntity['status'];
  }
  if (body.components !== undefined) {
    const components = parseComponents(body.components);
    if (!components) return "invalid_components" as const;
    update.components = components;
  }
  return update;
}

export async function createSentence(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const baseInput = buildCreateOrUpdateInput(req.body ?? {});
  if (baseInput === "invalid_lesson_ids") return res.status(400).json({ error: "invalid lesson id" });
  if (baseInput === "invalid_translations") return res.status(400).json({ error: "at least one translation required" });
  if (baseInput === "invalid_difficulty") return res.status(400).json({ error: "invalid difficulty" });
  if (baseInput === "invalid_status") return res.status(400).json({ error: "invalid status" });
  if (baseInput === "invalid_components") return res.status(400).json({ error: "invalid components" });
  if (!baseInput.language) return res.status(400).json({ error: "language required" });
  if (!baseInput.text) return res.status(400).json({ error: "text required" });
  if (!baseInput.translations || baseInput.translations.length === 0) return res.status(400).json({ error: "at least one translation required" });
  if (!baseInput.components || baseInput.components.length === 0) return res.status(400).json({ error: "sentence components required" });

  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsedAudioUpload === "audio_too_large") return res.status(400).json({ error: "audio too large" });

  const created = await sentenceUseCases.create({
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
      ? await buildManualAudioMeta({ sentenceId: "new", mimeType: parsedAudioUpload.mimeType, buffer: parsedAudioUpload.buffer })
      : { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    literalTranslation: baseInput.literalTranslation || "",
    usageNotes: baseInput.usageNotes || "",
    components: baseInput.components,
    status: baseInput.status || "draft",
    lessonIds: baseInput.lessonIds,
    createdBy: String(req.body?.createdBy || req.user?.id || "system")
  } as SentenceEntity & { lessonIds?: string[]; createdBy: string }, tutorLanguage as Language);

  if (created === "invalid_components") return res.status(400).json({ error: "invalid sentence components" });
  if (!created) return res.status(400).json({ error: "failed to create sentence" });
  const [sentence] = await hydrateSentencePayloads([created]);
  return res.status(201).json({ sentence });
}

export async function listSentences(req: AuthRequest, res: Response) {
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
    const contentItems = await lessonContentRepo.list({ lessonId, contentType: "sentence" });
    scopedIds = Array.from(new Set(contentItems.map((item) => item.contentId)));
    if (scopedIds.length === 0) {
      return res.status(200).json({ total: 0, sentences: [], pagination: { page: 1, limit: paginationInput.limit, total: 0, totalPages: 1, hasPrevPage: false, hasNextPage: false } });
    }
  }
  const query: Record<string, unknown> = { isDeleted: { $ne: true } };
  query.language = tutorLanguage;
  if (status) query.status = status;
  if (scopedIds) query._id = { $in: scopedIds };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [{ text: regex }, { translations: regex }, { pronunciation: regex }, { explanation: regex }, { literalTranslation: regex }, { usageNotes: regex }];
  }
  const total = await SentenceModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);
  const skip = (page - 1) * paginationInput.limit;
  const sentences = await SentenceModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(paginationInput.limit).lean();
  return res.status(200).json({
    total,
    sentences: await hydrateSentencePayloads(sentences),
    pagination: { page, limit: paginationInput.limit, total, totalPages, hasPrevPage: page > 1, hasNextPage: page < totalPages }
  });
}

export async function getSentenceById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const sentence = await sentenceUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!sentence) return res.status(404).json({ error: "sentence not found" });
  const [payload] = await hydrateSentencePayloads([sentence]);
  return res.status(200).json({ sentence: payload });
}

export async function updateSentence(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const baseInput = buildCreateOrUpdateInput(req.body ?? {});
  if (baseInput === "invalid_lesson_ids") return res.status(400).json({ error: "invalid lesson id" });
  if (baseInput === "invalid_translations") return res.status(400).json({ error: "at least one translation required" });
  if (baseInput === "invalid_difficulty") return res.status(400).json({ error: "invalid difficulty" });
  if (baseInput === "invalid_status") return res.status(400).json({ error: "invalid status" });
  if (baseInput === "invalid_components") return res.status(400).json({ error: "invalid components" });
  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsedAudioUpload === "audio_too_large") return res.status(400).json({ error: "audio too large" });
  if (parsedAudioUpload) baseInput.audio = await buildManualAudioMeta({ sentenceId: id, mimeType: parsedAudioUpload.mimeType, buffer: parsedAudioUpload.buffer }) as any;
  const updated = await sentenceUseCases.updateInScope(id, tutorLanguage as Language, { ...baseInput, createdBy: String(req.body?.createdBy || req.user?.id || "system") });
  if (updated === "target_lesson_out_of_scope") return res.status(400).json({ error: "invalid lesson id" });
  if (updated === "invalid_components") return res.status(400).json({ error: "invalid sentence components" });
  if (!updated) return res.status(404).json({ error: "sentence not found" });
  const [sentence] = await hydrateSentencePayloads([updated]);
  return res.status(200).json({ sentence });
}

export async function deleteSentence(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const deleted = await sentenceUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!deleted) return res.status(404).json({ error: "sentence not found" });
  return res.status(200).json({ message: "sentence_deleted" });
}

export async function bulkDeleteSentences(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "sentence ids required" });
  const deleted = await sentenceUseCases.bulkDeleteInScope(ids.map(String), tutorLanguage as Language);
  return res.status(200).json({ deletedCount: deleted.length, deletedIds: deleted.map((item) => item.id) });
}

export async function finishSentence(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const sentence = await sentenceUseCases.finishInScope(id, tutorLanguage as Language);
  if (!sentence) return res.status(404).json({ error: "sentence not found" });
  const [payload] = await hydrateSentencePayloads([sentence]);
  return res.status(200).json({ sentence: payload });
}

export async function generateSentenceAudioById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const sentence = await sentenceUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!sentence) return res.status(404).json({ error: "sentence not found" });
  const contentItems = await lessonContentRepo.list({ contentType: "sentence", contentId: sentence.id });
  const primaryLessonId = contentItems[0]?.lessonId;
  if (!primaryLessonId) return res.status(400).json({ error: "sentence has no lessons" });
  const lesson = await lessonRepo.findByIdAndLanguage(primaryLessonId, tutorLanguage as Language);
  if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });
  try {
    const audio = await generatePhraseAudio({ text: sentence.text, language: lesson.language as Language, lessonId: lesson.id });
    const updated = await sentenceRepo.updateById(sentence.id, { audio });
    if (!updated) return res.status(404).json({ error: "sentence not found" });
    const [payload] = await hydrateSentencePayloads([updated]);
    return res.status(200).json({ sentence: payload });
  } catch (error) {
    console.error("Admin generateSentenceAudioById TTS error", error);
    return res.status(502).json({ error: "tts generation failed" });
  }
}

export async function generateLessonSentencesAudio(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) return res.status(400).json({ error: "invalid lesson id" });
  const lesson = await lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language);
  if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });
  const contentItems = await lessonContentRepo.list({ lessonId, contentType: "sentence" });
  const sentences = await sentenceRepo.findByIds(Array.from(new Set(contentItems.map((item) => item.contentId))));
  const updatedIds: string[] = [];
  const failedIds: string[] = [];
  for (const sentence of sentences) {
    try {
      const audio = await generatePhraseAudio({ text: sentence.text, language: lesson.language as Language, lessonId: lesson.id });
      const updated = await sentenceRepo.updateById(sentence.id, { audio });
      if (updated) updatedIds.push(sentence.id); else failedIds.push(sentence.id);
    } catch {
      failedIds.push(sentence.id);
    }
  }
  return res.status(200).json({ lessonId: lesson.id, total: sentences.length, updatedCount: updatedIds.length, failedCount: failedIds.length, updatedIds, failedIds });
}
