import type { Response } from "express";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { LearnerDashboardUseCases } from "../../application/use-cases/learner/dashboard/LearnerDashboardUseCases.js";
import { DrizzleLessonRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { DrizzleUnitRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleUnitRepository.js";
import { DrizzleChapterRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleChapterRepository.js";
import { DrizzleLearnerLanguageStateRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLearnerLanguageStateRepository.js";
import { DrizzleLearnerProfileRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLearnerProfileRepository.js";
import { DrizzleLessonProgressRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLessonProgressRepository.js";
import { DrizzleLanguageRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleLanguageRepository.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import type { Language } from "../../domain/entities/Lesson.js";

const useCases = new LearnerDashboardUseCases(
  new DrizzleLessonRepository(),
  new DrizzleUnitRepository(),
  new DrizzleChapterRepository(),
  new DrizzleLearnerProfileRepository(),
  new DrizzleLearnerLanguageStateRepository(),
  new DrizzleLessonProgressRepository(),
  new DrizzleLanguageRepository()
);

export async function getDashboardOverview(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const language = req.query.language;
  if (language !== undefined && (!language || !isValidLessonLanguage(String(language)))) {
    return res.status(400).json({ error: "invalid language" });
  }

  const data = await useCases.getOverview(
    req.user.id,
    language ? (String(language) as Language) : undefined
  );
  if (!data) {
    return res.status(404).json({ error: "learner profile not found" });
  }

  return res.status(200).json(data);
}

export async function updateDailyGoal(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { minutes } = req.body ?? {};
  const value = Number(minutes);
  if (Number.isNaN(value) || value < 1 || value > 120) {
    return res.status(400).json({ error: "invalid minutes" });
  }

  const profile = await useCases.updateDailyGoal(req.user.id, value);
  if (!profile) {
    return res.status(404).json({ error: "learner profile not found" });
  }

  return res.status(200).json({ dailyGoalMinutes: profile.dailyGoalMinutes });
}

export async function markLearningSession(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { minutes } = req.body ?? {};
  const minutesValue = Number(minutes);
  if (Number.isNaN(minutesValue) || minutesValue < 1) {
    return res.status(400).json({ error: "invalid minutes" });
  }

  const data = await useCases.markLearningSession(req.user.id, minutesValue);
  if (!data) {
    return res.status(404).json({ error: "learner profile not found" });
  }

  return res.status(200).json(data);
}

export async function updateCurrentLanguage(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { language } = req.body ?? {};
  if (!language || !isValidLessonLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }

  const profile = await useCases.updateCurrentLanguage(req.user.id, String(language) as Language);
  if (!profile) {
    return res.status(404).json({ error: "learner profile not found" });
  }

  return res.status(200).json({ currentLanguage: profile.currentLanguage });
}
