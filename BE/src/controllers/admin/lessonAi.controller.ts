import type { Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminLessonAiUseCases } from "../../application/use-cases/admin/lesson-ai/AdminLessonAiUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { isValidLanguage, isValidLevel } from "../../interfaces/http/validators/ai.validators.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";

const lessons = new MongooseLessonRepository();
const useCases = new AdminLessonAiUseCases(lessons, getLlmClient());

export async function generateLessonsBulk(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { language, level, title, topics, count } = req.body ?? {};

  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid_language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid_level" });
  }
  if (title !== undefined && String(title).trim().length === 0) {
    return res.status(400).json({ error: "invalid_title" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "invalid_topics" });
  }

  const requestedCount = Number(count ?? (Array.isArray(topics) ? topics.length : 5));
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "invalid_count" });
  }

  const result = await useCases.generateLessonsBulk({
    language: String(language) as Language,
    level: String(level) as Level,
    title: title ? String(title) : undefined,
    topics: Array.isArray(topics) ? topics.map(String) : undefined,
    count: requestedCount,
    createdBy: req.user.id
  });

  return res.status(201).json(result);
}
