import type { Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import ExpressionModel from "../../models/Expression.js";
import { AudioAnalysisService } from "../../application/services/AudioAnalysisService.js";
import { generatePhraseAudio } from "../../services/tts/index.js";
import { uploadAudio } from "../../services/storage/s3.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { ExpressionImageService } from "../../application/services/ExpressionImageService.js";
import { TutorExpressionUseCases } from "../../application/use-cases/tutor/expression/TutorExpressionUseCases.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseImageAssetRepository } from "../../infrastructure/db/mongoose/repositories/MongooseImageAssetRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseExpressionImageLinkRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionImageLinkRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import { isValidExpressionDifficulty, isValidExpressionStatus } from "../../interfaces/http/validators/expression.validators.js";
import { getSearchQuery, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const expressionRepo = new MongooseExpressionRepository();
const imageAssetRepo = new MongooseImageAssetRepository();
const expressionImageLinkRepo = new MongooseExpressionImageLinkRepository();
const expressionImageService = new ExpressionImageService(expressionImageLinkRepo, imageAssetRepo);
const lessonRepo = new MongooseLessonRepository();
const lessonContentRepo = new MongooseLessonContentItemRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const expressionUseCases = new TutorExpressionUseCases(
  lessonRepo,
  expressionRepo,
  lessonContentRepo,
  new MongooseQuestionRepository()
);
const audioAnalysisService = new AudioAnalysisService();

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function hydrateExpressionPayloads<T extends { _id?: mongoose.Types.ObjectId | string; id?: string }>(expressions: T[]) {
  const ids = expressions.map((item) => String(item.id || item._id || "")).filter(Boolean);
  const contentItems = await lessonContentRepo.listByContent("expression", ids);
  const lessonIdsByExpression = new Map<string, string[]>();
  for (const item of contentItems) {
    const existing = lessonIdsByExpression.get(item.contentId) || [];
    if (!existing.includes(item.lessonId)) existing.push(item.lessonId);
    lessonIdsByExpression.set(item.contentId, existing);
  }
  return expressions.map((expression) => ({
    ...expression,
    lessonIds: lessonIdsByExpression.get(String(expression.id || expression._id || "")) || []
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

async function buildManualAudioMeta(input: { expressionId: string; mimeType: string; buffer: Buffer }) {
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
  const key = `expressions/${input.expressionId}/manual/${crypto.randomUUID()}.${format}`;
  const url = await uploadAudio(input.buffer, key, input.mimeType);
  const analysis = await audioAnalysisService.analyzeBuffer(input.buffer);

  return {
    provider: "manual_upload",
    model: "",
    voice: "",
    locale: "",
    format,
    url,
    s3Key: key,
    analysis
  };
}

function buildCreateOrUpdateInput(body: Record<string, unknown>) {
  const update: Partial<{
    lessonIds: string[];
    text: string;
    textNormalized: string;
    translations: string[];
    pronunciation: string;
    explanation: string;
    examples: Array<{ original: string; translation: string }>;
    difficulty: number;
    audio: ExpressionEntity["audio"];
    register: ExpressionEntity["register"];
    components: ExpressionEntity["components"];
    status: "draft" | "finished" | "published";
  }> = {};

  if (body.lessonIds !== undefined) {
    if (!Array.isArray(body.lessonIds)) return "invalid_lesson_ids" as const;
    update.lessonIds = Array.from(new Set(body.lessonIds.map(String).filter(Boolean)));
  }
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
  if (body.examples !== undefined) update.examples = Array.isArray(body.examples) ? body.examples as Array<{ original: string; translation: string }> : [];
  if (body.difficulty !== undefined) {
    if (!isValidExpressionDifficulty(body.difficulty)) return "invalid_difficulty" as const;
    update.difficulty = Number(body.difficulty);
  }
  if (body.register !== undefined) {
    const register = String(body.register);
    if (!["formal", "neutral", "casual"].includes(register)) return "invalid_register" as const;
    update.register = register as ExpressionEntity["register"];
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!isValidExpressionStatus(status)) return "invalid_status" as const;
    update.status = status as "draft" | "finished" | "published";
  }
  if (body.components !== undefined) update.components = Array.isArray(body.components) ? body.components as ExpressionEntity["components"] : [];

  return update;
}

function mapExpressionImageLink<T extends { expressionId: string }>(link: T) {
  const { expressionId, ...rest } = link;
  return {
    ...rest,
    expressionId: expressionId
  };
}

export async function createExpression(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const baseInput = buildCreateOrUpdateInput(req.body ?? {});
  if (baseInput === "invalid_lesson_ids") return res.status(400).json({ error: "invalid lesson id" });
  if (baseInput === "invalid_translations") return res.status(400).json({ error: "at least one translation required" });
  if (baseInput === "invalid_difficulty") return res.status(400).json({ error: "invalid difficulty" });
  if (baseInput === "invalid_register") return res.status(400).json({ error: "invalid register" });
  if (baseInput === "invalid_status") return res.status(400).json({ error: "invalid status" });
  if (!baseInput.text) return res.status(400).json({ error: "text required" });
  if (!baseInput.translations || baseInput.translations.length === 0) return res.status(400).json({ error: "at least one translation required" });

  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsedAudioUpload === "audio_too_large") return res.status(400).json({ error: "audio too large" });
  const audio = parsedAudioUpload
    ? await buildManualAudioMeta({ expressionId: "new", mimeType: parsedAudioUpload.mimeType, buffer: parsedAudioUpload.buffer })
    : undefined;

  const created = await expressionUseCases.create({
    language: tutorLanguage as Language,
    text: baseInput.text,
    textNormalized: baseInput.textNormalized || baseInput.text.toLowerCase(),
    translations: baseInput.translations,
    pronunciation: baseInput.pronunciation || "",
    explanation: baseInput.explanation || "",
    examples: baseInput.examples || [],
    difficulty: baseInput.difficulty || 1,
    aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
    audio: audio || { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
    register: baseInput.register || "neutral",
    components: baseInput.components || [],
    status: baseInput.status || "draft",
    lessonIds: baseInput.lessonIds,
    createdBy: req.user.id
  } as ExpressionEntity & { lessonIds?: string[]; createdBy: string }, tutorLanguage as Language);
  if (!created) return res.status(404).json({ error: "lesson not found or out of scope" });
  const [expression] = await hydrateExpressionPayloads([created]);
  return res.status(201).json({ expression });
}

export async function listExpressions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const lessonId = req.query.lessonId ? String(req.query.lessonId) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (status && !isValidExpressionStatus(status)) return res.status(400).json({ error: "invalid status" });
  if (lessonId && !mongoose.Types.ObjectId.isValid(lessonId)) return res.status(400).json({ error: "invalid lesson id" });

  let scopedIds: string[] | null = null;
  if (lessonId) {
    const lesson = await lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language);
    if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });
    const contentItems = await lessonContentRepo.list({ lessonId, contentType: "expression" });
    scopedIds = Array.from(new Set(contentItems.map((item) => item.contentId)));
    if (scopedIds.length === 0) {
      return res.status(200).json({
        total: 0,
        expressions: [],
        pagination: { page: 1, limit: paginationInput.limit, total: 0, totalPages: 1, hasPrevPage: false, hasNextPage: false }
      });
    }
  }

  const query: Record<string, unknown> = { isDeleted: { $ne: true }, language: tutorLanguage };
  if (status) query.status = status;
  if (scopedIds) query._id = { $in: scopedIds };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { text: regex },
      { translations: regex },
      { pronunciation: regex },
      { explanation: regex },
      { status: regex },
      { language: regex }
    ];
  }

  const total = await ExpressionModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);
  const skip = (page - 1) * paginationInput.limit;
  const expressions = await ExpressionModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(paginationInput.limit).lean();

  return res.status(200).json({
    total,
    expressions: await hydrateExpressionPayloads(expressions),
    pagination: { page, limit: paginationInput.limit, total, totalPages, hasPrevPage: page > 1, hasNextPage: page < totalPages }
  });
}

export async function getExpressionById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const expression = await expressionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!expression) return res.status(404).json({ error: "expression not found" });
  const [payload] = await hydrateExpressionPayloads([expression]);
  return res.status(200).json({ expression: payload });
}

export async function updateExpression(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });

  const baseInput = buildCreateOrUpdateInput(req.body ?? {});
  if (baseInput === "invalid_lesson_ids") return res.status(400).json({ error: "invalid lesson id" });
  if (baseInput === "invalid_translations") return res.status(400).json({ error: "at least one translation required" });
  if (baseInput === "invalid_difficulty") return res.status(400).json({ error: "invalid difficulty" });
  if (baseInput === "invalid_register") return res.status(400).json({ error: "invalid register" });
  if (baseInput === "invalid_status") return res.status(400).json({ error: "invalid status" });

  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsedAudioUpload === "audio_too_large") return res.status(400).json({ error: "audio too large" });
  if (parsedAudioUpload) {
    baseInput.audio = await buildManualAudioMeta({ expressionId: id, mimeType: parsedAudioUpload.mimeType, buffer: parsedAudioUpload.buffer });
  }

  const updated = await expressionUseCases.updateInScope(id, tutorLanguage as Language, {
    ...baseInput,
    createdBy: req.user.id
  });
  if (updated === "target_lesson_out_of_scope") return res.status(400).json({ error: "lesson not found or out of scope" });
  if (!updated) return res.status(404).json({ error: "expression not found" });
  const [expression] = await hydrateExpressionPayloads([updated]);
  return res.status(200).json({ expression });
}

export async function deleteExpression(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const deleted = await expressionUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!deleted) return res.status(404).json({ error: "expression not found" });
  return res.status(200).json({ message: "expression_deleted" });
}

export async function bulkDeleteExpressions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "expression ids required" });
  const deleted = await expressionUseCases.bulkDeleteInScope(ids.map(String), tutorLanguage as Language);
  return res.status(200).json({ deletedCount: deleted.length, deletedIds: deleted.map((item) => item.id) });
}

export async function finishExpression(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const expression = await expressionUseCases.finishInScope(id, tutorLanguage as Language);
  if (!expression) return res.status(404).json({ error: "expression not found" });
  const [payload] = await hydrateExpressionPayloads([expression]);
  return res.status(200).json({ expression: payload });
}

export async function generateExpressionAudioById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });

  const expression = await expressionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!expression) return res.status(404).json({ error: "expression not found" });
  const contentItems = await lessonContentRepo.list({ contentType: "expression", contentId: expression.id });
  const primaryLessonId = contentItems[0]?.lessonId;
  if (!primaryLessonId) return res.status(400).json({ error: "expression has no lessons" });
  const lesson = await lessonRepo.findByIdAndLanguage(primaryLessonId, tutorLanguage as Language);
  if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });

  try {
    const audio = await generatePhraseAudio({ text: expression.text, language: lesson.language as "yoruba" | "igbo" | "hausa", lessonId: lesson.id });
    const updated = await expressionRepo.updateById(expression.id, { audio });
    if (!updated) return res.status(404).json({ error: "expression not found" });
    const [payload] = await hydrateExpressionPayloads([updated]);
    return res.status(200).json({ expression: payload });
  } catch (error) {
    console.error("Tutor generateExpressionAudioById TTS error", error);
    return res.status(502).json({ error: "tts generation failed" });
  }
}

export async function generateLessonExpressionsAudio(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });
  const { lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) return res.status(400).json({ error: "invalid lesson id" });
  const lesson = await lessonRepo.findByIdAndLanguage(lessonId, tutorLanguage as Language);
  if (!lesson) return res.status(404).json({ error: "lesson not found or out of scope" });

  const contentItems = await lessonContentRepo.list({ lessonId, contentType: "expression" });
  const expressions = await expressionRepo.findByIds(Array.from(new Set(contentItems.map((item) => item.contentId))));
  const updatedIds: string[] = [];
  const failedIds: string[] = [];

  for (const expression of expressions) {
    try {
      const audio = await generatePhraseAudio({ text: expression.text, language: lesson.language as "yoruba" | "igbo" | "hausa", lessonId: lesson.id });
      const updated = await expressionRepo.updateById(expression.id, { audio });
      if (updated) updatedIds.push(expression.id);
      else failedIds.push(expression.id);
    } catch {
      failedIds.push(expression.id);
    }
  }

  return res.status(200).json({
    lessonId: lesson.id,
    total: expressions.length,
    updatedCount: updatedIds.length,
    failedCount: failedIds.length,
    updatedIds,
    failedIds
  });
}

export async function listExpressionImages(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid expression id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const expression = await expressionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!expression) {
    return res.status(404).json({ error: "expression not found" });
  }

  const images = await expressionImageService.listByExpressionId(expression.id);
  return res.status(200).json({
    expressionId: expression.id,
    images: images.map(mapExpressionImageLink)
  });
}

export async function linkExpressionImage(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  const { imageAssetId, translationIndex, isPrimary, notes } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid expression id" });
  }
  if (!mongoose.Types.ObjectId.isValid(String(imageAssetId || ""))) {
    return res.status(400).json({ error: "invalid image asset id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const expression = await expressionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!expression) {
    return res.status(404).json({ error: "expression not found" });
  }
  const image = await imageAssetRepo.findById(String(imageAssetId));
  if (!image) {
    return res.status(404).json({ error: "image not found" });
  }

  const normalizedTranslationIndex =
    translationIndex === undefined || translationIndex === null || translationIndex === ""
      ? null
      : Number(translationIndex);
  if (
    normalizedTranslationIndex !== null &&
    (!Number.isInteger(normalizedTranslationIndex) ||
      normalizedTranslationIndex < 0 ||
      normalizedTranslationIndex >= expression.translations.length)
  ) {
    return res.status(400).json({ error: "invalid translation index" });
  }

  const link = await expressionImageLinkRepo.create({
    expressionId: expression.id,
    imageAssetId: String(imageAssetId),
    translationIndex: normalizedTranslationIndex,
    isPrimary: Boolean(isPrimary),
    notes: String(notes || "").trim(),
    createdBy: req.user.id
  });

  const images = await expressionImageService.listByExpressionId(expression.id);
  return res.status(201).json({
    link: mapExpressionImageLink(link),
    images: images.map(mapExpressionImageLink)
  });
}

export async function updateExpressionImageLink(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id, linkId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid expression id" });
  }
  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return res.status(400).json({ error: "invalid expression image link id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const expression = await expressionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!expression) {
    return res.status(404).json({ error: "expression not found" });
  }
  const currentLink = await expressionImageLinkRepo.findById(linkId);
  if (!currentLink || currentLink.expressionId !== expression.id) {
    return res.status(404).json({ error: "expression image link not found" });
  }

  const { imageAssetId, translationIndex, isPrimary, notes } = req.body ?? {};
  const update: {
    imageAssetId?: string;
    translationIndex?: number | null;
    isPrimary?: boolean;
    notes?: string;
  } = {};

  if (imageAssetId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(imageAssetId || ""))) {
      return res.status(400).json({ error: "invalid image asset id" });
    }
    const image = await imageAssetRepo.findById(String(imageAssetId));
    if (!image) {
      return res.status(404).json({ error: "image not found" });
    }
    update.imageAssetId = String(imageAssetId);
  }

  if (translationIndex !== undefined) {
    const normalizedTranslationIndex =
      translationIndex === null || translationIndex === "" ? null : Number(translationIndex);
    if (
      normalizedTranslationIndex !== null &&
      (!Number.isInteger(normalizedTranslationIndex) ||
        normalizedTranslationIndex < 0 ||
        normalizedTranslationIndex >= expression.translations.length)
    ) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    update.translationIndex = normalizedTranslationIndex;
  }
  if (isPrimary !== undefined) update.isPrimary = Boolean(isPrimary);
  if (notes !== undefined) update.notes = String(notes || "").trim();

  const link = await expressionImageLinkRepo.updateById(linkId, update);
  if (!link) {
    return res.status(404).json({ error: "expression image link not found" });
  }

  const images = await expressionImageService.listByExpressionId(expression.id);
  return res.status(200).json({
    link: mapExpressionImageLink(link),
    images: images.map(mapExpressionImageLink)
  });
}

export async function deleteExpressionImageLink(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id, linkId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid expression id" });
  }
  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return res.status(400).json({ error: "invalid expression image link id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const expression = await expressionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!expression) {
    return res.status(404).json({ error: "expression not found" });
  }
  const link = await expressionImageLinkRepo.findById(linkId);
  if (!link || link.expressionId !== expression.id) {
    return res.status(404).json({ error: "expression image link not found" });
  }

  await expressionImageLinkRepo.softDeleteById(linkId, new Date());
  const images = await expressionImageService.listByExpressionId(expression.id);
  return res.status(200).json({
    message: "expression image link deleted",
    images: images.map(mapExpressionImageLink)
  });
}
