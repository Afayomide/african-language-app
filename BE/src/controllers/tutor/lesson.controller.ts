import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorLessonUseCases } from "../../application/use-cases/tutor/lesson/TutorLessonUseCases.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import type { Language, Level, Status } from "../../domain/entities/Lesson.js";
import {
  isValidLessonLevel,
  isValidLessonStatus
} from "../../interfaces/http/validators/lesson.validators.js";

const lessonUseCases = new TutorLessonUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseQuestionRepository()
);
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { title, description, level, topics } = req.body ?? {};
  if (!title || String(title).trim().length === 0) {
    return res.status(400).json({ error: "title_required" });
  }
  if (!level || !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid_topics" });
  }
  const normalizedTopics: string[] = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessonUseCases.create({
    title: String(title).trim(),
    language: tutorLanguage as Language,
    level: String(level) as Level,
    description: description ? String(description).trim() : "",
    topics: normalizedTopics,
    createdBy: req.user.id
  });

  return res.status(201).json({ lesson });
}

export async function listLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const status = req.query.status ? String(req.query.status) : undefined;
  if (status && !isValidLessonStatus(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lessons = await lessonUseCases.list(tutorLanguage as Language, status as Status | undefined);
  return res.status(200).json({ total: lessons.length, lessons });
}

export async function getLessonById(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessonUseCases.getById(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ lesson });
}

export async function updateLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  const { title, description, level, orderIndex, topics } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  if (level !== undefined && !isValidLessonLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }

  if (orderIndex !== undefined) {
    const value = Number(orderIndex);
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ error: "invalid_order_index" });
    }
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid_topics" });
  }
  const normalizedTopics: string[] = Array.isArray(topics)
    ? topics.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const update: Partial<{
    title: string;
    description: string;
    level: Level;
    orderIndex: number;
    topics: string[];
  }> = {};
  if (title !== undefined) {
    if (!String(title).trim()) {
      return res.status(400).json({ error: "title_required" });
    }
    update.title = String(title).trim();
  }
  if (description !== undefined) {
    update.description = String(description).trim();
  }
  if (level !== undefined) {
    update.level = String(level) as Level;
  }
  if (orderIndex !== undefined) {
    update.orderIndex = Number(orderIndex);
  }
  if (topics !== undefined) {
    update.topics = normalizedTopics;
  }

  const lesson = await lessonUseCases.update(id, tutorLanguage as Language, update);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ lesson });
}

export async function deleteLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const lesson = await lessonUseCases.delete(id, tutorLanguage as Language);
  if (!lesson) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({ message: "lesson_deleted" });
}

export async function reorderLessons(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonIds } = req.body ?? {};
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson_ids_required" });
  }

  for (const id of lessonIds) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor_language_not_configured" });
  }

  const reordered = await lessonUseCases.reorder(
    tutorLanguage as Language,
    lessonIds.map(String)
  );
  if (!reordered) {
    return res.status(400).json({ error: "lesson_ids_out_of_scope" });
  }
  return res.status(200).json({ total: reordered.length, lessons: reordered });
}
