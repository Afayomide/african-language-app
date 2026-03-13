import type { Request, Response } from "express";
import { getLlmClient } from "../../services/llm/index.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseProverbRepository } from "../../infrastructure/db/mongoose/repositories/MongooseProverbRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { isValidLanguage, isValidLevel } from "../../interfaces/http/validators/ai.validators.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateLessonSuggestion } from "../../services/llm/outputQuality.js";
import { extractThemeAnchors } from "../../services/llm/unitTheme.js";

const lessons = new MongooseLessonRepository();
const phrases = new MongoosePhraseRepository();
const proverbs = new MongooseProverbRepository();
const units = new MongooseUnitRepository();

function isEnglishLikeTitle(value: string) {
  const title = String(value || "").trim();
  if (!title) return false;
  return /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/.test(title);
}

export async function suggestLesson(req: Request, res: Response) {
  const { language, level, topic } = req.body ?? {};

  if (!language || !isValidLanguage(String(language))) {
    return res.status(400).json({ error: "invalid language" });
  }
  if (!level || !isValidLevel(String(level))) {
    return res.status(400).json({ error: "invalid level" });
  }
  if (topic !== undefined && String(topic).trim().length === 0) {
    return res.status(400).json({ error: "invalid topic" });
  }

  const llm = getLlmClient();

  try {
    const [existingUnits, existingLessons, existingPhrases, existingProverbs] = await Promise.all([
      units.listByLanguage(String(language) as "yoruba" | "igbo" | "hausa"),
      lessons.list({ language: String(language) as "yoruba" | "igbo" | "hausa" }),
      phrases.list({ language: String(language) as "yoruba" | "igbo" | "hausa" }),
      proverbs.list({ language: String(language) as "yoruba" | "igbo" | "hausa" })
    ]);
    const curriculumInstruction = "Continue the curriculum progressively. Prioritize conversational utility, repetition, and careful vocabulary load. Do not repeat older curriculum items with renamed titles.";
    const validationInput = {
      language: String(language) as "yoruba" | "igbo" | "hausa",
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
        language: String(language),
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
      logAiValidation("public-suggest-lesson", {
        attempt,
        topic,
        title: candidate.title,
        reasons: validation.reasons,
        details: validation.details
      });
      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
        logAiRetry("public-suggest-lesson", { attempt, retryInstruction });
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
    console.error("AI suggestLesson LLM error", error);
    return res.status(502).json({ error: "llm generation failed" });
  }
}
