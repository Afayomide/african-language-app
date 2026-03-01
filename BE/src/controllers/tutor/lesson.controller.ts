import type { Response } from "express";
import mongoose from "mongoose";
import LessonModel from "../../models/Lesson.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorLessonUseCases } from "../../application/use-cases/tutor/lesson/TutorLessonUseCases.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import type { Language, Level, LessonBlock, Status } from "../../domain/entities/Lesson.js";
import {
  isValidLessonLevel,
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";
import {
  getSearchQuery,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const lessonUseCases = new TutorLessonUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseProverbRepository(),
  new MongooseQuestionRepository()
);
const proverbRepo = new MongooseProverbRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function upsertLessonProverbs(
  lessonId: string, 
  language: Language, 
  proverbs: Array<{ text: string; translation: string; contextNote: string }>
) {
  for (const item of proverbs) {
    const reusable = await proverbRepo.findReusable(language, item.text);
    if (reusable) {
      const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, lessonId]));
      await proverbRepo.updateById(reusable.id, { 
        lessonIds: mergedLessonIds,
        translation: item.translation || reusable.translation,
        contextNote: item.contextNote || reusable.contextNote
      });
      continue;
    }
    await proverbRepo.create({
      lessonIds: [lessonId],
      language,
      text: item.text,
      translation: item.translation,
      contextNote: item.contextNote,
      status: "draft"
    });
  }
}

export async function createLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { title, description, level, topics, proverbs, blocks } = req.body ?? {};
  if (!title || String(title).trim().length === 0) {
    return res.status(400).json({ error: "title_required" });
  }
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid_topics" });
  }
  if (proverbs !== undefined && !Array.isArray(proverbs)) {
    return res.status(400).json({ error: "invalid_proverbs" });
  }
  if (blocks !== undefined && !Array.isArray(blocks)) {
    return res.status(400).json({ error: "invalid_blocks" });
  }
  const normalizedTopics: string[] = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const normalizedProverbs = Array.isArray(proverbs)
    ? proverbs
        .map((item: any) => ({
          text: String(item?.text || "").trim(),
          translation: String(item?.translation || "").trim(),
          contextNote: String(item?.contextNote || "").trim(),
        }))
        .filter((p) => p.text)
    : [];

  const normalizedBlocks: LessonBlock[] = Array.isArray(blocks)
    ? blocks
        .map((b: any) => ({
          type: String(b?.type || ""),
          content: String(b?.content || ""),
          refId: b?.refId ? String(b.refId) : undefined
        }))
        .filter((b) => ["text", "phrase", "proverb", "question"].includes(b.type)) as LessonBlock[]
    : [];

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessonUseCases.create({
    title: String(title).trim(),
    language: tutorLanguage as Language,
    level: String(level) as Level,
    description: description ? String(description).trim() : "",
    topics: normalizedTopics,
    proverbs: normalizedProverbs,
    blocks: normalizedBlocks,
    createdBy: req.user.id
  });

  if (normalizedProverbs.length > 0) {
    await upsertLessonProverbs(lesson.id, lesson.language, normalizedProverbs);
  }

  return res.status(201).json({ lesson });
}

export async function listLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const status = req.query.status ? String(req.query.status) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "invalid_status" });
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
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { title: regex },
      { description: regex },
      { level: regex },
      { status: regex },
      { topics: regex },
      { proverbs: regex }
    ];
  }

  const total = await LessonModel.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / paginationInput.limit));
  const page = Math.min(paginationInput.page, totalPages);
  const skip = (page - 1) * paginationInput.limit;

  const lessons = await LessonModel.find(query)
    .sort({ orderIndex: 1, createdAt: 1 })
    .skip(skip)
    .limit(paginationInput.limit)
    .lean();

  return res.status(200).json({
    total,
    lessons,
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

export async function getLessonById(req: AuthRequest, res: Response) {
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

  const lesson = await lessonUseCases.getById(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ lesson });
}

export async function updateLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  const { title, description, level, orderIndex, topics, proverbs, blocks } = req.body ?? {};
  let normalizedProverbs: Array<{ text: string; translation: string; contextNote: string }> = [];
  let normalizedBlocks: LessonBlock[] = [];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  if (level !== undefined && !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }

  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ error: "invalid_order_index" });
    }
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid_topics" });
  }
  if (proverbs !== undefined && !Array.isArray(proverbs)) {
    return res.status(400).json({ error: "invalid_proverbs" });
  }
  if (blocks !== undefined && !Array.isArray(blocks)) {
    return res.status(400).json({ error: "invalid_blocks" });
  }
  const normalizedTopics: string[] = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (proverbs !== undefined) {
    normalizedProverbs = proverbs
      .map((item: any) => ({
        text: String(item?.text || "").trim(),
        translation: String(item?.translation || "").trim(),
        contextNote: String(item?.contextNote || "").trim(),
      }))
      .filter((p) => p.text);
  }

  if (blocks !== undefined) {
    normalizedBlocks = blocks
      .map((b: any) => ({
        type: String(b?.type || ""),
        content: String(b?.content || ""),
        refId: b?.refId ? String(b.refId) : undefined
      }))
      .filter((b) => ["text", "phrase", "proverb", "question"].includes(b.type)) as LessonBlock[];
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const update: Partial<{
    title: string;
    description: string;
    level: Level;
    orderIndex: number;
    topics: string[];
    proverbs: Array<{ text: string; translation: string; contextNote: string }>;
    blocks: LessonBlock[];
  }> = {};
  if (title !== undefined) {
    if (!String(title).trim()) {
      return res.status(400).json({ error: "title_required" });
    }
    update.title = String(title).trim();
  }
  if (description !== undefined) {
    update.description = String(description).trim();
  }
  if (level !== undefined) {
    update.level = String(level) as Level;
  }
  if (orderIndex !== undefined) {
    update.orderIndex = Number(orderIndex);
  }
  if (topics !== undefined) {
    update.topics = normalizedTopics;
  }
  if (proverbs !== undefined) {
    update.proverbs = normalizedProverbs;
  }
  if (blocks !== undefined) {
    update.blocks = normalizedBlocks;
  }

  const lesson = await lessonUseCases.update(id, tutorLanguage as Language, update);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  if (proverbs !== undefined) {
    await proverbRepo.softDeleteByLessonId(lesson.id, new Date());
    if (normalizedProverbs.length > 0) {
      await upsertLessonProverbs(lesson.id, lesson.language, normalizedProverbs);
    }
  }

  return res.status(200).json({ lesson });
}

export async function deleteLesson(req: AuthRequest, res: Response) {
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

  const lesson = await lessonUseCases.delete(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ message: "lesson_deleted" });
}

export async function bulkDeleteLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "lesson_ids_required" });
  }
  const normalizedIds = Array.from(new Set(ids.map(String)));
  if (normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const deleted = await lessonUseCases.bulkDelete(normalizedIds, tutorLanguage as Language);
  return res.status(200).json({ deletedCount: deleted.length, deletedIds: deleted.map((item) => item.id) });
}

export async function reorderLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonIds } = req.body ?? {};
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson_ids_required" });
  }

  for (const id of lessonIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const reordered = await lessonUseCases.reorder(
    tutorLanguage as Language,
    lessonIds.map(String)
  );
  if (!reordered) {
    return res.status(400).json({ error: "lesson_ids_out_of_scope" });
  }
  return res.status(200).json({ total: reordered.length, lessons: reordered });
}

export async function finishLesson(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessonUseCases.finish(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }
  return res.status(200).json({ lesson });
}
