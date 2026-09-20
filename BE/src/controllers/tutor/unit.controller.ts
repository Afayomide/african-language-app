import type { Response } from "express";
import { isValidId } from "../../utils/ids.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { DrizzleTutorProfileRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleTutorProfileRepository.js";
import { DrizzleUnitRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleUnitRepository.js";
import { DrizzleChapterRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleChapterRepository.js";
import { DrizzleLessonRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { DrizzleLessonContentItemRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLessonContentItemRepository.js";
import { DrizzleProverbRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleProverbRepository.js";
import { DrizzleQuestionRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleQuestionRepository.js";
import { DrizzleWordRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleWordRepository.js";
import { DrizzleExpressionRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleExpressionRepository.js";
import { DrizzleSentenceRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { DrizzleUnitContentItemRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleUnitContentItemRepository.js";
import { TutorLessonUseCases } from "../../application/use-cases/tutor/lesson/TutorLessonUseCases.js";
import { ContentCurriculumService } from "../../application/services/ContentCurriculumService.js";
import { isValidLessonStatus } from "../../interfaces/http/validators/lesson.validators.js";
import type { Language } from "../../domain/entities/Lesson.js";
import { UnitDeletedEntriesService } from "../../application/services/UnitDeletedEntriesService.js";

const units = new DrizzleUnitRepository();
const chapters = new DrizzleChapterRepository();
const lessonRepo = new DrizzleLessonRepository();
const lessonContentItems = new DrizzleLessonContentItemRepository();
const wordRepo = new DrizzleWordRepository();
const expressionRepo = new DrizzleExpressionRepository();
const sentenceRepo = new DrizzleSentenceRepository();
const proverbRepo = new DrizzleProverbRepository();
const questionRepo = new DrizzleQuestionRepository();
const contentCurriculum = new ContentCurriculumService(
  lessonRepo,
  units,
  lessonContentItems,
  new DrizzleUnitContentItemRepository(),
  chapters
);
const lessonUseCases = new TutorLessonUseCases(
  lessonRepo,
  lessonContentItems,
  proverbRepo,
  questionRepo,
  wordRepo,
  expressionRepo,
  sentenceRepo,
  contentCurriculum
);
const deletedEntries = new UnitDeletedEntriesService(
  lessonRepo,
  wordRepo,
  expressionRepo,
  sentenceRepo,
  proverbRepo,
  questionRepo
);
const tutorScope = new TutorScopeService(new DrizzleTutorProfileRepository());

export async function createUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const { title, description, level, chapterId, kind, reviewStyle, reviewSourceUnitIds } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!level || !["beginner", "intermediate", "advanced"].includes(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }
  if (chapterId !== undefined && chapterId !== null && chapterId !== "" && !isValidId(String(chapterId))) {
    return res.status(400).json({ error: "Chapter id is invalid." });
  }
  if (kind !== undefined && !["core", "review"].includes(String(kind))) {
    return res.status(400).json({ error: "Unit kind is invalid." });
  }
  if (reviewStyle !== undefined && !["none", "star", "gym"].includes(String(reviewStyle))) {
    return res.status(400).json({ error: "Review style is invalid." });
  }
  const parsedReviewSourceUnitIds = Array.isArray(reviewSourceUnitIds) ? reviewSourceUnitIds.map(String) : [];
  if (parsedReviewSourceUnitIds.some((id) => !isValidId(id))) {
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
  if (chapterId && !isValidId(chapterId)) {
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
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });
  return res.status(200).json({ unit });
}

export async function getDeletedEntries(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const result = await deletedEntries.list(unit.id);
  return res.status(200).json({
    lessons: result.lessons,
    words: result.words,
    expressions: result.expressions,
    sentences: result.sentences,
    proverbs: result.proverbs
  });
}

export async function updateUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });

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
    if (chapterId !== null && chapterId !== "" && !isValidId(String(chapterId))) {
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
    if (!Array.isArray(reviewSourceUnitIds) || reviewSourceUnitIds.some((value) => !isValidId(String(value)))) {
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
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });

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
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!isValidId(lessonId)) {
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
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!isValidId(expressionId)) {
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

export async function restoreDeletedWord(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id, wordId } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!isValidId(wordId)) {
    return res.status(400).json({ error: "Word id is invalid." });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const word = await deletedEntries.restoreWord(unit.id, wordId);
  if (!word) return res.status(404).json({ error: "Deleted word not found in this unit." });
  return res.status(200).json({ message: "Word restored.", word });
}

export async function restoreDeletedSentence(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id, sentenceId } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!isValidId(sentenceId)) {
    return res.status(400).json({ error: "Sentence id is invalid." });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const sentence = await deletedEntries.restoreSentence(unit.id, sentenceId);
  if (!sentence) return res.status(404).json({ error: "Deleted sentence not found in this unit." });
  return res.status(200).json({ message: "Sentence restored.", sentence });
}

export async function restoreDeletedProverb(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id, proverbId } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });
  if (!isValidId(proverbId)) {
    return res.status(400).json({ error: "Proverb id is invalid." });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const unit = await units.findById(id);
  if (!unit || unit.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const proverb = await deletedEntries.restoreProverb(unit.id, proverbId);
  if (!proverb) return res.status(404).json({ error: "Deleted proverb not found in this unit." });
  return res.status(200).json({ message: "Proverb restored.", proverb });
}

export async function finishUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Unit id is invalid." });

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
    if (!isValidId(String(id))) {
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
