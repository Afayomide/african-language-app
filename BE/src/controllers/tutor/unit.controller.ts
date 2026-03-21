import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { TutorLessonUseCases } from "../../application/use-cases/tutor/lesson/TutorLessonUseCases.js";
import { isValidLessonStatus } from "../../interfaces/http/validators/lesson.validators.js";
import type { Language } from "../../domain/entities/Lesson.js";
import { UnitDeletedEntriesService } from "../../application/services/UnitDeletedEntriesService.js";

const units = new MongooseUnitRepository();
const chapters = new MongooseChapterRepository();
const lessonRepo = new MongooseLessonRepository();
const lessonContentItems = new MongooseLessonContentItemRepository();
const wordRepo = new MongooseWordRepository();
const expressionRepo = new MongooseExpressionRepository();
const sentenceRepo = new MongooseSentenceRepository();
const proverbRepo = new MongooseProverbRepository();
const questionRepo = new MongooseQuestionRepository();
const lessonUseCases = new TutorLessonUseCases(
  lessonRepo,
  lessonContentItems,
  proverbRepo,
  questionRepo,
  wordRepo,
  expressionRepo,
  sentenceRepo
);
const deletedEntries = new UnitDeletedEntriesService(
  lessonRepo,
  expressionRepo,
  proverbRepo,
  questionRepo
);
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const { title, description, level, chapterId, kind, reviewStyle, reviewSourceUnitIds } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!level || !["beginner", "intermediate", "advanced"].includes(String(level))) {
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
    if (!chapter || chapter.language !== tutorLanguage) {
      return res.status(400).json({ error: "Chapter is invalid for this language." });
    }
  }

  const lastOrder = await units.findLastOrderIndex(tutorLanguage as Language, chapterId ? String(chapterId) : null);
  const unit = await units.create({
    chapterId: chapterId ? String(chapterId) : null,
    title: String(title).trim(),
    description: String(description || "").trim(),
    language: tutorLanguage as Language,
    level: String(level) as "beginner" | "intermediate" | "advanced",
    kind: kind === "review" ? "review" : "core",
    reviewStyle: reviewStyle === "star" || reviewStyle === "gym" ? reviewStyle : "none",
    reviewSourceUnitIds: parsedReviewSourceUnitIds,
    orderIndex: (lastOrder ?? -1) + 1,
    status: "draft",
    createdBy: req.user.id
  });

  return res.status(201).json({ unit });
}

export async function listUnits(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const status = req.query.status ? String(req.query.status) : undefined;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
  const kind = req.query.kind ? String(req.query.kind) : undefined;
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
    language: tutorLanguage as Language,
    status: status as "draft" | "finished" | "published" | undefined,
    kind: kind as "core" | "review" | undefined
  });
  return res.status(200).json({ total: result.length, units: result });
}

export async function getUnitById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });
  return res.status(200).json({ unit });
}

export async function getDeletedEntries(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const result = await deletedEntries.list(unit.id);
  return res.status(200).json({
    lessons: result.lessons,
    expressions: result.expressions
  });
}

export async function updateUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const existing = await units.findById(id);
  if (!existing || existing.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const { title, description, level, orderIndex, chapterId, kind, reviewStyle, reviewSourceUnitIds } = req.body ?? {};
  const payload: Record<string, unknown> = {};
  if (title !== undefined) {
    if (!String(title).trim()) return res.status(400).json({ error: "Title is required." });
    payload.title = String(title).trim();
  }
  if (description !== undefined) payload.description = String(description).trim();
  if (level !== undefined) {
    if (!["beginner", "intermediate", "advanced"].includes(String(level))) {
      return res.status(400).json({ error: "Level is invalid." });
    }
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

  const nextChapterId = payload.chapterId === undefined ? existing.chapterId : (payload.chapterId ? String(payload.chapterId) : null);
  if (nextChapterId) {
    const chapter = await chapters.findById(nextChapterId);
    if (!chapter || chapter.language !== tutorLanguage) {
      return res.status(400).json({ error: "Chapter is invalid for this language." });
    }
  }

  const unit = await units.updateById(id, payload);
  if (!unit) return res.status(404).json({ error: "Unit not found." });
  return res.status(200).json({ unit });
}

export async function deleteUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const existing = await units.findById(id);
  if (!existing || existing.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const unitLessons = await lessonRepo.listByUnitId(existing.id);
  for (const lesson of unitLessons) {
    await lessonUseCases.delete(lesson.id, tutorLanguage as Language);
  }

  await units.softDeleteById(id);
  return res.status(200).json({ message: "Unit deleted." });
}

export async function restoreDeletedLesson(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id, lessonId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "Lesson id is invalid." });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const lesson = await deletedEntries.restoreLesson(unit.id, lessonId);
  if (!lesson) return res.status(404).json({ error: "Deleted lesson not found in this unit." });
  return res.status(200).json({ message: "Lesson restored.", lesson });
}

export async function restoreDeletedExpression(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id, expressionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!mongoose.Types.ObjectId.isValid(expressionId)) {
    return res.status(400).json({ error: "Expression id is invalid." });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const expression = await deletedEntries.restoreExpression(unit.id, expressionId);
  if (!expression) return res.status(404).json({ error: "Deleted expression not found in this unit." });
  return res.status(200).json({ message: "Expression restored.", expression });
}

export async function finishUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const existing = await units.findById(id);
  if (!existing || existing.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const unit = await units.updateById(id, { status: "finished" });
  return res.status(200).json({ unit });
}

export async function reorderUnits(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { unitIds } = req.body ?? {};
  if (!Array.isArray(unitIds) || unitIds.length === 0) {
    return res.status(400).json({ error: "Unit ids are required." });
  }
  for (const id of unitIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "Unit id is invalid." });
    }
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const scoped = await units.findByIdsAndLanguage(unitIds.map(String), tutorLanguage as Language);
  if (scoped.length !== unitIds.length) {
    return res.status(400).json({ error: "Unit ids are out of scope." });
  }

  await units.reorderByIds(unitIds.map(String));
  const reordered = await units.listByLanguage(tutorLanguage as Language);
  return res.status(200).json({ total: reordered.length, units: reordered });
}
