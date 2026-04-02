import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { LearnerLessonUseCases } from "../../application/use-cases/learner/lesson/LearnerLessonUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLearnerLanguageStateRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerLanguageStateRepository.js";
import { MongooseLearnerProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerProfileRepository.js";
import { MongooseLessonProgressRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonProgressRepository.js";
import { MongooseLearnerContentPerformanceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerContentPerformanceRepository.js";
import { MongooseLearnerQuestionMissRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLearnerQuestionMissRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import type { QuestionSubtype, QuestionType } from "../../domain/entities/Question.js";

const useCases = new LearnerLessonUseCases(
  new MongooseLessonRepository(),
  new MongooseUnitRepository(),
  new MongooseChapterRepository(),
  new MongooseWordRepository(),
  new MongooseExpressionRepository(),
  new MongooseSentenceRepository(),
  new MongooseProverbRepository(),
  new MongooseQuestionRepository(),
  new MongooseLessonProgressRepository(),
  new MongooseLearnerProfileRepository(),
  new MongooseLearnerLanguageStateRepository(),
  new MongooseLearnerContentPerformanceRepository(),
  new MongooseLearnerQuestionMissRepository()
);

export async function getLessonFlow(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const result = await useCases.getLessonFlow(req.user.id, id);
  if (!result) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json(result);
}

export async function getNextLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const next = await useCases.getNextLesson(req.user.id);
  if (next === "profile_not_found") {
    return res.status(404).json({ error: "learner profile not found" });
  }
  if (!next) {
    return res.status(404).json({ error: "no published lessons" });
  }

  return res.status(200).json({
    lesson: {
      id: next.id,
      title: next.title,
      description: next.description,
      language: next.language,
      level: next.level,
      kind: next.kind
    }
  });
}

export async function getLessonOverview(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const result = await useCases.getLessonOverview(req.user.id, id);
  if (!result) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({
    lesson: {
      id: result.lesson.id,
      _id: result.lesson.id,
      title: result.lesson.title,
      description: result.lesson.description,
      language: result.lesson.language,
      level: result.lesson.level,
      topics: result.lesson.topics,
      proverbs: result.lesson.proverbs,
      stages: result.lesson.stages,
      unitId: result.lesson.unitId,
      orderIndex: result.lesson.orderIndex,
      progressPercent: result.progress.progressPercent,
      status: result.progress.status,
      currentStageIndex: result.progress.currentStageIndex,
      stageProgress: result.progress.stageProgress
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
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const result = await useCases.getLessonSteps(req.user.id, id);
  if (!result) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json(result);
}

export async function completeStage(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id, stageIndex } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const stageValue = Number(stageIndex);
  if (!Number.isInteger(stageValue) || stageValue < 0) {
    return res.status(400).json({ error: "invalid stage index" });
  }

  const { xpEarned, minutesSpent } = req.body ?? {};
  const rawQuestionResults = Array.isArray(req.body?.questionResults) ? req.body.questionResults : [];
  if (xpEarned !== undefined && (!Number.isFinite(Number(xpEarned)) || Number(xpEarned) < 0)) {
    return res.status(400).json({ error: "invalid xp earned" });
  }
  if (minutesSpent !== undefined && (!Number.isFinite(Number(minutesSpent)) || Number(minutesSpent) < 0)) {
    return res.status(400).json({ error: "invalid minutes spent" });
  }

  const result = await useCases.completeStage({
    userId: req.user.id,
    lessonId: id,
    stageIndex: stageValue,
    xpEarned: xpEarned !== undefined ? Number(xpEarned) : undefined,
    minutesSpent: minutesSpent !== undefined ? Number(minutesSpent) : undefined,
    questionResults: rawQuestionResults
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: unknown) => {
        const value = item as Record<string, unknown>;
        return {
          questionId: typeof value.questionId === "string" ? value.questionId : undefined,
          sourceType:
            value.sourceType === "word" || value.sourceType === "expression" || value.sourceType === "sentence"
              ? value.sourceType
              : undefined,
          sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
          questionType:
            value.questionType === "multiple-choice" ||
            value.questionType === "fill-in-the-gap" ||
            value.questionType === "listening" ||
            value.questionType === "matching" ||
            value.questionType === "speaking"
              ? value.questionType
              : undefined,
          questionSubtype: typeof value.questionSubtype === "string" ? (value.questionSubtype as QuestionSubtype) : undefined,
          attempts: Number.isFinite(Number(value.attempts)) ? Number(value.attempts) : undefined,
          incorrectAttempts: Number.isFinite(Number(value.incorrectAttempts)) ? Number(value.incorrectAttempts) : undefined,
          correct: typeof value.correct === "boolean" ? value.correct : undefined
        };
      })
  });

  if (result === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (result === "invalid_stage_index") {
    return res.status(400).json({ error: "invalid stage index" });
  }

  return res.status(200).json(result);
}

export async function getAdaptiveReviewSuggestion(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const suggestion = await useCases.getAdaptiveReviewSuggestion(req.user.id, id);
  return res.status(200).json({ suggestion });
}

export async function getAdaptiveReviewFlow(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const result = await useCases.getAdaptiveReviewFlow(req.user.id, id);
  if (!result) {
    return res.status(404).json({ error: "adaptive review not available" });
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
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const result = await useCases.completeStep({
    userId: req.user.id,
    lessonId: id,
    stepKey,
    score: score !== undefined ? Number(score) : undefined
  });

  if (result === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (result === "invalid_step_key") {
    return res.status(400).json({ error: "invalid step key" });
  }
  if (result === "step_not_found") {
    return res.status(404).json({ error: "step not found" });
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
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const result = await useCases.completeLesson({
    userId: req.user.id,
    lessonId: id,
    xpEarned: xpEarned !== undefined ? Number(xpEarned) : undefined,
    minutesSpent: minutesSpent !== undefined ? Number(minutesSpent) : undefined
  });

  if (result === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json(result);
}

export async function getLessonExpressions(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const expressions = await useCases.getLessonExpressions(id);
  if (!expressions) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({
    expressions: expressions.map((p) => ({
      id: p.id,
      text: p.text,
      selectedTranslation: p.selectedTranslation,
      selectedTranslationIndex: p.selectedTranslationIndex,
      translations: p.translations,
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
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (!type || !["multiple-choice", "fill-in-the-gap", "listening", "speaking"].includes(String(type))) {
    return res.status(400).json({ error: "invalid type" });
  }

  const questions = await useCases.getLessonQuestions(
    id,
    String(type) as QuestionType
  );
  if (!questions) {
    return res.status(404).json({ error: "lesson not found" });
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
    return res.status(400).json({ error: "invalid lesson id" });
  }

  const exercises = await useCases.getLessonReviewExercises(id);
  if (!exercises) {
    return res.status(404).json({ error: "lesson not found" });
  }

  return res.status(200).json({
    total: exercises.length,
    exercises
  });
}
