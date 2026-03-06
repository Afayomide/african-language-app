import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorProverbUseCases } from "../../application/use-cases/tutor/proverb/TutorProverbUseCases.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";

const proverbUseCases = new TutorProverbUseCases(
  new MongooseProverbRepository(),
  new MongooseLessonRepository()
);
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createProverb(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { lessonIds, text, translation, contextNote, aiMeta } = req.body ?? {};

  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return res.status(400).json({ error: "lesson ids required" });
  }
  const normalizedLessonIds = Array.from(new Set(lessonIds.map(String)));
  if (normalizedLessonIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "text required" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const proverb = await proverbUseCases.create(
    {
      lessonIds: normalizedLessonIds,
      text: String(text).trim(),
      translation: translation ? String(translation).trim() : "",
      contextNote: contextNote ? String(contextNote).trim() : "",
      aiMeta
    },
    tutorLanguage as Language
  );

  if (proverb === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  return res.status(201).json({ proverb });
}

export async function listProverbs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const lessonId = req.query.lessonId ? String(req.query.lessonId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  if (lessonId && !mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (status && !["draft", "finished", "published"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const proverbs = await proverbUseCases.list(
    {
      lessonId,
      status: status as "draft" | "finished" | "published" | undefined
    },
    tutorLanguage as Language
  );

  if (proverbs === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  return res.status(200).json({ total: proverbs.length, proverbs });
}

export async function getProverbById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const proverb = await proverbUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!proverb) return res.status(404).json({ error: "proverb not found" });
  return res.status(200).json({ proverb });
}

export async function updateProverb(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  const { lessonIds, text, translation, contextNote, aiMeta } = req.body ?? {};
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
  if (text !== undefined) {
    if (!String(text).trim()) return res.status(400).json({ error: "text required" });
    update.text = String(text).trim();
  }
  if (translation !== undefined) update.translation = String(translation).trim();
  if (contextNote !== undefined) update.contextNote = String(contextNote).trim();
  if (aiMeta !== undefined) update.aiMeta = aiMeta;

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const proverb = await proverbUseCases.updateInScope(
    id,
    tutorLanguage as Language,
    update
  );
  if (proverb === "lesson_not_found") return res.status(404).json({ error: "lesson not found" });
  if (proverb === "proverb_not_found" || !proverb) return res.status(404).json({ error: "proverb not found" });
  return res.status(200).json({ proverb });
}

export async function deleteProverb(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const proverb = await proverbUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!proverb) return res.status(404).json({ error: "proverb not found" });
  return res.status(200).json({ message: "proverb_deleted" });
}

export async function finishProverb(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const proverb = await proverbUseCases.finishInScope(id, tutorLanguage as Language);
  if (!proverb) return res.status(404).json({ error: "proverb not found" });
  return res.status(200).json({ proverb });
}

