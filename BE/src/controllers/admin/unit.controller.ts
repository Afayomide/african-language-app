import type { Request, Response } from "express";
import mongoose from "mongoose";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { AdminLessonUseCases } from "../../application/use-cases/admin/lesson/AdminLessonUseCases.js";
import { UnitDeletedEntriesService } from "../../application/services/UnitDeletedEntriesService.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import {
  isValidLessonLanguage,
  isValidLessonLevel,
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";

const units = new MongooseUnitRepository();
const chapters = new MongooseChapterRepository();
const lessonRepo = new MongooseLessonRepository();
const lessonContentItems = new MongooseLessonContentItemRepository();
const wordRepo = new MongooseWordRepository();
const expressionRepo = new MongooseExpressionRepository();
const sentenceRepo = new MongooseSentenceRepository();
const proverbRepo = new MongooseProverbRepository();
const questionRepo = new MongooseQuestionRepository();
const lessonUseCases = new AdminLessonUseCases(
  lessonRepo,
  lessonContentItems,
  wordRepo,
  expressionRepo,
  sentenceRepo,
  proverbRepo,
  questionRepo
);
const deletedEntries = new UnitDeletedEntriesService(
  lessonRepo,
  expressionRepo,
  proverbRepo,
  questionRepo
);

export async function createUnit(req: AuthRequest, res: Response) {
  const { title, description, language, level, chapterId, kind, reviewStyle, reviewSourceUnitIds } = req.body ?? {};
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }
  if (chapterId !== undefined && chapterId !== null && chapterId !== "" && !mongoose.Types.ObjectId.isValid(String(chapterId))) {
    return res.status(400).json({ error: "Chapter id is invalid." });
  }
  if (kind !== undefined && !["core", "review"].includes(String(kind))) {
    return res.status(400).json({ error: "Unit kind is invalid." });
  }
  if (reviewStyle !== undefined && !["none", "star", "gym"].includes(String(reviewStyle))) {
    return res.status(400).json({ error: "Review style is invalid." });
  }
  const parsedReviewSourceUnitIds = Array.isArray(reviewSourceUnitIds) ? reviewSourceUnitIds.map(String) : [];
  if (parsedReviewSourceUnitIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "Review source unit ids are invalid." });
  }
  if (chapterId) {
    const chapter = await chapters.findById(String(chapterId));
    if (!chapter || chapter.language !== String(language)) {
      return res.status(400).json({ error: "Chapter is invalid for this language." });
    }
  }

  const lastOrder = await units.findLastOrderIndex(String(language) as Language, chapterId ? String(chapterId) : null);
  const unit = await units.create({
    chapterId: chapterId ? String(chapterId) : null,
    title: String(title).trim(),
    description: String(description || "").trim(),
    language: String(language) as Language,
    level: String(level) as Level,
    kind: kind === "review" ? "review" : "core",
    reviewStyle: reviewStyle === "star" || reviewStyle === "gym" ? reviewStyle : "none",
    reviewSourceUnitIds: parsedReviewSourceUnitIds,
    orderIndex: (lastOrder ?? -1) + 1,
    status: "draft",
    createdBy: req.user.id
  });

  return res.status(201).json({ unit });
}

export async function listUnits(req: Request, res: Response) {
  const language = req.query.language ? String(req.query.language) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
  const kind = req.query.kind ? String(req.query.kind) : undefined;
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "Status is invalid." });
  }
  if (chapterId && !mongoose.Types.ObjectId.isValid(chapterId)) {
    return res.status(400).json({ error: "Chapter id is invalid." });
  }
  if (kind && !["core", "review"].includes(kind)) {
    return res.status(400).json({ error: "Unit kind is invalid." });
  }
  const result = await units.list({
    chapterId,
    language: language as Language | undefined,
    status: status as "draft" | "finished" | "published" | undefined,
    kind: kind as "core" | "review" | undefined
  });
  return res.status(200).json({ total: result.length, units: result });
}

export async function getUnitById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  const unit = await units.findById(id);
  if (!unit) return res.status(404).json({ error: "Unit not found." });
  return res.status(200).json({ unit });
}

export async function getDeletedEntries(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Unit id is invalid." });
  }

  const unit = await units.findById(id);
  if (!unit) return res.status(404).json({ error: "Unit not found." });

  const result = await deletedEntries.list(unit.id);
  return res.status(200).json({
    lessons: result.lessons,
    expressions: result.expressions
  });
}

export async function updateUnit(req: Request, res: Response) {
  const { id } = req.params;
  const { title, description, language, level, orderIndex, chapterId, kind, reviewStyle, reviewSourceUnitIds } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const payload: Record<string, unknown> = {};
  if (title !== undefined) {
    if (!String(title).trim()) return res.status(400).json({ error: "Title is required." });
    payload.title = String(title).trim();
  }
  if (description !== undefined) payload.description = String(description).trim();
  if (language !== undefined) {
    if (!isValidLessonLanguage(String(language))) return res.status(400).json({ error: "Language is invalid." });
    payload.language = String(language);
  }
  if (level !== undefined) {
    if (!isValidLessonLevel(String(level))) return res.status(400).json({ error: "Level is invalid." });
    payload.level = String(level);
  }
  if (chapterId !== undefined) {
    if (chapterId !== null && chapterId !== "" && !mongoose.Types.ObjectId.isValid(String(chapterId))) {
      return res.status(400).json({ error: "Chapter id is invalid." });
    }
    payload.chapterId = chapterId ? String(chapterId) : null;
  }
  if (kind !== undefined) {
    if (!["core", "review"].includes(String(kind))) return res.status(400).json({ error: "Unit kind is invalid." });
    payload.kind = String(kind);
  }
  if (reviewStyle !== undefined) {
    if (!["none", "star", "gym"].includes(String(reviewStyle))) {
      return res.status(400).json({ error: "Review style is invalid." });
    }
    payload.reviewStyle = String(reviewStyle);
  }
  if (reviewSourceUnitIds !== undefined) {
    if (!Array.isArray(reviewSourceUnitIds) || reviewSourceUnitIds.some((value) => !mongoose.Types.ObjectId.isValid(String(value)))) {
      return res.status(400).json({ error: "Review source unit ids are invalid." });
    }
    payload.reviewSourceUnitIds = reviewSourceUnitIds.map(String);
  }
  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: "Order index is invalid." });
    payload.orderIndex = value;
  }

  const existing = await units.findById(id);
  if (!existing) return res.status(404).json({ error: "Unit not found." });
  const nextLanguage = String(payload.language || existing.language);
  const nextChapterId = payload.chapterId === undefined ? existing.chapterId : (payload.chapterId ? String(payload.chapterId) : null);
  if (nextChapterId) {
    const chapter = await chapters.findById(nextChapterId);
    if (!chapter || chapter.language !== nextLanguage) {
      return res.status(400).json({ error: "Chapter is invalid for this language." });
    }
  }

  const unit = await units.updateById(id, payload);
  if (!unit) return res.status(404).json({ error: "Unit not found." });
  return res.status(200).json({ unit });
}

export async function deleteUnit(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  const unit = await units.findById(id);
  if (!unit) return res.status(404).json({ error: "Unit not found." });

  const unitLessons = await lessonRepo.listByUnitId(unit.id);
  for (const lesson of unitLessons) {
    await lessonUseCases.delete(lesson.id);
  }

  await units.softDeleteById(id);
  return res.status(200).json({ message: "Unit deleted." });
}

export async function restoreDeletedLesson(req: Request, res: Response) {
  const { id, lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "Lesson id is invalid." });
  }

  const unit = await units.findById(id);
  if (!unit) return res.status(404).json({ error: "Unit not found." });

  const lesson = await deletedEntries.restoreLesson(unit.id, lessonId);
  if (!lesson) return res.status(404).json({ error: "Deleted lesson not found in this unit." });
  return res.status(200).json({ message: "Lesson restored.", lesson });
}

export async function restoreDeletedExpression(req: Request, res: Response) {
  const { id, expressionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!mongoose.Types.ObjectId.isValid(expressionId)) {
    return res.status(400).json({ error: "Expression id is invalid." });
  }

  const unit = await units.findById(id);
  if (!unit) return res.status(404).json({ error: "Unit not found." });

  const expression = await deletedEntries.restoreExpression(unit.id, expressionId);
  if (!expression) return res.status(404).json({ error: "Deleted expression not found in this unit." });
  return res.status(200).json({ message: "Expression restored.", expression });
}

export async function finishUnit(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  const unit = await units.updateById(id, { status: "finished" });
  if (!unit) return res.status(404).json({ error: "Unit not found." });
  return res.status(200).json({ unit });
}

export async function publishUnit(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  const unit = await units.publishById(id, new Date());
  if (!unit) return res.status(400).json({ error: "Unit must be finished before publishing." });
  return res.status(200).json({ unit });
}

export async function reorderUnits(req: Request, res: Response) {
  const { language, unitIds } = req.body ?? {};
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (!Array.isArray(unitIds) || unitIds.length === 0) {
    return res.status(400).json({ error: "Unit ids are required." });
  }
  for (const id of unitIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "Unit id is invalid." });
    }
  }

  const scoped = await units.findByIdsAndLanguage(unitIds.map(String), String(language) as Language);
  if (scoped.length !== unitIds.length) {
    return res.status(400).json({ error: "Unit ids must match language." });
  }

  await units.reorderByIds(unitIds.map(String));
  const reordered = await units.listByLanguage(String(language) as Language);
  return res.status(200).json({ total: reordered.length, units: reordered });
}
