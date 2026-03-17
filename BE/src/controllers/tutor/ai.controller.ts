import type { Response } from "express";
import mongoose from "mongoose";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { AiPhraseOrchestrator } from "../../application/services/AiPhraseOrchestrator.js";
import { AdminUnitAiContentUseCases } from "../../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import { isValidLevel, validateLessonId } from "../../interfaces/http/validators/ai.validators.js";
import { LESSON_GENERATION_LIMITS, clampPhrasesPerLesson } from "../../config/lessonGeneration.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import {
  validateGeneratedProverbs,
  validateLessonSuggestion
} from "../../services/llm/outputQuality.js";
import { extractThemeAnchors } from "../../services/llm/unitTheme.js";

const lessons = new MongooseLessonRepository();
const phrases = new MongoosePhraseRepository();
const proverbs = new MongooseProverbRepository();
const questions = new MongooseQuestionRepository();
const units = new MongooseUnitRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const unitAiContentUseCases = new AdminUnitAiContentUseCases(
  lessons,
  phrases,
  proverbs,
  questions,
  units,
  getLlmClient()
);

function isEnglishLikeTitle(value: string) {
  const title = String(value || "").trim();
  if (!title) return false;
  return /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/.test(title);
}

export async function suggestLesson(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { level, topic } = req.body ?? {};
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (topic !== undefined && String(topic).trim().length === 0) {
    return res.status(400).json({ error: "invalid topic" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const llm = getLlmClient();
  try {
    const existingLessons = await lessons.list({ language: tutorLanguage });
    const existingUnits = await units.listByLanguage(tutorLanguage);
    const existingPhrases = await phrases.list({ language: tutorLanguage });
    const existingProverbs = await proverbs.list({ language: tutorLanguage });
    const curriculumInstruction = "Continue the curriculum progressively. Prioritize conversational utility, repetition, and careful vocabulary load. Do not repeat old lesson topics with new titles.";
    const validationInput = {
      language: tutorLanguage,
      level: String(level) as "beginner" | "intermediate" | "advanced",
      topic: topic ? String(topic) : undefined,
      curriculumInstruction,
      themeAnchors: extractThemeAnchors({
        topic: topic ? String(topic) : undefined,
        curriculumInstruction
      }),
      existingUnitTitles: existingUnits.map((item) => item.title).filter(Boolean),
      existingLessonTitles: existingLessons.map((item) => item.title).filter(Boolean),
      existingPhraseTexts: existingPhrases.map((item) => item.text).filter(Boolean),
      existingProverbTexts: existingProverbs.map((item) => item.text).filter(Boolean)
    };
    let suggestion = null;
    let retryInstruction = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const candidate = await llm.suggestLesson({
        language: tutorLanguage,
        level: String(level),
        topic: topic ? String(topic) : undefined,
        curriculumInstruction: [validationInput.curriculumInstruction, retryInstruction].filter(Boolean).join(" ").trim(),
        themeAnchors: validationInput.themeAnchors,
        existingUnitTitles: validationInput.existingUnitTitles,
        existingLessonTitles: validationInput.existingLessonTitles,
        existingPhraseTexts: validationInput.existingPhraseTexts,
        existingProverbTexts: validationInput.existingProverbTexts
      });
      const validation = validateLessonSuggestion(candidate, validationInput);
      if (validation.ok) {
        suggestion = candidate;
        break;
      }
      logAiValidation("tutor-suggest-lesson", {
        attempt,
        topic,
        title: candidate.title,
        reasons: validation.reasons,
        details: validation.details
      });
      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
        logAiRetry("tutor-suggest-lesson", { attempt, retryInstruction });
      }
    }
    if (!suggestion) {
      return res.status(422).json({ error: "AI suggestion failed validation after retries." });
    }

    if (!isEnglishLikeTitle(String(suggestion.title || ""))) {
      return res.status(422).json({ error: "AI title must be in English." });
    }

    return res.status(200).json({ suggestion });
  } catch (error) {
    console.error("Tutor AI suggestLesson LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generatePhrases(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId, seedWords, extraInstructions } = req.body ?? {};
  if (!validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const lesson = await lessons.findById(String(lessonId));
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "lesson not found or out of scope" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const created = await orchestrator.generateForLesson({
      lesson,
      seedWords: Array.isArray(seedWords) ? seedWords.map(String) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no new phrases generated" });
    }

    return res.status(201).json({ total: created.length, phrases: created });
  } catch (error) {
    console.error("Tutor AI generatePhrases LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function enhancePhrase(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const phrase = await phrases.findById(id);
  if (!phrase) {
    return res.status(404).json({ error: "phrase not found" });
  }
  if (phrase.status === "published" || phrase.status === "finished") {
    return res.status(409).json({ error: "cannot edit non draft" });
  }

  const primaryLessonId = phrase.lessonIds[0];
  if (!primaryLessonId) {
    return res.status(400).json({ error: "phrase has no lessons" });
  }
  const lesson = await lessons.findById(primaryLessonId);
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "phrase not found or out of scope" });
  }

  const orchestrator = new AiPhraseOrchestrator(lessons, phrases, getLlmClient());

  try {
    const updated = await orchestrator.enhancePhrase({
      phrase,
      language: tutorLanguage,
      level: lesson.level
    });

    if (!updated) {
      return res.status(422).json({ error: "no valid phrase updates" });
    }

    return res.status(200).json({ phrase: updated });
  } catch (error) {
    console.error("Tutor AI enhancePhrase LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateProverbs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { lessonId, count, extraInstructions } = req.body ?? {};
  if (!validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  const requestedCount = Number(count ?? 5);
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "invalid count" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const lesson = await lessons.findById(String(lessonId));
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "lesson not found or out of scope" });
  }

  const llm = getLlmClient();
  const existing = await proverbs.findByLessonId(lesson.id);

  try {
    const proverbValidationInput = {
      existingProverbs: existing.map((item) => item.text),
      level: lesson.level,
      language: lesson.language
    };
    let validSuggested: Array<{ text: string; translation: string; contextNote?: string }> = [];
    let retryInstruction = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const suggested = await llm.generateProverbs({
        language: lesson.language,
        level: lesson.level,
        lessonTitle: lesson.title,
        lessonDescription: lesson.description,
        count: requestedCount,
        extraInstructions: [typeof extraInstructions === "string" ? extraInstructions.trim() : "", retryInstruction]
          .filter(Boolean)
          .join(" ")
          .trim() || undefined,
        existingProverbs: proverbValidationInput.existingProverbs
      });
      const validated = validateGeneratedProverbs(suggested, proverbValidationInput);
      if (validated.rejected.length > 0) {
        logAiValidation("tutor-generate-proverbs", {
          attempt,
          acceptedCount: validated.accepted.length,
          rejectedCount: validated.rejected.length,
          sampleRejected: validated.rejected.slice(0, 5).map((item) => ({
            text: item.item.text,
            translation: item.item.translation,
            contextNote: item.item.contextNote,
            reasons: item.reasons
          }))
        });
      }
      if (validated.accepted.length > 0) {
        validSuggested = validated.accepted;
        break;
      }
      if (attempt < 2) {
        retryInstruction = buildRetryInstruction(validated.rejected.flatMap((item) => item.reasons));
        logAiRetry("tutor-generate-proverbs", { attempt, retryInstruction });
      }
    }

    const created = [];
    const seen = new Set<string>();
    for (const item of validSuggested) {
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
    console.error("Tutor AI generateProverbs LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateUnitContent(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { unitId } = req.params;
  const { lessonCount, phrasesPerLesson, reviewPhrasesPerLesson, proverbsPerLesson, topics, extraInstructions } = req.body ?? {};
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "invalid unit id" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "topics must be an array" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const requestedLessonCount = Number(lessonCount ?? 3);
  const requestedPhrasesPerLesson = Number(
    phrasesPerLesson ?? LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON
  );
  const requestedReviewPhrasesPerLesson =
    reviewPhrasesPerLesson === undefined ? undefined : Number(reviewPhrasesPerLesson);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (
    Number.isNaN(requestedPhrasesPerLesson) ||
    requestedPhrasesPerLesson < LESSON_GENERATION_LIMITS.MIN_PHRASES_PER_LESSON ||
    requestedPhrasesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON
  ) {
    return res.status(400).json({
      error: `phrasesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_PHRASES_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON}`
    });
  }
  if (
    requestedReviewPhrasesPerLesson !== undefined &&
    (
      Number.isNaN(requestedReviewPhrasesPerLesson) ||
      requestedReviewPhrasesPerLesson < 0 ||
      requestedReviewPhrasesPerLesson > LESSON_GENERATION_LIMITS.MAX_REVIEW_PHRASES_PER_LESSON
    )
  ) {
    return res.status(400).json({
      error: `reviewPhrasesPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_PHRASES_PER_LESSON}`
    });
  }
  if (Number.isNaN(requestedProverbsPerLesson) || requestedProverbsPerLesson < 0 || requestedProverbsPerLesson > 10) {
    return res.status(400).json({ error: "proverbsPerLesson must be between 0 and 10" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const unit = await units.findById(String(unitId));
  if (!unit || unit.language !== tutorLanguage) {
    return res.status(404).json({ error: "unit not found or out of scope" });
  }

  try {
    const result = await unitAiContentUseCases.generate({
      unitId: unit.id,
      language: unit.language,
      level: unit.level,
      createdBy: req.user.id,
      lessonCount: requestedLessonCount,
      phrasesPerLesson: clampPhrasesPerLesson(requestedPhrasesPerLesson),
      reviewPhrasesPerLesson: requestedReviewPhrasesPerLesson,
      proverbsPerLesson: requestedProverbsPerLesson,
      topics: Array.isArray(topics) ? topics.map((item) => String(item || "").trim()).filter(Boolean) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("Tutor AI generateUnitContent error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function reviseUnitContent(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { unitId } = req.params;
  const { mode, lessonCount, phrasesPerLesson, reviewPhrasesPerLesson, proverbsPerLesson, topics, extraInstructions } = req.body ?? {};
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "invalid unit id" });
  }
  if (mode !== "refactor" && mode !== "regenerate") {
    return res.status(400).json({ error: "mode must be refactor or regenerate" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "topics must be an array" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const requestedLessonCount = Number(lessonCount ?? 3);
  const requestedPhrasesPerLesson = Number(
    phrasesPerLesson ?? LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON
  );
  const requestedReviewPhrasesPerLesson =
    reviewPhrasesPerLesson === undefined ? undefined : Number(reviewPhrasesPerLesson);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (
    Number.isNaN(requestedPhrasesPerLesson) ||
    requestedPhrasesPerLesson < LESSON_GENERATION_LIMITS.MIN_PHRASES_PER_LESSON ||
    requestedPhrasesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON
  ) {
    return res.status(400).json({
      error: `phrasesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_PHRASES_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON}`
    });
  }
  if (
    requestedReviewPhrasesPerLesson !== undefined &&
    (
      Number.isNaN(requestedReviewPhrasesPerLesson) ||
      requestedReviewPhrasesPerLesson < 0 ||
      requestedReviewPhrasesPerLesson > LESSON_GENERATION_LIMITS.MAX_REVIEW_PHRASES_PER_LESSON
    )
  ) {
    return res.status(400).json({
      error: `reviewPhrasesPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_PHRASES_PER_LESSON}`
    });
  }
  if (Number.isNaN(requestedProverbsPerLesson) || requestedProverbsPerLesson < 0 || requestedProverbsPerLesson > 10) {
    return res.status(400).json({ error: "proverbsPerLesson must be between 0 and 10" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const unit = await units.findById(String(unitId));
  if (!unit || unit.language !== tutorLanguage) {
    return res.status(404).json({ error: "unit not found or out of scope" });
  }

  try {
    const result = await unitAiContentUseCases.revise({
      mode,
      unitId: unit.id,
      language: unit.language,
      level: unit.level,
      createdBy: req.user.id,
      lessonCount: requestedLessonCount,
      phrasesPerLesson: clampPhrasesPerLesson(requestedPhrasesPerLesson),
      reviewPhrasesPerLesson: requestedReviewPhrasesPerLesson,
      proverbsPerLesson: requestedProverbsPerLesson,
      topics: Array.isArray(topics) ? topics.map((item) => String(item || "").trim()).filter(Boolean) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Tutor AI reviseUnitContent error", error);
    return res.status(502).json({ error: "llm revision failed" });
  }
}

export async function refactorLessonContent(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId } = req.params;
  const { topic, extraInstructions } = req.body ?? {};

  if (!validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return res.status(400).json({ error: "invalid topic" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const lesson = await lessons.findById(String(lessonId));
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "lesson not found or out of scope" });
  }

  try {
    const result = await unitAiContentUseCases.refactorLesson({
      lessonId: lesson.id,
      createdBy: req.user.id,
      topic: typeof topic === "string" ? topic.trim() || undefined : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() || undefined : undefined
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Tutor AI refactorLessonContent error", error);
    return res.status(502).json({ error: "llm lesson refactor failed" });
  }
}
