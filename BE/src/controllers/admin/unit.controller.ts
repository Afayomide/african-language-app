import type { Request, Response } from "express";
import mongoose from "mongoose";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { AdminLessonUseCases } from "../../application/use-cases/admin/lesson/AdminLessonUseCases.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import {
  isValidLessonLanguage,
  isValidLessonLevel,
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";

const units = new MongooseUnitRepository();
const lessonRepo = new MongooseLessonRepository();
const lessonUseCases = new AdminLessonUseCases(
  lessonRepo,
  new MongoosePhraseRepository(),
  new MongooseProverbRepository(),
  new MongooseQuestionRepository()
);

export async function createUnit(req: AuthRequest, res: Response) {
  const { title, description, language, level } = req.body ?? {};
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }

  const lastOrder = await units.findLastOrderIndex(String(language) as Language);
  const unit = await units.create({
    title: String(title).trim(),
    description: String(description || "").trim(),
    language: String(language) as Language,
    level: String(level) as Level,
    orderIndex: (lastOrder ?? -1) + 1,
    status: "draft",
    createdBy: req.user.id
  });

  return res.status(201).json({ unit });
}

export async function listUnits(req: Request, res: Response) {
  const language = req.query.language ? String(req.query.language) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "Status is invalid." });
  }
  const result = await units.list({
    language: language as Language | undefined,
    status: status as "draft" | "finished" | "published" | undefined
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

export async function updateUnit(req: Request, res: Response) {
  const { id } = req.params;
  const { title, description, language, level, orderIndex } = req.body ?? {};
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
  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: "Order index is invalid." });
    payload.orderIndex = value;
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
