import type { Request, Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminLessonUseCases } from "../../application/use-cases/admin/lesson/AdminLessonUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import type { Language, Level, Status } from "../../domain/entities/Lesson.js";
import {
  isValidLessonLanguage,
  isValidLessonLevel,
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";

const lessonUseCases = new AdminLessonUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseQuestionRepository()
);

export async function createLesson(req: AuthRequest, res: Response) {
  const { title, description, language, level, topics } = req.body ?? {};

  if (!title || String(title).trim().length === 0) {
    return res.status(400).json({ error: "title_required" });
  }
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid_topics" });
  }

  const normalizedTopics = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const lesson = await lessonUseCases.create({
    title: String(title).trim(),
    language: String(language) as Language,
    level: String(level) as Level,
    description: description ? String(description).trim() : "",
    topics: normalizedTopics,
    createdBy: req.user.id
  });

  return res.status(201).json({ lesson });
}

export async function listLessons(req: Request, res: Response) {
  const status = req.query.status ? String(req.query.status) : undefined;
  const language = req.query.language ? String(req.query.language) : undefined;
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "invalid_language" });
  }

  const lessons = await lessonUseCases.list({
    language: (language as Language | undefined) || undefined,
    status: (status as Status | undefined) || undefined
  });
  return res.status(200).json({ total: lessons.length, lessons });
}

export async function getLessonById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const lesson = await lessonUseCases.getById(id);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ lesson });
}

export async function updateLesson(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { title, description, language, level, orderIndex, topics } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const update: Record<string, unknown> = {};
  if (title !== undefined) {
    if (!String(title).trim()) {
      return res.status(400).json({ error: "title_required" });
    }
    update.title = String(title).trim();
  }
  if (language !== undefined) {
    if (!isValidLessonLanguage(String(language))) {
      return res.status(400).json({ error: "invalid_language" });
    }
    update.language = String(language);
  }
  if (level !== undefined) {
    if (!isValidLessonLevel(String(level))) {
      return res.status(400).json({ error: "invalid_level" });
    }
    update.level = String(level);
  }
  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ error: "invalid_order_index" });
    }
    update.orderIndex = value;
  }
  if (description !== undefined) {
    update.description = String(description).trim();
  }
  if (topics !== undefined) {
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "invalid_topics" });
    }
    const normalizedTopics: string[] = topics.map((item) => String(item || "").trim()).filter(Boolean);
    update.topics = normalizedTopics;
  }

  const lesson = await lessonUseCases.update(id, update as Partial<{
    title: string;
    description: string;
    language: Language;
    level: Level;
    orderIndex: number;
    topics: string[];
  }>);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ lesson });
}

export async function deleteLesson(req: Request, res: Response) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const lesson = await lessonUseCases.delete(id);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ message: "lesson_deleted" });
}

export async function publishLesson(req: Request, res: Response) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const lesson = await lessonUseCases.publish(id);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ lesson });
}

export async function reorderLessons(req: Request, res: Response) {
  const { language, lessonIds } = req.body ?? {};

  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson_ids_required" });
  }

  for (const id of lessonIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
  }

  const reordered = await lessonUseCases.reorder(
    String(language) as Language,
    lessonIds.map(String)
  );
  if (!reordered) {
    return res.status(400).json({ error: "lesson_ids_must_match_language" });
  }

  return res.status(200).json({ total: reordered.length, lessons: reordered });
}
