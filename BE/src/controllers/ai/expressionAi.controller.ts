import type { Request, Response } from "express";
import mongoose from "mongoose";
import { getLlmClient } from "../../services/llm/index.js";
import type { LessonEntity, Level, Language } from "../../domain/entities/Lesson.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { AiExpressionOrchestrator } from "../../application/services/AiExpressionOrchestrator.js";
import { AiWordOrchestrator } from "../../application/services/AiWordOrchestrator.js";
import { AiSentenceOrchestrator } from "../../application/services/AiSentenceOrchestrator.js";
import { SentenceDraftPersistenceService } from "../../application/services/SentenceDraftPersistenceService.js";
import { isValidLanguage, isValidLevel, validateLessonId } from "../../interfaces/http/validators/ai.validators.js";

const lessons = new MongooseLessonRepository();
const expressions = new MongooseExpressionRepository();
const words = new MongooseWordRepository();
const sentences = new MongooseSentenceRepository();
const lessonContentItems = new MongooseLessonContentItemRepository();
const sentenceDraftPersistence = new SentenceDraftPersistenceService(
  words,
  expressions,
  sentences,
  lessonContentItems
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

export async function generateExpressions(req: Request, res: Response) {
  const { lessonId, language, level, seedWords, extraInstructions } = req.body ?? {};

  if (lessonId !== undefined && !validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (language !== undefined && !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (level !== undefined && !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const orchestrator = new AiExpressionOrchestrator(expressions, getLlmClient());

  try {
    let lesson: LessonEntity | null = null;
    if (lessonId) {
      lesson = await lessons.findById(String(lessonId));
      if (!lesson) {
        return res.status(404).json({ error: "lesson not found" });
      }
      if (language && language !== lesson.language) {
        return res.status(400).json({ error: "lesson language mismatch" });
      }
      if (level && level !== lesson.level) {
        return res.status(400).json({ error: "lesson level mismatch" });
      }
    } else {
      if (!language || !isValidLanguage(String(language))) {
        return res.status(400).json({ error: "language is required when no lesson is selected" });
      }
      if (!level || !isValidLevel(String(level))) {
        return res.status(400).json({ error: "level is required when no lesson is selected" });
      }
      lesson = buildSyntheticLesson(
        String(language) as Language,
        String(level) as Level,
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
    console.error("AI generateExpressions LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateWords(req: Request, res: Response) {
  const { lessonId, language, level, seedWords, extraInstructions } = req.body ?? {};

  if (lessonId !== undefined && !validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (language !== undefined && !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (level !== undefined && !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const orchestrator = new AiWordOrchestrator(words, getLlmClient());

  try {
    let lesson: LessonEntity | null = null;
    if (lessonId) {
      lesson = await lessons.findById(String(lessonId));
      if (!lesson) {
        return res.status(404).json({ error: "lesson not found" });
      }
      if (language && language !== lesson.language) {
        return res.status(400).json({ error: "lesson language mismatch" });
      }
      if (level && level !== lesson.level) {
        return res.status(400).json({ error: "lesson level mismatch" });
      }
    } else {
      if (!language || !isValidLanguage(String(language))) {
        return res.status(400).json({ error: "language is required when no lesson is selected" });
      }
      if (!level || !isValidLevel(String(level))) {
        return res.status(400).json({ error: "level is required when no lesson is selected" });
      }
      lesson = buildSyntheticLesson(
        String(language) as Language,
        String(level) as Level,
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
    console.error("AI generateWords LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateSentences(req: Request, res: Response) {
  const { lessonId, language, level, seedWords, extraInstructions } = req.body ?? {};

  if (lessonId !== undefined && !validateLessonId(lessonId)) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (language !== undefined && !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (level !== undefined && !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (seedWords !== undefined && !Array.isArray(seedWords)) {
    return res.status(400).json({ error: "invalid seed words" });
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== "string") {
    return res.status(400).json({ error: "invalid extra instructions" });
  }

  const llm = getLlmClient();
  const orchestrator = new AiSentenceOrchestrator(sentences, words, expressions, llm);

  try {
    const normalizedSeeds = normalizeSeedWords(seedWords);
    let lesson: LessonEntity | null = null;
    let attachToLesson = false;

    if (lessonId) {
      lesson = await lessons.findById(String(lessonId));
      if (!lesson) {
        return res.status(404).json({ error: "lesson not found" });
      }
      if (language && language !== lesson.language) {
        return res.status(400).json({ error: "lesson language mismatch" });
      }
      if (level && level !== lesson.level) {
        return res.status(400).json({ error: "lesson level mismatch" });
      }
      if (lesson.status === "published") {
        return res.status(409).json({ error: "cannot add draft content to published lesson" });
      }
      attachToLesson = true;
    } else {
      if (!language || !isValidLanguage(String(language))) {
        return res.status(400).json({ error: "language is required when no lesson is selected" });
      }
      if (!level || !isValidLevel(String(level))) {
        return res.status(400).json({ error: "level is required when no lesson is selected" });
      }

      lesson = buildSyntheticLesson(
        String(language) as Language,
        String(level) as Level,
        "Global sentence generation",
        "Generate reusable sentences for the language library."
      );
    }

    const sentenceDrafts = await orchestrator.draftForLessonPlan({
      lesson,
      existingLessonSentences: attachToLesson ? [] : undefined,
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
      createdBy: attachToLesson ? lesson.createdBy : undefined
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
    console.error("AI generateSentences LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function enhanceExpression(req: Request, res: Response) {
  const { id } = req.params;
  const { language, level } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }

  const expression = await expressions.findById(id);
  if (!expression) {
    return res.status(404).json({ error: "expression not found" });
  }
  if (expression.status === "published" || expression.status === "finished") {
    return res.status(409).json({ error: "cannot edit non draft" });
  }

  const orchestrator = new AiExpressionOrchestrator(expressions, getLlmClient());

  try {
    const updated = await orchestrator.enhanceExpression({
      expression,
      language: String(language) as "yoruba" | "igbo" | "hausa",
      level: String(level) as "beginner" | "intermediate" | "advanced"
    });

    if (!updated) {
      return res.status(422).json({ error: "no valid expression updates" });
    }

    return res.status(200).json({ expression: updated });
  } catch (error) {
    console.error("AI enhanceExpression LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}
