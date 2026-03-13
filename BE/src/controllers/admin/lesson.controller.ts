import type { Request, Response } from "express";
import mongoose from "mongoose";
import LessonModel from "../../models/Lesson.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminLessonUseCases } from "../../application/use-cases/admin/lesson/AdminLessonUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { LessonAuditService } from "../../application/services/LessonAuditService.js";
import type { Language, Level, LessonBlock, LessonStage, Status } from "../../domain/entities/Lesson.js";
import {
  isValidLessonLanguage,
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";
import { subtypeUsesMatching } from "../../interfaces/http/validators/question.validators.js";
import {
  getSearchQuery,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const questionRepo = new MongooseQuestionRepository();
const lessonUseCases = new AdminLessonUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseProverbRepository(),
  questionRepo
);

const proverbRepo = new MongooseProverbRepository();
const unitRepo = new MongooseUnitRepository();
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

function normalizeBlocks(blocks: unknown): LessonBlock[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => {
      const row = block as BlockInput;
      const type = String(row.type || "");
      const content = String(row.content || "").trim();
      const refId = row.refId ? String(row.refId).trim() : undefined;
      return {
        type,
        content,
        refId,
        translationIndex:
          Number.isInteger(Number(row.translationIndex)) && Number(row.translationIndex) >= 0
            ? Number(row.translationIndex)
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

type QueryValue = string | number | boolean | object;

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
  const { title, description, unitId, topics, proverbs, stages } = req.body ?? {};

  if (!title || String(title).trim().length === 0) {
    return res.status(400).json({ error: "title required" });
  }
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "Unit is required." });
  }
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
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

  const normalizedTopics = Array.isArray(topics)
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

  const unit = await unitRepo.findById(String(unitId));
  if (!unit) {
    return res.status(404).json({ error: "Unit not found." });
  }

  const lesson = await lessonUseCases.create({
    title: String(title).trim(),
    unitId: unit.id,
    language: unit.language,
    level: unit.level,
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

export async function listLessons(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status) : undefined;
  const language = req.query.language ? String(req.query.language) : undefined;
  const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (unitId && !mongoose.Types.ObjectId.isValid(unitId)) {
    return res.status(400).json({ error: "invalid unit id" });
  }

  const query: Record<string, QueryValue> = {
    isDeleted: { $ne: true }
  };
  if (language) query.language = language;
  if (unitId) query.unitId = unitId;
  if (status) query.status = status;
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
    .sort({ language: 1, orderIndex: 1, createdAt: 1 })
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

export async function getLessonById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const lesson = await lessonUseCases.getById(id);
  if (!lesson) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({ lesson });
}

export async function updateLesson(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { title, description, unitId, orderIndex, topics, proverbs, stages } = req.body ?? {};
  let normalizedProverbs: Array<{ text: string; translation: string; contextNote: string }> = [];
  let normalizedStages: LessonStage[] = [];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const update: Record<string, QueryValue> = {};
  if (title !== undefined) {
    if (!String(title).trim()) {
      return res.status(400).json({ error: "title required" });
    }
    update.title = String(title).trim();
  }
  if (unitId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(unitId))) {
      return res.status(400).json({ error: "invalid unit id" });
    }
    const unit = await unitRepo.findById(String(unitId));
    if (!unit) {
      return res.status(404).json({ error: "unit not found" });
    }
    update.unitId = unit.id;
    update.language = unit.language;
    update.level = unit.level;
  }
  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ error: "invalid order index" });
    }
    update.orderIndex = value;
  }
  if (description !== undefined) {
    update.description = String(description).trim();
  }
  if (topics !== undefined) {
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "invalid topics" });
    }
    const normalizedTopics: string[] = topics.map((item) => String(item || "").trim()).filter(Boolean);
    update.topics = normalizedTopics;
  }
  if (proverbs !== undefined) {
    if (!Array.isArray(proverbs)) {
      return res.status(400).json({ error: "invalid proverbs" });
    }
    normalizedProverbs = proverbs
      .map((item) => {
        const row = item as ProverbInput;
        return {
          text: String(row.text || "").trim(),
          translation: String(row.translation || "").trim(),
          contextNote: String(row.contextNote || "").trim()
        };
      })
      .filter((p) => p.text);
    update.proverbs = normalizedProverbs;
  }
  if (stages !== undefined) {
    if (!Array.isArray(stages)) {
      return res.status(400).json({ error: "invalid stages" });
    }
    normalizedStages = normalizeStages(stages);
    const stagePlacementError = await validateStageOneQuestionPlacement(normalizedStages);
    if (stagePlacementError) {
      return res.status(400).json({ error: stagePlacementError });
    }
    update.stages = normalizedStages;
  }

  const lesson = await lessonUseCases.update(id, update as Partial<{
    title: string;
    description: string;
    unitId: string;
    language: Language;
    level: Level;
    orderIndex: number;
    topics: string[];
    proverbs: Array<{ text: string; translation: string; contextNote: string }>;
    stages: LessonStage[];
  }>);
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

export async function bulkDeleteLessons(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "lesson ids required" });
  }
  const normalizedIds = Array.from(new Set(ids.map(String)));
  if (normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const deleted = await lessonUseCases.bulkDelete(normalizedIds);
  return res.status(200).json({ deletedCount: deleted.length, deletedIds: deleted.map((item) => item.id) });
}

export async function deleteLesson(req: Request, res: Response) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const lesson = await lessonUseCases.delete(id);
  if (!lesson) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({ message: "lesson deleted" });
}

export async function publishLesson(req: Request, res: Response) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const current = await lessonUseCases.getById(id);
  if (!current) {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (current.status !== "finished") {
    return res.status(400).json({ error: "lesson not finished" });
  }
  const audit = await lessonAuditService.auditLesson(id);
  if (!audit) {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (!audit.ok) {
    return res.status(409).json({
      error: "lesson quality audit failed",
      audit
    });
  }

  const result = await lessonUseCases.publish(id);
  if (!result) {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (result === "proverbs_not_published") {
    return res.status(400).json({ error: "proverbs not published" });
  }
  if (result === "phrases_not_published") {
    return res.status(400).json({ error: "phrases not published" });
  }
  if (result === "questions_not_published") {
    return res.status(400).json({ error: "questions not published" });
  }

  return res.status(200).json({ lesson: result });
}

export async function auditLesson(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const audit = await lessonAuditService.auditLesson(id);
  if (!audit) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({ audit });
}

export async function reorderLessons(req: Request, res: Response) {
  const { unitId, lessonIds } = req.body ?? {};

  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "invalid unit id" });
  }
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson ids required" });
  }

  for (const id of lessonIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "invalid lesson id" });
    }
  }

  const reordered = await lessonUseCases.reorder(
    String(unitId),
    lessonIds.map(String)
  );
  if (!reordered) {
    return res.status(400).json({ error: "lesson ids must match unit" });
  }

  return res.status(200).json({ total: reordered.length, lessons: reordered });
}
