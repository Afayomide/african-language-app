import type { Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminLessonAiUseCases } from "../../application/use-cases/admin/lesson-ai/AdminLessonAiUseCases.js";
import { AdminUnitAiContentUseCases, AiPlanValidationError } from "../../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import { ChapterAiUseCases } from "../../application/use-cases/shared/ChapterAiUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseUnitContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitContentItemRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { isValidLevel } from "../../interfaces/http/validators/ai.validators.js";
import type { Level } from "../../domain/entities/Lesson.js";
import {
  LESSON_GENERATION_LIMITS,
  clampNewTargetsPerLesson
} from "../../config/lessonGeneration.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateLessonSuggestion } from "../../services/llm/outputQuality.js";
import {
  buildAutoReviewUnitDescription,
  buildAutoReviewUnitTitle,
  getTrailingCoreUnitsSinceLastReview
} from "../../application/services/reviewUnitScheduling.js";

const lessons = new MongooseLessonRepository();
const lessonContentItems = new MongooseLessonContentItemRepository();
const expressions = new MongooseExpressionRepository();
const units = new MongooseUnitRepository();
const chapters = new MongooseChapterRepository();
const useCases = new AdminLessonAiUseCases(
  lessons,
  lessonContentItems,
  expressions,
  new MongooseProverbRepository(),
  units,
  getLlmClient()
);
const chapterAiUseCases = new ChapterAiUseCases(chapters, getLlmClient());
const unitAiContentUseCases = new AdminUnitAiContentUseCases(
  lessons,
  new MongooseWordRepository(),
  expressions,
  new MongooseSentenceRepository(),
  new MongooseChapterRepository(),
  lessonContentItems,
  new MongooseUnitContentItemRepository(),
  new MongooseProverbRepository(),
  new MongooseQuestionRepository(),
  units,
  getLlmClient()
);

function isEnglishLikeTitle(value: string) {
  const title = String(value || "").trim();
  if (!title) return false;
  const latinPattern = /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/;
  return latinPattern.test(title);
}

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
  const userId = req.user.id;

  const { language, level, count, topic, chapterId } = req.body ?? {};

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
  if (chapterId !== undefined && chapterId !== null && chapterId !== "" && typeof chapterId !== "string") {
    return res.status(400).json({ error: "Chapter id is invalid." });
  }

  let selectedChapter = null;
  if (chapterId) {
    selectedChapter = await chapters.findById(String(chapterId));
    if (!selectedChapter || selectedChapter.language !== String(language)) {
      return res.status(400).json({ error: "Chapter is invalid for this language." });
    }
  }

  const llm = getLlmClient();
  const existingUnits = await units.listByLanguage(String(language) as "yoruba" | "igbo" | "hausa");
  const existingLessons = await lessons.list({ language: String(language) as "yoruba" | "igbo" | "hausa" });
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

  const created = [];
  const skipped: Array<{ reason: string; title?: string }> = [];
  const errors: Array<{ index: number; error: string }> = [];
  const chapterInstruction = selectedChapter
    ? `Generate units for the chapter "${selectedChapter.title}". Chapter description: ${selectedChapter.description || "No description provided."}`
    : "";
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
      language: String(language) as "yoruba" | "igbo" | "hausa",
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
      console.error("Admin AI generateUnitsBulk auto review unit error", error);
      errors.push({ index: 0, error: "Failed to create an automatic review unit." });
    }
  }

  for (let index = 0; index < requestedCount; index += 1) {
    const variationTopic = typeof topic === "string" && topic.trim()
      ? `${topic.trim()} variation ${index + 1}`
      : undefined;

    try {
      const validationInput = {
        language: String(language) as "yoruba" | "igbo" | "hausa",
        level: String(level) as Level,
        unitTitle: selectedChapter?.title,
        unitDescription: selectedChapter?.description,
        topic: variationTopic,
        curriculumInstruction: [
          chapterInstruction,
          "Suggest the next coherent unit in the curriculum sequence. Avoid recycled topics with renamed titles."
        ].filter(Boolean).join(" "),
        existingUnitTitles: existingUnitsInScope.map((item) => item.title).filter(Boolean),
        existingLessonTitles: existingLessons.map((item) => item.title).filter(Boolean)
      };
      let suggestion = null;
      let retryInstruction = "";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const candidate = await llm.suggestLesson({
          language: String(language),
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
        logAiValidation("admin-generate-unit", {
          attempt,
          topic: variationTopic,
          title: candidate.title,
          reasons: validation.reasons,
          details: validation.details
        });
        if (attempt < 3) {
          retryInstruction = buildRetryInstruction(validation.reasons);
          logAiRetry("admin-generate-unit", { attempt, topic: variationTopic, retryInstruction });
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
        language: String(language) as "yoruba" | "igbo" | "hausa",
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
      console.error("Admin AI generateUnitsBulk error", error);
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

export async function generateChaptersBulk(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { language, level, count, topic, extraInstructions } = req.body ?? {};
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
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions are invalid." });
  }

  try {
    const result = await chapterAiUseCases.generateBulk({
      language: String(language) as "yoruba" | "igbo" | "hausa",
      level: String(level) as Level,
      count: requestedCount,
      topic: typeof topic === "string" ? topic.trim() : undefined,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined,
      createdBy: req.user.id
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error("Admin AI generateChaptersBulk error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
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

  try {
    const created = await useCases.generateLessonProverbs({
      lesson,
      count: requestedCount,
      extraInstructions: typeof extraInstructions === "string" ? extraInstructions.trim() : undefined
    });

    if (created.length === 0) {
      return res.status(409).json({ error: "no new proverbs generated" });
    }
    return res.status(201).json({ total: created.length, proverbs: created });
  } catch (error) {
    console.error("Admin AI generateProverbs LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateUnitContent(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

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

  if (!unitId || typeof unitId !== "string") {
    return res.status(400).json({ error: "Unit id is required." });
  }
  if (mode !== undefined && mode !== "generate" && mode !== "regenerate") {
    return res.status(400).json({ error: "Mode must be generate or regenerate." });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "Topics must be an array." });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions must be a string." });
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
    return res.status(400).json({ error: "lessonCount must be between 1 and 20." });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}.`
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
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}.`
    });
  }
  if (Number.isNaN(requestedProverbsPerLesson) || requestedProverbsPerLesson < 0 || requestedProverbsPerLesson > 10) {
    return res.status(400).json({ error: "proverbsPerLesson must be between 0 and 10." });
  }

  const unit = await units.findById(String(unitId));
  if (!unit) {
    return res.status(404).json({ error: "Unit not found." });
  }
  if (!isValidLevel(String(unit.level))) {
    return res.status(400).json({ error: "Unit level is invalid." });
  }

  try {
    const result = await unitAiContentUseCases.generate({
      unitId: unit.id,
      language: unit.language,
      level: String(unit.level) as Level,
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
    console.error("Admin AI generateUnitContent error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function previewUnitContentPlan(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

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

  if (!unitId || typeof unitId !== "string") {
    return res.status(400).json({ error: "Unit id is required." });
  }
  if (mode !== undefined && mode !== "generate" && mode !== "regenerate") {
    return res.status(400).json({ error: "Mode must be generate or regenerate." });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "Topics must be an array." });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions must be a string." });
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
    return res.status(400).json({ error: "lessonCount must be between 1 and 20." });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}.`
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
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}.`
    });
  }
  if (Number.isNaN(requestedProverbsPerLesson) || requestedProverbsPerLesson < 0 || requestedProverbsPerLesson > 10) {
    return res.status(400).json({ error: "proverbsPerLesson must be between 0 and 10." });
  }

  const unit = await units.findById(String(unitId));
  if (!unit) {
    return res.status(404).json({ error: "Unit not found." });
  }
  if (!isValidLevel(String(unit.level))) {
    return res.status(400).json({ error: "Unit level is invalid." });
  }

  try {
    const generateInput = {
      unitId: unit.id,
      language: unit.language,
      level: String(unit.level) as Level,
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
    console.error("Admin AI previewUnitContentPlan error", error);
    return res.status(502).json({ error: "llm plan generation failed" });
  }
}

export async function applyUnitContentPlan(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

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

  if (!unitId || typeof unitId !== "string") {
    return res.status(400).json({ error: "Unit id is required." });
  }
  if (mode !== undefined && mode !== "generate" && mode !== "regenerate") {
    return res.status(400).json({ error: "Mode must be generate or regenerate." });
  }
  if (!Array.isArray(planLessons)) {
    return res.status(400).json({ error: "planLessons must be an array." });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "Topics must be an array." });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions must be a string." });
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
    return res.status(400).json({ error: "lessonCount must be between 1 and 20." });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}.`
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
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}.`
    });
  }
  if (Number.isNaN(requestedProverbsPerLesson) || requestedProverbsPerLesson < 0 || requestedProverbsPerLesson > 10) {
    return res.status(400).json({ error: "proverbsPerLesson must be between 0 and 10." });
  }

  const unit = await units.findById(String(unitId));
  if (!unit) {
    return res.status(404).json({ error: "Unit not found." });
  }
  if (!isValidLevel(String(unit.level))) {
    return res.status(400).json({ error: "Unit level is invalid." });
  }

  try {
    const generateInput = {
      unitId: unit.id,
      language: unit.language,
      level: String(unit.level) as Level,
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
    console.error("Admin AI applyUnitContentPlan error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function reviseUnitContent(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

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

  if (!unitId || typeof unitId !== "string") {
    return res.status(400).json({ error: "Unit id is required." });
  }
  if (mode !== "refactor" && mode !== "regenerate") {
    return res.status(400).json({ error: "Mode must be refactor or regenerate." });
  }
  if (topics !== undefined && !Array.isArray(topics)) {
    return res.status(400).json({ error: "Topics must be an array." });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions must be a string." });
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
    return res.status(400).json({ error: "lessonCount must be between 1 and 20." });
  }
  if (
    Number.isNaN(requestedSentencesPerLesson) ||
    requestedSentencesPerLesson < LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON ||
    requestedSentencesPerLesson > LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON
  ) {
    return res.status(400).json({
      error: `sentencesPerLesson must be between ${LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON} and ${LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON}.`
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
      error: `reviewContentPerLesson must be between 0 and ${LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON}.`
    });
  }
  if (Number.isNaN(requestedProverbsPerLesson) || requestedProverbsPerLesson < 0 || requestedProverbsPerLesson > 10) {
    return res.status(400).json({ error: "proverbsPerLesson must be between 0 and 10." });
  }

  const unit = await units.findById(String(unitId));
  if (!unit) {
    return res.status(404).json({ error: "Unit not found." });
  }
  if (!isValidLevel(String(unit.level))) {
    return res.status(400).json({ error: "Unit level is invalid." });
  }

  try {
    const result = await unitAiContentUseCases.revise({
      mode,
      unitId: unit.id,
      language: unit.language,
      level: String(unit.level) as Level,
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
    console.error("Admin AI reviseUnitContent error", error);
    return res.status(502).json({ error: "llm revision failed" });
  }
}

export async function refactorLessonContent(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { lessonId } = req.params;
  const { topic, extraInstructions } = req.body ?? {};

  if (!lessonId || typeof lessonId !== "string") {
    return res.status(400).json({ error: "Lesson id is required." });
  }
  if (topic !== undefined && typeof topic !== "string") {
    return res.status(400).json({ error: "Topic must be a string." });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "Extra instructions must be a string." });
  }

  const lesson = await lessons.findById(String(lessonId));
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found." });
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
    console.error("Admin AI refactorLessonContent error", error);
    return res.status(502).json({ error: "llm lesson refactor failed" });
  }
}
