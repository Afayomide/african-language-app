import type { Response } from "express";
import mongoose from "mongoose";
import { getLlmClient } from "../../services/llm/index.js";
import type { Language, LessonEntity, Level } from "../../domain/entities/Lesson.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseUnitContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitContentItemRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { AiExpressionOrchestrator } from "../../application/services/AiExpressionOrchestrator.js";
import { AiSentenceOrchestrator } from "../../application/services/AiSentenceOrchestrator.js";
import { AiWordOrchestrator } from "../../application/services/AiWordOrchestrator.js";
import { SentenceDraftPersistenceService } from "../../application/services/SentenceDraftPersistenceService.js";
import { ChapterAiUseCases } from "../../application/use-cases/shared/ChapterAiUseCases.js";
import { AdminUnitAiContentUseCases, AiPlanValidationError } from "../../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import { isValidLevel, validateLessonId } from "../../interfaces/http/validators/ai.validators.js";
import { LESSON_GENERATION_LIMITS, clampNewTargetsPerLesson } from "../../config/lessonGeneration.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import {
  validateGeneratedProverbs,
  validateLessonSuggestion
} from "../../services/llm/outputQuality.js";
import { extractThemeAnchors } from "../../services/llm/unitTheme.js";
import {
  buildAutoReviewUnitDescription,
  buildAutoReviewUnitTitle,
  getTrailingCoreUnitsSinceLastReview
} from "../../application/services/reviewUnitScheduling.js";

const lessons = new MongooseLessonRepository();
const expressions = new MongooseExpressionRepository();
const words = new MongooseWordRepository();
const sentences = new MongooseSentenceRepository();
const proverbs = new MongooseProverbRepository();
const questions = new MongooseQuestionRepository();
const units = new MongooseUnitRepository();
const chapters = new MongooseChapterRepository();
const lessonContentItems = new MongooseLessonContentItemRepository();
const sentenceDraftPersistence = new SentenceDraftPersistenceService(
  words,
  expressions,
  sentences,
  lessonContentItems
);
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const chapterAiUseCases = new ChapterAiUseCases(chapters, getLlmClient());
const unitAiContentUseCases = new AdminUnitAiContentUseCases(
  lessons,
  new MongooseWordRepository(),
  expressions,
  new MongooseSentenceRepository(),
  new MongooseChapterRepository(),
  new MongooseLessonContentItemRepository(),
  new MongooseUnitContentItemRepository(),
  proverbs,
  questions,
  units,
  getLlmClient()
);

function normalizeSeedWords(seedWords: unknown) {
  if (!Array.isArray(seedWords)) return undefined;
  const normalized = seedWords.map(String).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function buildThemeInstructions(seedWords: string[] | undefined, extraInstructions: string | undefined) {
  const parts: string[] = [];
  if (seedWords && seedWords.length > 0) {
    parts.push(`Theme focus: ${seedWords.join(", ")}.`);
  }
  if (extraInstructions) {
    parts.push(extraInstructions);
  }
  const combined = parts.join(" ").trim();
  return combined || undefined;
}

function buildSyntheticLesson(language: Language, level: Level, title: string, description: string): LessonEntity {
  const now = new Date();
  return {
    id: `global:${language}:${level}:${title.toLowerCase().replace(/\s+/g, "-")}`,
    _id: `global:${language}:${level}:${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    unitId: "",
    language,
    level,
    orderIndex: 0,
    description,
    topics: [],
    proverbs: [],
    stages: [],
    kind: "core",
    status: "draft",
    createdBy: "system",
    publishedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

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
    const existingExpressions = await expressions.list({ language: tutorLanguage });
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
      existingPhraseTexts: existingExpressions.map((item) => item.text).filter(Boolean),
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

export async function generateChaptersBulk(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const requestedLevel = req.body?.level;
  const topic = req.body?.topic;
  const extraInstructions = req.body?.extraInstructions;
  const requestedCount = Number(req.body?.count ?? 5);

  if (!requestedLevel || !isValidLevel(String(requestedLevel))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "count must be between 1 and 20" });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return res.status(400).json({ error: "invalid topic" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  try {
    const result = await chapterAiUseCases.generateBulk({
      language: tutorLanguage,
      level: String(requestedLevel) as Level,
      count: requestedCount,
      topic: typeof topic === "string" ? topic.trim() : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined,
      createdBy: req.user.id
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error("Tutor AI generateChaptersBulk error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateUnitsBulk(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const userId = req.user.id;

  const { level, count, topic, chapterId } = req.body ?? {};
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }

  const requestedCount = Number(count ?? 5);
  if (Number.isNaN(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    return res.status(400).json({ error: "count must be between 1 and 20" });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return res.status(400).json({ error: "invalid topic" });
  }
  if (chapterId !== undefined && chapterId !== null && chapterId !== "" && !mongoose.Types.ObjectId.isValid(String(chapterId))) {
    return res.status(400).json({ error: "invalid chapter id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(userId);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  let selectedChapter = null;
  if (chapterId) {
    selectedChapter = await chapters.findById(String(chapterId));
    if (!selectedChapter || selectedChapter.language !== tutorLanguage) {
      return res.status(400).json({ error: "chapter is invalid for this language" });
    }
  }

  const llm = getLlmClient();
  const existingUnits = await units.listByLanguage(tutorLanguage);
  const existingLessons = await lessons.list({ language: tutorLanguage });
  const existingUnitsInScope = selectedChapter
    ? existingUnits.filter((unit) => unit.chapterId === selectedChapter.id)
    : existingUnits;
  let lastOrderIndex = existingUnitsInScope.reduce((max, unit) => Math.max(max, unit.orderIndex), -1);
  const seenTitles = new Set(existingUnitsInScope.map((unit) => unit.title.trim().toLowerCase()));
  let pendingCoreUnits = getTrailingCoreUnitsSinceLastReview(
    existingUnitsInScope
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime())
      .map((unit) => ({ id: unit.id, title: unit.title, kind: unit.kind }))
  ).slice(-2);
  const chapterInstruction = selectedChapter
    ? `Generate units for the chapter "${selectedChapter.title}". Chapter description: ${selectedChapter.description || "No description provided."}`
    : "";

  const created = [];
  const skipped: Array<{ reason: string; title?: string }> = [];
  const errors: Array<{ index: number; error: string }> = [];
  let coreCreatedCount = 0;
  let reviewCreatedCount = 0;

  const tryCreateAutoReviewUnit = async () => {
    if (pendingCoreUnits.length < 2) return;
    const reviewTitle = buildAutoReviewUnitTitle(pendingCoreUnits, seenTitles);
    seenTitles.add(reviewTitle.trim().toLowerCase());
    lastOrderIndex += 1;
    const reviewUnit = await units.create({
      chapterId: selectedChapter?.id || null,
      title: reviewTitle,
      description: buildAutoReviewUnitDescription(pendingCoreUnits),
      language: tutorLanguage,
      level: String(level) as Level,
      kind: "review",
      reviewStyle: "star",
      reviewSourceUnitIds: pendingCoreUnits.map((unit) => unit.id),
      orderIndex: lastOrderIndex,
      status: "draft",
      createdBy: userId
    });
    created.push(reviewUnit);
    reviewCreatedCount += 1;
    pendingCoreUnits = [];
  };

  if (pendingCoreUnits.length === 2) {
    try {
      await tryCreateAutoReviewUnit();
    } catch (error) {
      console.error("Tutor AI generateUnitsBulk auto review unit error", error);
      errors.push({ index: 0, error: "Failed to create an automatic review unit." });
    }
  }

  for (let index = 0; index < requestedCount; index += 1) {
    const variationTopic = typeof topic === "string" && topic.trim()
      ? `${topic.trim()} variation ${index + 1}`
      : undefined;

    try {
      const validationInput = {
        language: tutorLanguage,
        level: String(level) as Level,
        unitTitle: selectedChapter?.title,
        unitDescription: selectedChapter?.description,
        topic: variationTopic,
        curriculumInstruction: [
          chapterInstruction,
          "Suggest the next coherent unit in the curriculum sequence. Avoid recycled topics with renamed titles."
        ].filter(Boolean).join(" "),
        themeAnchors: extractThemeAnchors({
          unitTitle: selectedChapter?.title,
          unitDescription: selectedChapter?.description,
          topic: variationTopic,
          curriculumInstruction: chapterInstruction
        }),
        existingUnitTitles: existingUnitsInScope.map((item) => item.title).filter(Boolean),
        existingLessonTitles: existingLessons.map((item) => item.title).filter(Boolean)
      };

      let suggestion = null;
      let retryInstruction = "";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const candidate = await llm.suggestLesson({
          language: tutorLanguage,
          level: String(level),
          unitTitle: selectedChapter?.title,
          unitDescription: selectedChapter?.description,
          topic: variationTopic,
          curriculumInstruction: [
            chapterInstruction,
            "Suggest the next coherent unit in the curriculum sequence. Avoid recycled topics with renamed titles.",
            retryInstruction
          ].filter(Boolean).join(" ").trim(),
          existingUnitTitles: validationInput.existingUnitTitles,
          existingLessonTitles: validationInput.existingLessonTitles
        });
        const validation = validateLessonSuggestion(candidate, validationInput);
        if (validation.ok) {
          suggestion = candidate;
          break;
        }
        logAiValidation("tutor-generate-unit", {
          attempt,
          topic: variationTopic,
          title: candidate.title,
          reasons: validation.reasons,
          details: validation.details
        });
        if (attempt < 3) {
          retryInstruction = buildRetryInstruction(validation.reasons);
          logAiRetry("tutor-generate-unit", { attempt, topic: variationTopic, retryInstruction });
        }
      }

      if (!suggestion) {
        skipped.push({ reason: "invalid_suggestion" });
        continue;
      }

      const rawTitle = String(suggestion.title || "").trim();
      if (!rawTitle) {
        errors.push({ index: index + 1, error: "AI returned an empty title." });
        continue;
      }
      if (!isEnglishLikeTitle(rawTitle)) {
        skipped.push({ reason: "non_english_title", title: rawTitle });
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
        chapterId: selectedChapter?.id || null,
        title: rawTitle,
        description: String(suggestion.description || "").trim(),
        language: tutorLanguage,
        level: String(level) as Level,
        orderIndex: lastOrderIndex,
        status: "draft",
        createdBy: userId
      });
      created.push(createdUnit);
      coreCreatedCount += 1;
      pendingCoreUnits.push({ id: createdUnit.id, title: createdUnit.title, kind: createdUnit.kind });
      if (pendingCoreUnits.length === 2) {
        await tryCreateAutoReviewUnit();
      }
    } catch (error) {
      console.error("Tutor AI generateUnitsBulk error", error);
      errors.push({ index: index + 1, error: "Failed to generate this unit." });
    }
  }

  return res.status(201).json({
    totalRequested: requestedCount,
    createdCount: created.length,
    coreCreatedCount,
    reviewCreatedCount,
    skippedCount: skipped.length,
    errorCount: errors.length,
    units: created,
    skipped,
    errors
  });
}

export async function generateExpressions(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId, seedWords, extraInstructions } = req.body ?? {};
  if (lessonId !== undefined && !validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }
  const requestedLevel = req.body?.level;
  if (requestedLevel !== undefined && !isValidLevel(String(requestedLevel))) {
    return res.status(400).json({ error: "invalid level" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const orchestrator = new AiExpressionOrchestrator(expressions, getLlmClient());

  try {
    let lesson: LessonEntity | null = null;
    if (lessonId) {
      lesson = await lessons.findById(String(lessonId));
      if (!lesson || lesson.language !== tutorLanguage) {
        return res.status(404).json({ error: "lesson not found or out of scope" });
      }
    } else {
      if (!requestedLevel || !isValidLevel(String(requestedLevel))) {
        return res.status(400).json({ error: "level is required when no lesson is selected" });
      }
      lesson = buildSyntheticLesson(
        tutorLanguage,
        String(requestedLevel) as Level,
        "Global expression generation",
        "Generate reusable expressions for the language library."
      );
    }

    const created = await orchestrator.generateForLesson({
      lesson,
      seedWords: Array.isArray(seedWords) ? seedWords.map(String) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no new expressions generated" });
    }

    return res.status(201).json({ total: created.length, expressions: created });
  } catch (error) {
    console.error("Tutor AI generateExpressions LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateWords(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId, seedWords, extraInstructions } = req.body ?? {};
  if (lessonId !== undefined && !validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }
  const requestedLevel = req.body?.level;
  if (requestedLevel !== undefined && !isValidLevel(String(requestedLevel))) {
    return res.status(400).json({ error: "invalid level" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const orchestrator = new AiWordOrchestrator(words, getLlmClient());

  try {
    let lesson: LessonEntity | null = null;
    if (lessonId) {
      lesson = await lessons.findById(String(lessonId));
      if (!lesson || lesson.language !== tutorLanguage) {
        return res.status(404).json({ error: "lesson not found or out of scope" });
      }
    } else {
      if (!requestedLevel || !isValidLevel(String(requestedLevel))) {
        return res.status(400).json({ error: "level is required when no lesson is selected" });
      }
      lesson = buildSyntheticLesson(
        tutorLanguage,
        String(requestedLevel) as Level,
        "Global word generation",
        "Generate reusable words for the language library."
      );
    }

    const created = await orchestrator.generateForLesson({
      lesson,
      seedWords: normalizeSeedWords(seedWords),
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no new words generated" });
    }

    return res.status(201).json({ total: created.length, words: created });
  } catch (error) {
    console.error("Tutor AI generateWords LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateSentences(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { lessonId, seedWords, extraInstructions } = req.body ?? {};
  if (lessonId !== undefined && !validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }
  const requestedLevel = req.body?.level;
  if (requestedLevel !== undefined && !isValidLevel(String(requestedLevel))) {
    return res.status(400).json({ error: "invalid level" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) {
    return res.status(403).json({ error: "tutor language not configured" });
  }

  const llm = getLlmClient();
  const orchestrator = new AiSentenceOrchestrator(sentences, words, expressions, llm);

  try {
    const normalizedSeeds = normalizeSeedWords(seedWords);
    let lesson: LessonEntity | null = null;
    let attachToLesson = false;

    if (lessonId) {
      lesson = await lessons.findById(String(lessonId));
      if (!lesson || lesson.language !== tutorLanguage) {
        return res.status(404).json({ error: "lesson not found or out of scope" });
      }
      if (lesson.status === "published") {
        return res.status(409).json({ error: "cannot add draft content to published lesson" });
      }
      attachToLesson = true;
    } else {
      if (!requestedLevel || !isValidLevel(String(requestedLevel))) {
        return res.status(400).json({ error: "level is required when no lesson is selected" });
      }
      lesson = buildSyntheticLesson(
        tutorLanguage,
        String(requestedLevel) as Level,
        "Global sentence generation",
        "Generate reusable sentences for the language library."
      );
    }

    const sentenceDrafts = await orchestrator.draftForLessonPlan({
      lesson,
      extraInstructions: buildThemeInstructions(
        normalizedSeeds,
        typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
      )
    });

    if (sentenceDrafts.length === 0) {
      return res.status(409).json({ error: "no new sentences generated" });
    }

    const persisted = await sentenceDraftPersistence.persist({
      lesson,
      sentenceDrafts,
      modelName: llm.modelName,
      attachToLesson,
      createdBy: attachToLesson ? req.user.id : undefined
    });

    return res.status(201).json({
      total: persisted.sentences.length,
      sentences: persisted.sentences,
      coreWords: persisted.coreWords,
      coreExpressions: persisted.coreExpressions,
      supportWords: persisted.supportWords,
      supportExpressions: persisted.supportExpressions
    });
  } catch (error) {
    console.error("Tutor AI generateSentences LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function enhanceExpression(req: AuthRequest, res: Response) {
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

  const expression = await expressions.findById(id);
  if (!expression) {
    return res.status(404).json({ error: "expression not found" });
  }
  if (expression.status === "published" || expression.status === "finished") {
    return res.status(409).json({ error: "cannot edit non draft" });
  }

  const lessonContentLinks = await lessonContentItems.list({ contentType: "expression", contentId: expression.id });
  const primaryLessonId = lessonContentLinks[0]?.lessonId;
  if (!primaryLessonId) {
    return res.status(400).json({ error: "expression has no lessons" });
  }
  const lesson = await lessons.findById(primaryLessonId);
  if (!lesson || lesson.language !== tutorLanguage) {
    return res.status(404).json({ error: "expression not found or out of scope" });
  }

  const orchestrator = new AiExpressionOrchestrator(expressions, getLlmClient());

  try {
    const updated = await orchestrator.enhanceExpression({
      expression,
      language: tutorLanguage,
      level: lesson.level
    });

    if (!updated) {
      return res.status(422).json({ error: "no valid expression updates" });
    }

    return res.status(200).json({ expression: updated });
  } catch (error) {
    console.error("Tutor AI enhanceExpression LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export const generatePhrases = generateExpressions;
export const enhancePhrase = enhanceExpression;

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
  const {
    mode,
    lessonCount,
    sentencesPerLesson,
    reviewContentPerLesson,
    phrasesPerLesson,
    reviewPhrasesPerLesson,
    proverbsPerLesson,
    topics,
    extraInstructions
  } = req.body ?? {};
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "invalid unit id" });
  }
  if (mode !== undefined && mode !== "generate" && mode !== "regenerate") {
    return res.status(400).json({ error: "mode must be generate or regenerate" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "topics must be an array" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const requestedLessonCount = Number(lessonCount ?? 3);
  const requestedSentencesPerLesson = Number(
    sentencesPerLesson ?? phrasesPerLesson ?? LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  );
  const rawReviewContentPerLesson = reviewContentPerLesson ?? reviewPhrasesPerLesson;
  const requestedReviewContentPerLesson =
    rawReviewContentPerLesson === undefined ? undefined : Number(rawReviewContentPerLesson);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}`
    });
  }
  if (
    requestedReviewContentPerLesson !== undefined &&
    (
      Number.isNaN(requestedReviewContentPerLesson) ||
      requestedReviewContentPerLesson < 0 ||
      requestedReviewContentPerLesson > LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON
    )
  ) {
    return res.status(400).json({
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}`
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
      sentencesPerLesson: clampNewTargetsPerLesson(requestedSentencesPerLesson),
      reviewContentPerLesson: requestedReviewContentPerLesson,
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

export async function previewUnitContentPlan(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { unitId } = req.params;
  const {
    mode,
    lessonCount,
    sentencesPerLesson,
    reviewContentPerLesson,
    phrasesPerLesson,
    reviewPhrasesPerLesson,
    proverbsPerLesson,
    topics,
    extraInstructions
  } = req.body ?? {};
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "invalid unit id" });
  }
  if (mode !== undefined && mode !== "generate" && mode !== "regenerate") {
    return res.status(400).json({ error: "mode must be generate or regenerate" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "topics must be an array" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const requestedLessonCount = Number(lessonCount ?? 3);
  const requestedSentencesPerLesson = Number(
    sentencesPerLesson ?? phrasesPerLesson ?? LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  );
  const rawReviewContentPerLesson = reviewContentPerLesson ?? reviewPhrasesPerLesson;
  const requestedReviewContentPerLesson =
    rawReviewContentPerLesson === undefined ? undefined : Number(rawReviewContentPerLesson);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}`
    });
  }
  if (
    requestedReviewContentPerLesson !== undefined &&
    (
      Number.isNaN(requestedReviewContentPerLesson) ||
      requestedReviewContentPerLesson < 0 ||
      requestedReviewContentPerLesson > LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON
    )
  ) {
    return res.status(400).json({
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}`
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
    const generateInput = {
      unitId: unit.id,
      language: unit.language,
      level: unit.level,
      createdBy: req.user.id,
      lessonCount: requestedLessonCount,
      sentencesPerLesson: clampNewTargetsPerLesson(requestedSentencesPerLesson),
      reviewContentPerLesson: requestedReviewContentPerLesson,
      proverbsPerLesson: requestedProverbsPerLesson,
      topics: Array.isArray(topics) ? topics.map((item) => String(item || "").trim()).filter(Boolean) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    };
    const result =
      mode === "regenerate"
        ? await unitAiContentUseCases.previewRegeneratePlan(generateInput)
        : await unitAiContentUseCases.previewGeneratePlan(generateInput);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Tutor AI previewUnitContentPlan error", error);
    return res.status(502).json({ error: "llm plan generation failed" });
  }
}

export async function applyUnitContentPlan(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { unitId } = req.params;
  const {
    mode,
    lessonCount,
    sentencesPerLesson,
    reviewContentPerLesson,
    phrasesPerLesson,
    reviewPhrasesPerLesson,
    proverbsPerLesson,
    topics,
    extraInstructions,
    planLessons
  } = req.body ?? {};
  if (!unitId || !mongoose.Types.ObjectId.isValid(String(unitId))) {
    return res.status(400).json({ error: "invalid unit id" });
  }
  if (mode !== undefined && mode !== "generate" && mode !== "regenerate") {
    return res.status(400).json({ error: "mode must be generate or regenerate" });
  }
  if (!Array.isArray(planLessons)) {
    return res.status(400).json({ error: "planLessons must be an array" });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "topics must be an array" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const requestedLessonCount = Number(lessonCount ?? 3);
  const requestedSentencesPerLesson = Number(
    sentencesPerLesson ?? phrasesPerLesson ?? LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  );
  const rawReviewContentPerLesson = reviewContentPerLesson ?? reviewPhrasesPerLesson;
  const requestedReviewContentPerLesson =
    rawReviewContentPerLesson === undefined ? undefined : Number(rawReviewContentPerLesson);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}`
    });
  }
  if (
    requestedReviewContentPerLesson !== undefined &&
    (
      Number.isNaN(requestedReviewContentPerLesson) ||
      requestedReviewContentPerLesson < 0 ||
      requestedReviewContentPerLesson > LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON
    )
  ) {
    return res.status(400).json({
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}`
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
    const generateInput = {
      unitId: unit.id,
      language: unit.language,
      level: unit.level,
      createdBy: req.user.id,
      lessonCount: requestedLessonCount,
      sentencesPerLesson: clampNewTargetsPerLesson(requestedSentencesPerLesson),
      reviewContentPerLesson: requestedReviewContentPerLesson,
      proverbsPerLesson: requestedProverbsPerLesson,
      topics: Array.isArray(topics) ? topics.map((item) => String(item || "").trim()).filter(Boolean) : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined,
      planLessons
    };
    const result =
      mode === "regenerate"
        ? await unitAiContentUseCases.regenerateFromApprovedPlan(generateInput)
        : await unitAiContentUseCases.generateFromApprovedPlan(generateInput);

    return res.status(mode === "regenerate" ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof AiPlanValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    console.error("Tutor AI applyUnitContentPlan error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function reviseUnitContent(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { unitId } = req.params;
  const {
    mode,
    lessonCount,
    sentencesPerLesson,
    reviewContentPerLesson,
    phrasesPerLesson,
    reviewPhrasesPerLesson,
    proverbsPerLesson,
    topics,
    extraInstructions
  } = req.body ?? {};
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
  const requestedSentencesPerLesson = Number(
    sentencesPerLesson ?? phrasesPerLesson ?? LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  );
  const rawReviewContentPerLesson = reviewContentPerLesson ?? reviewPhrasesPerLesson;
  const requestedReviewContentPerLesson =
    rawReviewContentPerLesson === undefined ? undefined : Number(rawReviewContentPerLesson);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}`
    });
  }
  if (
    requestedReviewContentPerLesson !== undefined &&
    (
      Number.isNaN(requestedReviewContentPerLesson) ||
      requestedReviewContentPerLesson < 0 ||
      requestedReviewContentPerLesson > LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON
    )
  ) {
    return res.status(400).json({
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}`
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
      sentencesPerLesson: clampNewTargetsPerLesson(requestedSentencesPerLesson),
      reviewContentPerLesson: requestedReviewContentPerLesson,
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
