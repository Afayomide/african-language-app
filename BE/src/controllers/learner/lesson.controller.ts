import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { LearnerLessonUseCases } from "../../application/use-cases/learner/lesson/LearnerLessonUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLearnerProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerProfileRepository.js";
import { MongooseLessonProgressRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonProgressRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import type { QuestionType } from "../../domain/entities/Question.js";

const useCases = new LearnerLessonUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseProverbRepository(),
  new MongooseQuestionRepository(),
  new MongooseLessonProgressRepository(),
  new MongooseLearnerProfileRepository()
);

export async function getLessonFlow(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const result = await useCases.getLessonFlow(id);
  if (!result) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json(result);
}

export async function getNextLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const next = await useCases.getNextLesson(req.user.id);
  if (next === "profile_not_found") {
    return res.status(404).json({ error: "learner_profile_not_found" });
  }
  if (!next) {
    return res.status(404).json({ error: "no_published_lessons" });
  }

  return res.status(200).json({
    lesson: {
      id: next.id,
      title: next.title,
      description: next.description,
      language: next.language,
      level: next.level
    }
  });
}

export async function getLessonOverview(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const result = await useCases.getLessonOverview(req.user.id, id);
  if (!result) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({
    lesson: {
      id: result.lesson.id,
      title: result.lesson.title,
      description: result.lesson.description,
      language: result.lesson.language,
      level: result.lesson.level,
      progressPercent: result.progress.progressPercent,
      status: result.progress.status
    },
    steps: result.steps,
    comingNext: result.comingNext
  });
}

export async function getLessonSteps(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const result = await useCases.getLessonSteps(req.user.id, id);
  if (!result) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json(result);
}

export async function completeStep(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id, stepKey } = req.params;
  const { score } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const result = await useCases.completeStep({
    userId: req.user.id,
    lessonId: id,
    stepKey,
    score: score !== undefined ? Number(score) : undefined
  });

  if (result === "lesson_not_found") {
    return res.status(404).json({ error: "lesson_not_found" });
  }
  if (result === "invalid_step_key") {
    return res.status(400).json({ error: "invalid_step_key" });
  }
  if (result === "step_not_found") {
    return res.status(404).json({ error: "step_not_found" });
  }

  return res.status(200).json(result);
}

export async function completeLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  const { xpEarned, minutesSpent } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const result = await useCases.completeLesson({
    userId: req.user.id,
    lessonId: id,
    xpEarned: xpEarned !== undefined ? Number(xpEarned) : undefined,
    minutesSpent: minutesSpent !== undefined ? Number(minutesSpent) : undefined
  });

  if (result === "lesson_not_found") {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json(result);
}

export async function getLessonPhrases(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const phrases = await useCases.getLessonPhrases(id);
  if (!phrases) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({
    phrases: phrases.map((p) => ({
      id: p.id,
      text: p.text,
      translation: p.translation,
      pronunciation: p.pronunciation,
      explanation: p.explanation,
      examples: p.examples,
      difficulty: p.difficulty,
      audio: p.audio
    }))
  });
}

export async function getLessonQuestions(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  const { type } = req.query;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (!type || !["multiple-choice", "fill-in-the-gap", "listening"].includes(String(type))) {
    return res.status(400).json({ error: "invalid_type" });
  }

  const questions = await useCases.getLessonQuestions(
    id,
    String(type) as QuestionType
  );
  if (!questions) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({
    total: questions.length,
    questions
  });
}

export async function getLessonReviewExercises(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }

  const exercises = await useCases.getLessonReviewExercises(id);
  if (!exercises) {
    return res.status(404).json({ error: "lesson_not_found" });
  }

  return res.status(200).json({
    total: exercises.length,
    exercises
  });
}
