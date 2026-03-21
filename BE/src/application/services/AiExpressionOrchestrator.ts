import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
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

function sanitizeGeneratedExpression(phrase: LlmGeneratedPhrase): LlmGeneratedPhrase | null {
  const rawTranslations = Array.isArray(phrase.translations) ? phrase.translations : [];
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

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

export class AiExpressionOrchestrator {
  constructor(
    private readonly expressions: ExpressionRepository,
    private readonly llm: LlmClient
  ) {}

  async generateForLesson(input: {
    lesson: LessonEntity;
    seedWords?: string[];
    extraInstructions?: string;
    maxExpressions?: number;
    existingLessonExpressions?: ExpressionEntity[];
  }) {
    if (typeof input.maxExpressions === "number" && input.maxExpressions <= 0) {
      return [];
    }

    const existingLessonExpressions = input.existingLessonExpressions || [];
    const allLanguageExpressions = await this.expressions.list({ language: input.lesson.language });
    const existingLessonKeys = new Set(existingLessonExpressions.map((item) => normalizeText(item.text)));
    const expressionByText = new Map<string, ExpressionEntity>();
    for (const expression of allLanguageExpressions) {
      const key = normalizeText(expression.text);
      if (!expressionByText.has(key)) expressionByText.set(key, expression);
    }

    const validated = await this.generateValidatedExpressions({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      seedWords: input.seedWords,
      extraInstructions: input.extraInstructions,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      existingPhrases: existingLessonExpressions.map((item) => item.text)
    });

    const batchKeys = new Set<string>();
    const sanitized = validated.accepted
      .map(sanitizeGeneratedExpression)
      .filter((item): item is LlmGeneratedPhrase => Boolean(item))
      .filter((item) => {
        const key = normalizeText(item.text);
        if (existingLessonKeys.has(key) || batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

    const capped = typeof input.maxExpressions === "number"
      ? sanitized.slice(0, Math.max(0, input.maxExpressions))
      : sanitized;

    const createdOrReused: ExpressionEntity[] = [];
    for (const expression of capped) {
      const key = normalizeText(expression.text);
      const existing = expressionByText.get(key);
      if (existing) {
        const translations = Array.from(new Set([...existing.translations, ...expression.translations].filter(Boolean)));
        if (translations.length !== existing.translations.length) {
          const updated = await this.expressions.updateById(existing.id, { translations });
          createdOrReused.push(updated || existing);
        } else {
          createdOrReused.push(existing);
        }
        continue;
      }

      const created = await this.expressions.create({
        language: input.lesson.language,
        text: expression.text,
        textNormalized: normalizeText(expression.text),
        translations: expression.translations,
        pronunciation: expression.pronunciation || "",
        explanation: expression.explanation || "",
        examples: expression.examples || [],
        difficulty: expression.difficulty ?? 1,
        aiMeta: {
          generatedByAI: true,
          model: this.llm.modelName,
          reviewedByAdmin: false
        },
        audio: {
          provider: "",
          model: "",
          voice: "",
          locale: "",
          format: "",
          url: "",
          s3Key: ""
        },
        register: "neutral",
        components: [],
        status: "draft"
      });
      createdOrReused.push(created);
      expressionByText.set(key, created);
    }

    return createdOrReused;
  }

  private async generateValidatedExpressions(input: {
    lessonId?: string;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    lessonTitle?: string;
    lessonDescription?: string;
    seedWords?: string[];
    extraInstructions?: string;
    existingPhrases?: string[];
  }) {
    let retryInstruction = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const generated = await this.llm.generateExpressions({
        lessonId: input.lessonId,
        language: input.language,
        level: input.level,
        lessonTitle: input.lessonTitle,
        lessonDescription: input.lessonDescription,
        seedWords: input.seedWords,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined,
        existingPhrases: input.existingPhrases
      });

      const validation = validateGeneratedPhrases(generated, {
        language: input.language,
        level: input.level,
        existingPhrases: input.existingPhrases || []
      });

      if (validation.accepted.length > 0) return validation;

      logAiValidation("expressions", {
        context: input.lessonId ? "lesson" : "language",
        attempt,
        acceptedCount: validation.accepted.length,
        rejectedCount: validation.rejected.length,
        sampleRejected: validation.rejected.slice(0, 3).map((item) => ({
          text: item.item.text,
          translations: item.item.translations,
          reasons: item.reasons
        }))
      });

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.rejected.flatMap((item) => item.reasons));
        logAiRetry("expressions", {
          attempt,
          lessonId: input.lessonId,
          retryInstruction
        });
      }
    }

    return { accepted: [], rejected: [] };
  }

  async enhanceExpression(input: {
    expression: ExpressionEntity;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
  }) {
    const updates = await this.llm.enhanceExpression({
      text: input.expression.text,
      translations: input.expression.translations,
      language: input.language,
      level: input.level
    });

    const sanitized = sanitizeGeneratedExpression({
      text: input.expression.text,
      translations: input.expression.translations,
      pronunciation: updates.pronunciation,
      explanation: updates.explanation,
      examples: updates.examples,
      difficulty: updates.difficulty
    });
    if (!sanitized) return null;

    return this.expressions.updateById(input.expression.id, {
      translations: input.expression.translations,
      pronunciation: sanitized.pronunciation || input.expression.pronunciation,
      explanation: sanitized.explanation || input.expression.explanation,
      examples:
        sanitized.examples && sanitized.examples.length > 0
          ? sanitized.examples
          : input.expression.examples,
      difficulty:
        sanitized.difficulty !== undefined ? sanitized.difficulty : input.expression.difficulty,
      aiMeta: {
        generatedByAI: true,
        model: this.llm.modelName,
        reviewedByAdmin: false
      }
    });
  }
}
