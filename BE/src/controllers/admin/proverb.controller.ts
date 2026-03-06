import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminProverbUseCases } from "../../application/use-cases/admin/proverb/AdminProverbUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";

const proverbUseCases = new AdminProverbUseCases(
  new MongooseProverbRepository(),
  new MongooseLessonRepository()
);

export async function createProverb(req: Request, res: Response) {
  const { lessonIds, language, text, translation, contextNote, aiMeta } = req.body ?? {};

  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson ids required" });
  }
  const normalizedLessonIds = Array.from(new Set(lessonIds.map(String)));
  if (normalizedLessonIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "text required" });
  }

  const proverb = await proverbUseCases.create({
    lessonIds: normalizedLessonIds,
    language: String(language) as Language,
    text: String(text).trim(),
    translation: translation ? String(translation).trim() : "",
    contextNote: contextNote ? String(contextNote).trim() : "",
    aiMeta
  });

  if (proverb === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (proverb === "language_mismatch_with_lessons") {
    return res.status(400).json({ error: "language mismatch with lessons" });
  }

  return res.status(201).json({ proverb });
}

export async function listProverbs(req: Request, res: Response) {
  const lessonId = req.query.lessonId ? String(req.query.lessonId) : undefined;
  const language = req.query.language ? String(req.query.language) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  if (lessonId && !mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (status && !["draft", "finished", "published"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }

  const proverbs = await proverbUseCases.list({
    lessonId,
    language: language as Language | undefined,
    status: status as "draft" | "finished" | "published" | undefined
  });

  return res.status(200).json({ total: proverbs.length, proverbs });
}

export async function getProverbById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const proverb = await proverbUseCases.getById(id);
  if (!proverb) {
    return res.status(404).json({ error: "proverb not found" });
  }
  return res.status(200).json({ proverb });
}

export async function updateProverb(req: Request, res: Response) {
  const { id } = req.params;
  const { lessonIds, language, text, translation, contextNote, aiMeta } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const update: Record<string, unknown> = {};
  if (lessonIds !== undefined) {
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return res.status(400).json({ error: "lesson ids required" });
    }
    const normalizedLessonIds = Array.from(new Set(lessonIds.map(String)));
    if (normalizedLessonIds.some((lessonId) => !mongoose.Types.ObjectId.isValid(lessonId))) {
      return res.status(400).json({ error: "invalid lesson id" });
    }
    update.lessonIds = normalizedLessonIds;
  }
  if (language !== undefined) {
    if (!isValidLessonLanguage(String(language))) {
      return res.status(400).json({ error: "invalid language" });
    }
    update.language = String(language);
  }
  if (text !== undefined) {
    if (!String(text).trim()) {
      return res.status(400).json({ error: "text required" });
    }
    update.text = String(text).trim();
  }
  if (translation !== undefined) update.translation = String(translation).trim();
  if (contextNote !== undefined) update.contextNote = String(contextNote).trim();
  if (aiMeta !== undefined) update.aiMeta = aiMeta;

  const proverb = await proverbUseCases.update(id, update);
  if (proverb === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (!proverb) {
    return res.status(404).json({ error: "proverb not found" });
  }

  return res.status(200).json({ proverb });
}

export async function deleteProverb(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const proverb = await proverbUseCases.delete(id);
  if (!proverb) {
    return res.status(404).json({ error: "proverb not found" });
  }
  return res.status(200).json({ message: "proverb_deleted" });
}

export async function finishProverb(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const proverb = await proverbUseCases.finish(id);
  if (!proverb) {
    return res.status(404).json({ error: "proverb not found" });
  }
  return res.status(200).json({ proverb });
}

export async function publishProverb(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const proverb = await proverbUseCases.publish(id);
  if (!proverb) {
    return res.status(404).json({ error: "proverb not found or not finished" });
  }
  return res.status(200).json({ proverb });
}

