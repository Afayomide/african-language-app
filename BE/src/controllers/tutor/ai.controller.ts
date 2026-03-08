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
    const existingPhrases = await phrases.list({ language: tutorLanguage });
    const existingProverbs = await proverbs.list({ language: tutorLanguage });
    const suggestion = await llm.suggestLesson({
      language: tutorLanguage,
      level: String(level),
      topic: topic ? String(topic) : undefined,
      curriculumInstruction:
        "Continue the curriculum progressively. Do not repeat old lesson topics with new titles.",
      existingLessonTitles: existingLessons.map((item) => item.title).filter(Boolean),
      existingPhraseTexts: existingPhrases.map((item) => item.text).filter(Boolean),
      existingProverbTexts: existingProverbs.map((item) => item.text).filter(Boolean)
    });

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
    console.error("Tutor AI generateProverbs LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}

export async function generateUnitContent(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { unitId } = req.params;
  const { lessonCount, phrasesPerLesson, proverbsPerLesson, topics, extraInstructions } = req.body ?? {};
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
  const requestedPhrasesPerLesson = Number(phrasesPerLesson ?? 8);
  const requestedProverbsPerLesson = Number(proverbsPerLesson ?? 2);
  if (Number.isNaN(requestedLessonCount) || requestedLessonCount < 1 || requestedLessonCount > 20) {
    return res.status(400).json({ error: "lessonCount must be between 1 and 20" });
  }
  if (Number.isNaN(requestedPhrasesPerLesson) || requestedPhrasesPerLesson < 2 || requestedPhrasesPerLesson > 30) {
    return res.status(400).json({ error: "phrasesPerLesson must be between 2 and 30" });
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
      phrasesPerLesson: requestedPhrasesPerLesson,
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
