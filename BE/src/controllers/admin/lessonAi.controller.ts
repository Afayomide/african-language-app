import type { Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminLessonAiUseCases } from "../../application/use-cases/admin/lesson-ai/AdminLessonAiUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { isValidLanguage, isValidLevel } from "../../interfaces/http/validators/ai.validators.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";

const lessons = new MongooseLessonRepository();
const proverbs = new MongooseProverbRepository();
const useCases = new AdminLessonAiUseCases(lessons, new MongooseProverbRepository(), getLlmClient());

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

export async function generateProverbs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { lessonId, count, extraInstructions } = req.body ?? {};
  if (!lessonId) return res.status(400).json({ error: "lesson_id_required" });
  const lesson = await lessons.findById(String(lessonId));
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });

  const requestedCount = Number(count ?? 5);
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "invalid_count" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid_extra_instructions" });
  }

  const llm = getLlmClient();
  const existing = await proverbs.findByLessonId(lesson.id);

  try {
    const suggested = await llm.generateProverbs({
      language: lesson.language,
      level: lesson.level,
      lessonTitle: lesson.title,
      lessonDescription: lesson.description,
      count: requestedCount,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined,
      existingProverbs: existing.map((item) => item.text)
    });

    const created = [];
    const seen = new Set<string>();
    for (const item of suggested) {
      const text = String(item.text || "").trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const reusable = await proverbs.findReusable(lesson.language, text);
      if (reusable) {
        const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, lesson.id]));
        const updated = await proverbs.updateById(reusable.id, {
          lessonIds: mergedLessonIds,
          translation: String(item.translation || reusable.translation || "").trim(),
          contextNote: String(item.contextNote || reusable.contextNote || "").trim(),
          aiMeta: { generatedByAI: true, model: llm.modelName, reviewedByAdmin: false }
        });
        if (updated) created.push(updated);
        continue;
      }

      const proverb = await proverbs.create({
        lessonIds: [lesson.id],
        language: lesson.language,
        text,
        translation: String(item.translation || "").trim(),
        contextNote: String(item.contextNote || "").trim(),
        aiMeta: { generatedByAI: true, model: llm.modelName, reviewedByAdmin: false },
        status: "draft"
      });
      created.push(proverb);
    }

    if (created.length === 0) {
      return res.status(409).json({ error: "no_new_proverbs_generated" });
    }
    return res.status(201).json({ total: created.length, proverbs: created });
  } catch (error) {
    console.error("Admin AI generateProverbs LLM error", error);
    return res.status(502).json({ error: "llm_generation_failed" });
  }
}
