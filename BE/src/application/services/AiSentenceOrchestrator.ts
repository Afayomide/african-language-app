import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type {
  GenerateSentencesInput,
  LlmClient,
  LlmGeneratedSentence
} from "../../services/llm/types.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateGeneratedSentences } from "../../services/llm/outputQuality.js";

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferComponentType(text: string): "word" | "expression" {
  return splitWords(text).length <= 1 ? "word" : "expression";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

export function sanitizeGeneratedSentence(sentence: LlmGeneratedSentence): LlmGeneratedSentence | null {
  const text = String(sentence.text || "").trim();
  const translations = uniqueStrings(
    Array.isArray(sentence.translations) ? sentence.translations : []
  );
  const components = Array.isArray(sentence.components)
    ? sentence.components
        .map((component) => ({
          text: String(component?.text || "").trim(),
          type: inferComponentType(String(component?.text || "").trim()),
          translations: uniqueStrings(Array.isArray(component?.translations) ? component.translations : []),
          role: (component?.role === "support" ? "support" : "core") as "core" | "support"
        }))
        .filter((component) => component.text && component.translations.length > 0)
    : [];

  if (!text || translations.length === 0 || components.length === 0) return null;

  return {
    text,
    translations,
    literalTranslation: String(sentence.literalTranslation || "").trim(),
    usageNotes: String(sentence.usageNotes || "").trim(),
    explanation: String(sentence.explanation || "").trim(),
    components
  };
}

export class AiSentenceOrchestrator {
  constructor(
    private readonly sentences: SentenceRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly llm: LlmClient
  ) {}

  async generateForLesson(input: {
    lesson: LessonEntity;
    expressions: ExpressionEntity[];
    words?: WordEntity[];
    maxSentences?: number;
    extraInstructions?: string;
    existingLessonSentences?: SentenceEntity[];
  }) {
    if (typeof input.maxSentences === "number" && input.maxSentences <= 0) {
      return [];
    }

    const existingLessonSentences = input.existingLessonSentences || [];
    const existingLanguageSentences = await this.sentences.list({ language: input.lesson.language });
    const expressionMap = new Map(
      input.expressions.map((expression) => [normalizeText(expression.text), expression] as const)
    );
    const wordMap = new Map(
      (input.words || []).map((word) => [normalizeText(word.text), word] as const)
    );

    const validated = await this.generateValidatedSentences({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      allowedExpressions: input.expressions.map((expression) => ({
        text: expression.text,
        translations: expression.translations
      })),
      allowedWords: (input.words || []).map((word) => ({
        text: word.text,
        translations: word.translations
      })),
      maxSentences: input.maxSentences,
      extraInstructions: input.extraInstructions,
      existingSentences: existingLanguageSentences.map((sentence) => sentence.text)
    });

    const batchKeys = new Set<string>();
    const sanitized = validated.accepted
      .map(sanitizeGeneratedSentence)
      .filter((item): item is LlmGeneratedSentence => Boolean(item))
      .filter((item) => {
        const key = normalizeText(item.text);
        if (batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

    const capped = typeof input.maxSentences === "number"
      ? sanitized.slice(0, Math.max(0, input.maxSentences))
      : sanitized;

    const byText = new Map(
      existingLanguageSentences.map((sentence) => [normalizeText(sentence.text), sentence] as const)
    );
    const createdOrReused: SentenceEntity[] = [];

    for (const sentence of capped) {
      const componentRefs = sentence.components
        .map((component, index) => {
          const normalized = normalizeText(component.text);
          if (component.type === "word") {
            const word = wordMap.get(normalized);
            if (!word) return null;
            return {
              type: "word" as const,
              refId: word.id,
              orderIndex: index,
              textSnapshot: word.text
            };
          }
          const expression = expressionMap.get(normalized);
          if (!expression) return null;
          return {
            type: "expression" as const,
            refId: expression.id,
            orderIndex: index,
            textSnapshot: expression.text
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (componentRefs.length !== sentence.components.length) continue;

      const existing = byText.get(normalizeText(sentence.text));
      if (existing) {
        const mergedTranslations = uniqueStrings([
          ...existing.translations,
          ...sentence.translations
        ]);
        const updated = await this.sentences.updateById(existing.id, {
          translations: mergedTranslations,
          literalTranslation: existing.literalTranslation || sentence.literalTranslation || "",
          usageNotes: existing.usageNotes || sentence.usageNotes || "",
          explanation: existing.explanation || sentence.explanation || "",
          components: existing.components.length > 0 ? existing.components : componentRefs
        });
        createdOrReused.push(updated || existing);
        continue;
      }

      const created = await this.sentences.create({
        language: input.lesson.language,
        text: sentence.text,
        textNormalized: normalizeText(sentence.text),
        translations: sentence.translations,
        pronunciation: "",
        explanation: sentence.explanation || "",
        examples: [],
        difficulty: Math.max(1, Math.min(5, input.lesson.level === "beginner" ? 1 : input.lesson.level === "intermediate" ? 2 : 3)),
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
        literalTranslation: sentence.literalTranslation || "",
        usageNotes: sentence.usageNotes || "",
        components: componentRefs,
        status: "draft"
      });
      createdOrReused.push(created);
      byText.set(normalizeText(created.text), created);
    }

    return createdOrReused;
  }

  async draftForLessonPlan(input: {
    lesson: LessonEntity;
    maxSentences?: number;
    conversationGoal?: string;
    situations?: string[];
    sentenceGoals?: string[];
    allowedExpressions?: Array<{ text: string; translations: string[] }>;
    allowedWords?: Array<{ text: string; translations: string[] }>;
    allowDerivedComponents?: boolean;
    extraInstructions?: string;
    existingLessonSentences?: SentenceEntity[];
  }) {
    if (typeof input.maxSentences === "number" && input.maxSentences <= 0) {
      return [];
    }

    const existingLessonSentences = input.existingLessonSentences || [];
    const existingLanguageSentences = await this.sentences.list({ language: input.lesson.language });
    const validated = await this.generateValidatedSentences({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      conversationGoal: input.conversationGoal,
      situations: input.situations,
      sentenceGoals: input.sentenceGoals,
      allowedExpressions: input.allowedExpressions,
      allowedWords: input.allowedWords,
      maxSentences: input.maxSentences,
      allowDerivedComponents: input.allowDerivedComponents ?? true,
      extraInstructions: input.extraInstructions,
      existingSentences: [...existingLessonSentences, ...existingLanguageSentences].map((sentence) => sentence.text)
    });

    const batchKeys = new Set<string>();
    const sanitized = validated.accepted
      .map(sanitizeGeneratedSentence)
      .filter((item): item is LlmGeneratedSentence => Boolean(item))
      .filter((item) => {
        const key = normalizeText(item.text);
        if (batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

    return typeof input.maxSentences === "number"
      ? sanitized.slice(0, Math.max(0, input.maxSentences))
      : sanitized;
  }

  private async generateValidatedSentences(input: GenerateSentencesInput) {
    let retryInstruction = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const generated = await this.llm.generateSentences({
        ...input,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined
      });

      const validation = validateGeneratedSentences(generated, input);
      if (validation.accepted.length > 0) return validation;

      logAiValidation("sentences", {
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
        logAiRetry("sentences", {
          attempt,
          lessonId: input.lessonId,
          retryInstruction
        });
      }
    }

    return { accepted: [], rejected: [] };
  }
}
