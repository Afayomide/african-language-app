import type { Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminLessonAiUseCases } from "../../application/use-cases/admin/lesson-ai/AdminLessonAiUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { isValidLevel } from "../../interfaces/http/validators/ai.validators.js";
import type { Level } from "../../domain/entities/Lesson.js";

const lessons = new MongooseLessonRepository();
const proverbs = new MongooseProverbRepository();
const units = new MongooseUnitRepository();
const useCases = new AdminLessonAiUseCases(lessons, new MongooseProverbRepository(), getLlmClient());

export async function generateLessonsBulk(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { unitId, title, topics, count } = req.body ?? {};

  if (!unitId || typeof unitId !== "string") {
    return res.status(400).json({ error: "Unit id is required." });
  }
  if (title !== undefined && String(title).trim().length === 0) {
    return res.status(400).json({ error: "Title is invalid." });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "Topics must be an array." });
  }

  const requestedCount = Number(count ?? (Array.isArray(topics) ? topics.length : 5));
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "Count must be between 1 and 20." });
  }

  const unit = await units.findById(String(unitId));
  if (!unit) {
    return res.status(404).json({ error: "Unit not found." });
  }
  if (!isValidLevel(String(unit.level))) {
    return res.status(400).json({ error: "Unit level is invalid." });
  }

  const result = await useCases.generateLessonsBulk({
    unitId: unit.id,
    language: unit.language,
    level: String(unit.level) as Level,
    title: title ? String(title) : undefined,
    topics: Array.isArray(topics) ? topics.map(String) : undefined,
    count: requestedCount,
    createdBy: req.user.id
  });

  return res.status(201).json(result);
}

export async function generateUnitsBulk(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { language, level, count, topic } = req.body ?? {};

  if (!language || !["yoruba", "igbo", "hausa"].includes(String(language))) {
    return res.status(400).json({ error: "Language is invalid." });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "Level is invalid." });
  }

  const requestedCount = Number(count ?? 5);
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "Count must be between 1 and 20." });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return res.status(400).json({ error: "Topic is invalid." });
  }

  const llm = getLlmClient();
  const existingUnits = await units.listByLanguage(String(language) as "yoruba" | "igbo" | "hausa");
  let lastOrderIndex = existingUnits.reduce((max, unit) => Math.max(max, unit.orderIndex), -1);
  const seenTitles = new Set(existingUnits.map((unit) => unit.title.trim().toLowerCase()));

  const created = [];
  const skipped: Array<{ reason: string; title?: string }> = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let index = 0; index < requestedCount; index += 1) {
    const variationTopic = typeof topic === "string" && topic.trim()
      ? `${topic.trim()} variation ${index + 1}`
      : undefined;

    try {
      const suggestion = await llm.suggestLesson({
        language: String(language),
        level: String(level),
        topic: variationTopic
      });

      const rawTitle = String(suggestion.title || "").trim();
      if (!rawTitle) {
        errors.push({ index: index + 1, error: "AI returned an empty title." });
        continue;
      }

      const titleKey = rawTitle.toLowerCase();
      if (seenTitles.has(titleKey)) {
        skipped.push({ reason: "duplicate_title", title: rawTitle });
        continue;
      }

      seenTitles.add(titleKey);
      lastOrderIndex += 1;
      const createdUnit = await units.create({
        title: rawTitle,
        description: String(suggestion.description || "").trim(),
        language: String(language) as "yoruba" | "igbo" | "hausa",
        level: String(level) as Level,
        orderIndex: lastOrderIndex,
        status: "draft",
        createdBy: req.user.id
      });
      created.push(createdUnit);
    } catch (error) {
      console.error("Admin AI generateUnitsBulk error", error);
      errors.push({ index: index + 1, error: "Failed to generate this unit." });
    }
  }

  return res.status(201).json({
    totalRequested: requestedCount,
    createdCount: created.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    units: created,
    skipped,
    errors
  });
}

export async function generateProverbs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { lessonId, count, extraInstructions } = req.body ?? {};
  if (!lessonId) return res.status(400).json({ error: "lesson id required" });
  const lesson = await lessons.findById(String(lessonId));
  if (!lesson) return res.status(404).json({ error: "lesson not found" });

  const requestedCount = Number(count ?? 5);
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "invalid count" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
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
      return res.status(409).json({ error: "no new proverbs generated" });
    }
    return res.status(201).json({ total: created.length, proverbs: created });
  } catch (error) {
    console.error("Admin AI generateProverbs LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}
