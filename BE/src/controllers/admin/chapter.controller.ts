import type { Request, Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { isValidLessonLanguage, isValidLessonLevel, isValidLessonStatus } from "../../interfaces/http/validators/lesson.validators.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";

const chapters = new MongooseChapterRepository();

export async function createChapter(req: AuthRequest, res: Response) {
  const { title, description, language, level } = req.body ?? {};
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }

  const lastOrder = await chapters.findLastOrderIndex(String(language) as Language);
  const chapter = await chapters.create({
    title: String(title).trim(),
    description: String(description || "").trim(),
    language: String(language) as Language,
    level: String(level) as Level,
    orderIndex: (lastOrder ?? -1) + 1,
    status: "draft",
    createdBy: req.user.id
  });

  return res.status(201).json({ chapter });
}

export async function listChapters(req: Request, res: Response) {
  const language = req.query.language ? String(req.query.language) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "Status is invalid." });
  }
  const result = await chapters.list({
    language: language as Language | undefined,
    status: status as "draft" | "finished" | "published" | undefined
  });
  return res.status(200).json({ total: result.length, chapters: result });
}

export async function getChapterById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Chapter id is invalid." });
  const chapter = await chapters.findById(id);
  if (!chapter) return res.status(404).json({ error: "Chapter not found." });
  return res.status(200).json({ chapter });
}

export async function updateChapter(req: Request, res: Response) {
  const { id } = req.params;
  const { title, description, language, level, orderIndex, status } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Chapter id is invalid." });

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

export async function deleteChapter(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Chapter id is invalid." });
  const chapter = await chapters.softDeleteById(id);
  if (!chapter) return res.status(404).json({ error: "Chapter not found." });
  return res.status(200).json({ message: "Chapter deleted." });
}

export async function reorderChapters(req: Request, res: Response) {
  const { chapterIds } = req.body ?? {};
  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    return res.status(400).json({ error: "Chapter ids are required." });
  }
  for (const id of chapterIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "Chapter id is invalid." });
    }
  }
  await chapters.reorderByIds(chapterIds.map(String));
  const result = await chapters.list({});
  return res.status(200).json({ total: result.length, chapters: result });
}
