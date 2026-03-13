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
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { LessonAuditService } from "../../application/services/LessonAuditService.js";
import type { Language, Level, LessonBlock, LessonStage, Status } from "../../domain/entities/Lesson.js";
import {
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";
import { subtypeUsesMatching } from "../../interfaces/http/validators/question.validators.js";
import {
  getSearchQuery,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const questionRepo = new MongooseQuestionRepository();
const lessonUseCases = new TutorLessonUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseProverbRepository(),
  questionRepo
);
const proverbRepo = new MongooseProverbRepository();
const unitRepo = new MongooseUnitRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const lessonAuditService = new LessonAuditService(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  proverbRepo,
  questionRepo
);

type ProverbInput = {
  text?: string;
  translation?: string;
  contextNote?: string;
};

type BlockInput = {
  type?: string;
  content?: string;
  refId?: string;
  translationIndex?: number;
};

type StageInput = {
  id?: string;
  title?: string;
  description?: string;
  orderIndex?: number;
  blocks?: BlockInput[];
};

type QueryValue = string | number | boolean | object;

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBlocks(blocks: unknown): LessonBlock[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block: BlockInput) => {
      const type = String(block.type || "");
      const content = String(block.content || "").trim();
      const refId = block.refId ? String(block.refId).trim() : undefined;
      return {
        type,
        content,
        refId,
        translationIndex:
          Number.isInteger(Number(block.translationIndex)) && Number(block.translationIndex) >= 0
            ? Number(block.translationIndex)
            : 0
      };
    })
    .filter((block) => {
      if (!["text", "phrase", "proverb", "question"].includes(block.type)) {
        return false;
      }
      if (block.type === "text") {
        return block.content.length > 0;
      }
      const refId = block.refId;
      return typeof refId === "string" && mongoose.Types.ObjectId.isValid(refId);
    }) as LessonBlock[];
}

function normalizeStages(stages: unknown): LessonStage[] {
  if (!Array.isArray(stages)) return [];
  return stages
    .map((stage, index) => {
      const row = stage as StageInput;
      return {
        id: String(row.id || `stage-${index + 1}`),
        title: String(row.title || "").trim(),
        description: String(row.description || "").trim(),
        orderIndex:
          Number.isInteger(Number(row.orderIndex)) && Number(row.orderIndex) >= 0
            ? Number(row.orderIndex)
            : index,
        blocks: normalizeBlocks(row.blocks)
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

async function validateStageOneQuestionPlacement(stages: LessonStage[]) {
  const firstStage = stages
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)[0];
  if (!firstStage) return null;

  const questionIds = firstStage.blocks
    .filter((block) => block.type === "question")
    .map((block) => block.refId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const questionId of questionIds) {
    const question = await questionRepo.findById(questionId);
    if (question && subtypeUsesMatching(question.subtype)) {
      return "Matching questions can only appear after Stage 1.";
    }
  }

  return null;
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

  const { title, description, unitId, topics, proverbs, stages } = req.body ?? {};
  if (!title || String(title).trim().length === 0) {
    return res.status(400).json({ error: "title required" });
  }
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "unit id required" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid topics" });
  }
  if (proverbs !== undefined && !Array.isArray(proverbs)) {
    return res.status(400).json({ error: "invalid proverbs" });
  }
  if (stages !== undefined && !Array.isArray(stages)) {
    return res.status(400).json({ error: "invalid stages" });
  }
  const normalizedTopics: string[] = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const normalizedProverbs = Array.isArray(proverbs)
    ? proverbs
        .map((item) => {
          const row = item as ProverbInput;
          return {
            text: String(row.text || "").trim(),
            translation: String(row.translation || "").trim(),
            contextNote: String(row.contextNote || "").trim()
          };
        })
        .filter((p) => p.text)
    : [];

  const normalizedStages = normalizeStages(stages);
  const stagePlacementError = await validateStageOneQuestionPlacement(normalizedStages);
  if (stagePlacementError) {
    return res.status(400).json({ error: stagePlacementError });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const unit = await unitRepo.findById(String(unitId));
  if (!unit || unit.language !== tutorLanguage) {
    return res.status(404).json({ error: "unit not found" });
  }

  const lesson = await lessonUseCases.create({
    title: String(title).trim(),
    unitId: unit.id,
    language: tutorLanguage as Language,
    level: unit.level as Level,
    description: description ? String(description).trim() : "",
    topics: normalizedTopics,
    proverbs: normalizedProverbs,
    stages: normalizedStages,
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
  const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  if (unitId && !mongoose.Types.ObjectId.isValid(unitId)) {
    return res.status(400).json({ error: "invalid unit id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const query: Record<string, QueryValue> = {
    isDeleted: { $ne: true },
    language: tutorLanguage
  };
  if (status) query.status = status;
  if (unitId) query.unitId = unitId;
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { title: regex },
      { description: regex },
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
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const lesson = await lessonUseCases.getById(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({ lesson });
}

export async function updateLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  const { title, description, unitId, orderIndex, topics, proverbs, stages } = req.body ?? {};
  let normalizedProverbs: Array<{ text: string; translation: string; contextNote: string }> = [];
  let normalizedStages: LessonStage[] = [];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ error: "invalid order index" });
    }
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid topics" });
  }
  if (proverbs !== undefined && !Array.isArray(proverbs)) {
    return res.status(400).json({ error: "invalid proverbs" });
  }
  if (stages !== undefined && !Array.isArray(stages)) {
    return res.status(400).json({ error: "invalid stages" });
  }
  const normalizedTopics: string[] = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (proverbs !== undefined) {
    normalizedProverbs = proverbs
      .map((item: ProverbInput) => {
        const row = item;
        return {
          text: String(row.text || "").trim(),
          translation: String(row.translation || "").trim(),
          contextNote: String(row.contextNote || "").trim()
        };
      })
      .filter((p: { text: string }) => p.text);
  }

  if (stages !== undefined) {
    normalizedStages = normalizeStages(stages);
    const stagePlacementError = await validateStageOneQuestionPlacement(normalizedStages);
    if (stagePlacementError) {
      return res.status(400).json({ error: stagePlacementError });
    }
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const update: Partial<{
    title: string;
    description: string;
    unitId: string;
    language: Language;
    level: Level;
    orderIndex: number;
    topics: string[];
    proverbs: Array<{ text: string; translation: string; contextNote: string }>;
    stages: LessonStage[];
  }> = {};
  if (title !== undefined) {
    if (!String(title).trim()) {
      return res.status(400).json({ error: "title required" });
    }
    update.title = String(title).trim();
  }
  if (description !== undefined) {
    update.description = String(description).trim();
  }
  if (unitId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(unitId))) {
      return res.status(400).json({ error: "invalid unit id" });
    }
    const unit = await unitRepo.findById(String(unitId));
    if (!unit || unit.language !== tutorLanguage) {
      return res.status(404).json({ error: "unit not found" });
    }
    update.unitId = unit.id;
    update.language = unit.language;
    update.level = unit.level as Level;
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
  if (stages !== undefined) {
    update.stages = normalizedStages;
  }

  const lesson = await lessonUseCases.update(id, tutorLanguage as Language, update);
  if (!lesson) {
    return res.status(404).json({ error: "lesson not found" });
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
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const lesson = await lessonUseCases.delete(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({ message: "lesson_deleted" });
}

export async function bulkDeleteLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "lesson ids required" });
  }
  const normalizedIds = Array.from(new Set(ids.map(String)));
  if (normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const deleted = await lessonUseCases.bulkDelete(normalizedIds, tutorLanguage as Language);
  return res.status(200).json({ deletedCount: deleted.length, deletedIds: deleted.map((item) => item.id) });
}

export async function reorderLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { unitId, lessonIds } = req.body ?? {};
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "unit id required" });
  }
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson ids required" });
  }

  for (const id of lessonIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "invalid lesson id" });
    }
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const unit = await unitRepo.findById(String(unitId));
  if (!unit || unit.language !== tutorLanguage) {
    return res.status(404).json({ error: "unit not found" });
  }

  const reordered = await lessonUseCases.reorder(
    unit.id,
    lessonIds.map(String)
  );
  if (!reordered) {
    return res.status(400).json({ error: "lesson ids out of scope" });
  }
  return res.status(200).json({ total: reordered.length, lessons: reordered });
}

export async function finishLesson(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const lesson = await lessonUseCases.finish(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson not found" });
  }
  return res.status(200).json({ lesson });
}

export async function auditLesson(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const audit = await lessonAuditService.auditLesson(id, tutorLanguage as Language);
  if (!audit) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({ audit });
}
