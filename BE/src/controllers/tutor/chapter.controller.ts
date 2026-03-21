import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { isValidLessonLevel, isValidLessonStatus } from "../../interfaces/http/validators/lesson.validators.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";

const chapters = new MongooseChapterRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createChapter(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const { title, description, level } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }

  const lastOrder = await chapters.findLastOrderIndex(tutorLanguage as Language);
  const chapter = await chapters.create({
    title: String(title).trim(),
    description: String(description || "").trim(),
    language: tutorLanguage as Language,
    level: String(level) as Level,
    orderIndex: (lastOrder ?? -1) + 1,
    status: "draft",
    createdBy: req.user.id
  });

  return res.status(201).json({ chapter });
}

export async function listChapters(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const status = req.query.status ? String(req.query.status) : undefined;
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "Status is invalid." });
  }

  const result = await chapters.list({
    language: tutorLanguage as Language,
    status: status as "draft" | "finished" | "published" | undefined
  });
  return res.status(200).json({ total: result.length, chapters: result });
}

export async function getChapterById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Chapter id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const chapter = await chapters.findById(id);
  if (!chapter || chapter.language !== tutorLanguage) return res.status(404).json({ error: "Chapter not found." });
  return res.status(200).json({ chapter });
}

export async function updateChapter(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Chapter id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const existing = await chapters.findById(id);
  if (!existing || existing.language !== tutorLanguage) return res.status(404).json({ error: "Chapter not found." });

  const { title, description, level, orderIndex, status } = req.body ?? {};
  const payload: Record<string, unknown> = {};
  if (title !== undefined) {
    if (!String(title).trim()) return res.status(400).json({ error: "Title is required." });
    payload.title = String(title).trim();
  }
  if (description !== undefined) payload.description = String(description).trim();
  if (level !== undefined) {
    if (!isValidLessonLevel(String(level))) return res.status(400).json({ error: "Level is invalid." });
    payload.level = String(level);
  }
  if (status !== undefined) {
    if (!isValidLessonStatus(String(status))) return res.status(400).json({ error: "Status is invalid." });
    payload.status = String(status);
  }
  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: "Order index is invalid." });
    payload.orderIndex = value;
  }

  const chapter = await chapters.updateById(id, payload);
  if (!chapter) return res.status(404).json({ error: "Chapter not found." });
  return res.status(200).json({ chapter });
}

export async function deleteChapter(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Chapter id is invalid." });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const existing = await chapters.findById(id);
  if (!existing || existing.language !== tutorLanguage) return res.status(404).json({ error: "Chapter not found." });

  await chapters.softDeleteById(id);
  return res.status(200).json({ message: "Chapter deleted." });
}

export async function reorderChapters(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });
  const { chapterIds } = req.body ?? {};
  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    return res.status(400).json({ error: "Chapter ids are required." });
  }
  for (const id of chapterIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "Chapter id is invalid." });
    }
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "Tutor language is not configured." });

  const scoped = await Promise.all(chapterIds.map((id) => chapters.findById(String(id))));
  if (scoped.some((chapter) => !chapter || chapter.language !== tutorLanguage)) {
    return res.status(400).json({ error: "Chapter ids are out of scope." });
  }

  await chapters.reorderByIds(chapterIds.map(String));
  const result = await chapters.list({ language: tutorLanguage as Language });
  return res.status(200).json({ total: result.length, chapters: result });
}
