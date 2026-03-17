import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../domain/entities/Phrase.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";
import type { LlmClient, LlmGeneratedPhrase } from "../../services/llm/types.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateGeneratedPhrases } from "../../services/llm/outputQuality.js";

function isValidExamples(examples: unknown) {
  if (!Array.isArray(examples)) return false;
  return examples.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as { original?: string }).original === "string" &&
      typeof (item as { translation?: string }).translation === "string"
  );
}

function sanitizePhrase(phrase: LlmGeneratedPhrase): LlmGeneratedPhrase | null {
  const rawTranslations = Array.isArray(phrase.translations)
    ? phrase.translations
    : [];
  const translations = Array.from(
    new Set(
      rawTranslations
        .flatMap((item) => String(item || "").split("/"))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
  if (!phrase.text || translations.length === 0) return null;

  const result: LlmGeneratedPhrase = {
    text: String(phrase.text).trim(),
    translations
  };

  if (phrase.pronunciation) result.pronunciation = String(phrase.pronunciation).trim();
  if (phrase.explanation) result.explanation = String(phrase.explanation).trim();

  if (phrase.examples && isValidExamples(phrase.examples)) {
    result.examples = phrase.examples.map((ex) => ({
      original: String(ex.original).trim(),
      translation: String(ex.translation).trim()
    }));
  }

  if (phrase.difficulty !== undefined) {
    const value = Number(phrase.difficulty);
    if (!Number.isNaN(value) && value >= 1 && value <= 5) {
      result.difficulty = value;
    }
  }

  return result;
}

function normalizePhraseText(text: string) {
  return text.trim().toLowerCase();
}

function wordCount(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function isSentenceLike(value: string) {
  return /[.!?]/.test(value.trim());
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rankByBeginnerOverlap(
  phrases: LlmGeneratedPhrase[],
  beginnerLexicon: Set<string>
) {
  if (beginnerLexicon.size === 0) return phrases;

  return [...phrases].sort((a, b) => {
    const aTokens = tokenize(a.text);
    const bTokens = tokenize(b.text);
    const aOverlap = aTokens.some((token) => beginnerLexicon.has(token)) ? 1 : 0;
    const bOverlap = bTokens.some((token) => beginnerLexicon.has(token)) ? 1 : 0;
    if (aOverlap !== bOverlap) return bOverlap - aOverlap;
    return wordCount(a.text) - wordCount(b.text);
  });
}

function applyLevelPhrasePolicy(
  level: LessonEntity["level"],
  phrases: LlmGeneratedPhrase[]
) {
  if (level === "advanced") return phrases;

  if (level === "beginner") {
    const strict = phrases.filter((item) => {
      const words = wordCount(item.text);
      return words >= 1 && words <= 2 && !isSentenceLike(item.text);
    });
    if (strict.length > 0) return strict;
  }

  if (level === "intermediate") {
    const strict = phrases.filter((item) => {
      const words = wordCount(item.text);
      return words >= 1 && words <= 5;
    });
    if (strict.length > 0) return strict;
  }

  return [...phrases].sort((a, b) => wordCount(a.text) - wordCount(b.text));
}

export class AiPhraseOrchestrator {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly llm: LlmClient
  ) {}

  async generateForLesson(input: {
    lesson: LessonEntity;
    seedWords?: string[];
    extraInstructions?: string;
    maxPhrases?: number;
  }) {
    const existingPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const allLanguagePhrases = await this.phrases.list({ language: input.lesson.language });
    const existingKeys = new Set(
      existingPhrases.map((phrase) => normalizePhraseText(phrase.text))
    );
    const phraseByText = new Map<string, PhraseEntity>();
    for (const phrase of allLanguagePhrases) {
      const textKey = normalizePhraseText(phrase.text);
      if (!phraseByText.has(textKey)) {
        phraseByText.set(textKey, phrase);
      }
    }

    const beginnerWordBank = await this.getBeginnerWordBank(input.lesson.language);
    const progressionInstructions =
      input.lesson.level === "beginner"
        ? ""
        : beginnerWordBank.length > 0
          ? [
              "Build on beginner vocabulary as much as possible.",
              "Use at least one beginner word in most generated items when natural.",
              `Beginner vocabulary to reuse: ${beginnerWordBank.slice(0, 80).join(", ")}`
            ].join(" ")
          : "";

    const baseRequest = {
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      seedWords: input.seedWords,
      extraInstructions: [input.extraInstructions || "", progressionInstructions].filter(Boolean).join(" "),
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      existingPhrases: existingPhrases.map((phrase) => phrase.text)
    } as const;
    const validated = await this.generateValidatedPhrases("lesson", baseRequest);

    const levelAdjusted = applyLevelPhrasePolicy(input.lesson.level, validated.accepted);
    const ranked = rankByBeginnerOverlap(levelAdjusted, new Set(beginnerWordBank.map((item) => item.toLowerCase())));
    const uniqueInBatch = new Set<string>();
    const sanitized = ranked
      .map(sanitizePhrase)
      .filter((item): item is LlmGeneratedPhrase => Boolean(item))
      .filter((item) => {
        const key = normalizePhraseText(item.text);
        if (existingKeys.has(key) || uniqueInBatch.has(key)) return false;
        uniqueInBatch.add(key);
        return true;
      });
    const capped = input.maxPhrases && input.maxPhrases > 0
      ? sanitized.slice(0, input.maxPhrases)
      : sanitized;

    if (capped.length === 0) return [];

    const createdOrLinked: PhraseEntity[] = [];
    for (const phrase of capped) {
      const textKey = normalizePhraseText(phrase.text);
      const existingByText = phraseByText.get(textKey);
      if (existingByText) {
        const lessonIds = existingByText.lessonIds.includes(input.lesson.id)
          ? existingByText.lessonIds
          : Array.from(new Set([...existingByText.lessonIds, input.lesson.id]));
        const translations = Array.from(
          new Set([...existingByText.translations, ...phrase.translations].filter(Boolean))
        );
        if (
          lessonIds.length !== existingByText.lessonIds.length ||
          translations.length !== existingByText.translations.length
        ) {
          const updated = await this.phrases.updateById(existingByText.id, { lessonIds, translations });
          if (updated) {
            createdOrLinked.push(updated);
            phraseByText.set(textKey, updated);
          } else {
            createdOrLinked.push(existingByText);
          }
        } else {
          createdOrLinked.push(existingByText);
        }
        continue;
      }

      const item = await this.phrases.create({
        lessonIds: [input.lesson.id],
        language: input.lesson.language,
        text: phrase.text,
        translations: phrase.translations,
        pronunciation: phrase.pronunciation || "",
        explanation: phrase.explanation || "",
        examples: phrase.examples || [],
        difficulty: phrase.difficulty ?? 1,
        status: "draft",
        aiMeta: {
          generatedByAI: true,
          model: this.llm.modelName,
          reviewedByAdmin: false
        }
      });
      createdOrLinked.push(item);
      phraseByText.set(textKey, item);
    }
    return createdOrLinked;
  }

  async generateForLanguage(input: {
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    seedWords?: string[];
    extraInstructions?: string;
  }) {
    const beginnerWordBank = await this.getBeginnerWordBank(input.language);
    const progressionInstructions =
      input.level === "beginner"
        ? ""
        : beginnerWordBank.length > 0
          ? [
              "Build on beginner vocabulary as much as possible.",
              "Use at least one beginner word in most generated items when natural.",
              `Beginner vocabulary to reuse: ${beginnerWordBank.slice(0, 80).join(", ")}`
            ].join(" ")
          : "";

    const existingPhrases = await this.phrases.list({ language: input.language });
    const existingKeys = new Set(
      existingPhrases.map((phrase) => normalizePhraseText(phrase.text))
    );

    const baseRequest = {
      language: input.language,
      level: input.level,
      seedWords: input.seedWords,
      extraInstructions: [input.extraInstructions || "", progressionInstructions].filter(Boolean).join(" "),
      lessonTitle: "General phrases",
      lessonDescription: "Phrases not attached to a lesson yet",
      existingPhrases: existingPhrases.map((phrase) => phrase.text)
    } as const;
    const validated = await this.generateValidatedPhrases("language", baseRequest);

    const levelAdjusted = applyLevelPhrasePolicy(input.level, validated.accepted);
    const ranked = rankByBeginnerOverlap(levelAdjusted, new Set(beginnerWordBank.map((item) => item.toLowerCase())));
    const uniqueInBatch = new Set<string>();
    const sanitized = ranked
      .map(sanitizePhrase)
      .filter((item): item is LlmGeneratedPhrase => Boolean(item))
      .filter((item) => {
        const key = normalizePhraseText(item.text);
        if (existingKeys.has(key) || uniqueInBatch.has(key)) return false;
        uniqueInBatch.add(key);
        return true;
      });

    if (sanitized.length === 0) return [];

    const created: PhraseEntity[] = [];
    for (const phrase of sanitized) {
      const item = await this.phrases.create({
        lessonIds: [],
        language: input.language,
        text: phrase.text,
        translations: phrase.translations,
        pronunciation: phrase.pronunciation || "",
        explanation: phrase.explanation || "",
        examples: phrase.examples || [],
        difficulty: phrase.difficulty ?? 1,
        status: "draft",
        aiMeta: {
          generatedByAI: true,
          model: this.llm.modelName,
          reviewedByAdmin: false
        }
      });
      created.push(item);
    }
    return created;
  }

  private async generateValidatedPhrases(context: "lesson" | "language", input: {
    lessonId?: string;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    seedWords?: string[];
    extraInstructions?: string;
    lessonTitle?: string;
    lessonDescription?: string;
    existingPhrases?: string[];
  }) {
    let retryInstruction = "";

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const request = {
        ...input,
        extraInstructions: [input.extraInstructions || "", retryInstruction].filter(Boolean).join(" ").trim() || undefined
      };
      const raw = await this.llm.generatePhrases(request);
      const validated = validateGeneratedPhrases(raw, request);

      if (validated.rejected.length > 0) {
        logAiValidation("phrases", {
          context,
          attempt,
          acceptedCount: validated.accepted.length,
          rejectedCount: validated.rejected.length,
          sampleRejected: validated.rejected.slice(0, 5).map((item) => ({
            text: item.item.text,
            translations: item.item.translations,
            reasons: item.reasons
          }))
        });
      }

      if (validated.accepted.length > 0) {
        return validated;
      }

      if (attempt < 2) {
        const reasons = validated.rejected.flatMap((item) => item.reasons);
        retryInstruction = buildRetryInstruction(reasons);
        logAiRetry("phrases", { context, attempt, retryInstruction });
      }
    }

    return { accepted: [], rejected: [] };
  }

  async enhancePhrase(input: {
    phrase: PhraseEntity;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
  }) {
    const updates = await this.llm.enhancePhrase({
      text: input.phrase.text,
      translations: input.phrase.translations,
      language: input.language,
      level: input.level
    });

    const sanitized = sanitizePhrase({
      text: input.phrase.text,
      translations: input.phrase.translations,
      pronunciation: updates.pronunciation,
      explanation: updates.explanation,
      examples: updates.examples,
      difficulty: updates.difficulty
    });
    if (!sanitized) return null;

    return this.phrases.updateById(input.phrase.id, {
      translations: input.phrase.translations,
      pronunciation: sanitized.pronunciation || input.phrase.pronunciation,
      explanation: sanitized.explanation || input.phrase.explanation,
      examples: sanitized.examples && sanitized.examples.length > 0 ? sanitized.examples : input.phrase.examples,
      difficulty: sanitized.difficulty !== undefined ? sanitized.difficulty : input.phrase.difficulty,
      aiMeta: {
        generatedByAI: true,
        model: this.llm.modelName,
        reviewedByAdmin: false
      }
    });
  }

  private async getBeginnerWordBank(language: LessonEntity["language"]) {
    const lessons = await this.lessons.list({ language });
    const beginnerLessonIds = lessons
      .filter((lesson) => lesson.level === "beginner")
      .map((lesson) => lesson.id);
    if (beginnerLessonIds.length === 0) return [];

    const phrases = await this.phrases.list({ lessonIds: beginnerLessonIds });
    const words = new Set<string>();
    for (const phrase of phrases) {
      for (const token of tokenize(phrase.text)) {
        if (token.length < 2) continue;
        words.add(token);
      }
    }
    return [...words].slice(0, 200);
  }
}
