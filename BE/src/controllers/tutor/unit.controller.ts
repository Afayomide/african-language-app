import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { TutorLessonUseCases } from "../../application/use-cases/tutor/lesson/TutorLessonUseCases.js";
import { isValidLessonStatus } from "../../interfaces/http/validators/lesson.validators.js";
import type { Language } from "../../domain/entities/Lesson.js";

const units = new MongooseUnitRepository();
const lessonRepo = new MongooseLessonRepository();
const lessonUseCases = new TutorLessonUseCases(
  lessonRepo,
  new MongoosePhraseRepository(),
  new MongooseProverbRepository(),
  new MongooseQuestionRepository()
);
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const { title, description, level } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!level || !["beginner", "intermediate", "advanced"].includes(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }

  const lastOrder = await units.findLastOrderIndex(tutorLanguage as Language);
  const unit = await units.create({
    title: String(title).trim(),
    description: String(description || "").trim(),
    language: tutorLanguage as Language,
    level: String(level) as "beginner" | "intermediate" | "advanced",
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
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "Status is invalid." });
  }

  const result = await units.list({
    language: tutorLanguage as Language,
    status: status as "draft" | "finished" | "published" | undefined
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

export async function updateUnit(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Unit id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const existing = await units.findById(id);
  if (!existing || existing.language !== tutorLanguage) return res.status(404).json({ error: "Unit not found." });

  const { title, description, level, orderIndex } = req.body ?? {};
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
  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: "Order index is invalid." });
    payload.orderIndex = value;
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
