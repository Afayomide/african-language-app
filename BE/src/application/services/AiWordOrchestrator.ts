import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type { GenerateWordsInput, LlmClient, LlmGeneratedWord } from "../../services/llm/types.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateGeneratedWords } from "../../services/llm/outputQuality.js";

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function sanitizeGeneratedWord(word: LlmGeneratedWord): LlmGeneratedWord | null {
  const text = String(word.text || "").trim();
  const translations = Array.from(
    new Set(
      (Array.isArray(word.translations) ? word.translations : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
  if (!text || translations.length === 0) return null;

  return {
    text,
    translations,
    lemma: String(word.lemma || text).trim(),
    partOfSpeech: String(word.partOfSpeech || "unknown").trim(),
    pronunciation: String(word.pronunciation || "").trim(),
    explanation: String(word.explanation || "").trim(),
    examples: Array.isArray(word.examples)
      ? word.examples.map((example) => ({
          original: String(example.original || "").trim(),
          translation: String(example.translation || "").trim()
        }))
      : [],
    difficulty: word.difficulty
  };
}

export class AiWordOrchestrator {
  constructor(
    private readonly words: WordRepository,
    private readonly llm: LlmClient
  ) {}

  async generateForLesson(input: {
    lesson: LessonEntity;
    seedWords?: string[];
    extraInstructions?: string;
    maxWords?: number;
    existingLessonWords?: WordEntity[];
  }) {
    if (typeof input.maxWords === "number" && input.maxWords <= 0) {
      return [];
    }

    const existingLessonWords = input.existingLessonWords || [];
    const allLanguageWords = await this.words.list({
      language: input.lesson.language,
      languageId: input.lesson.languageId || null
    });
    const existingLessonKeys = new Set(existingLessonWords.map((item) => normalizeText(item.text)));
    const wordByText = new Map<string, WordEntity>();
    for (const word of allLanguageWords) {
      const key = normalizeText(word.text);
      if (!wordByText.has(key)) wordByText.set(key, word);
    }

    const validated = await this.generateValidatedWords({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      seedWords: input.seedWords,
      extraInstructions: input.extraInstructions,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      existingWords: existingLessonWords.map((item) => item.text)
    });

    const batchKeys = new Set<string>();
    const sanitized = validated.accepted
      .map(sanitizeGeneratedWord)
      .filter((item): item is LlmGeneratedWord => Boolean(item))
      .filter((item) => {
        const key = normalizeText(item.text);
        if (existingLessonKeys.has(key) || batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

    const capped = typeof input.maxWords === "number"
      ? sanitized.slice(0, Math.max(0, input.maxWords))
      : sanitized;

    const createdOrReused: WordEntity[] = [];
    for (const word of capped) {
      const key = normalizeText(word.text);
      const existing = wordByText.get(key);
      if (existing) {
        const translations = Array.from(new Set([...existing.translations, ...word.translations].filter(Boolean)));
        const updated = await this.words.updateById(existing.id, {
          translations,
          lemma: existing.lemma || word.lemma || word.text,
          partOfSpeech: existing.partOfSpeech || word.partOfSpeech || "unknown",
          pronunciation: existing.pronunciation || word.pronunciation || "",
          explanation: existing.explanation || word.explanation || "",
          examples: existing.examples.length > 0 ? existing.examples : word.examples || []
        });
        createdOrReused.push(updated || existing);
        continue;
      }

      const created = await this.words.create({
        language: input.lesson.language,
        text: word.text,
        textNormalized: normalizeText(word.text),
        translations: word.translations,
        pronunciation: word.pronunciation || "",
        explanation: word.explanation || "",
        examples: word.examples || [],
        difficulty: word.difficulty ?? 1,
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
        lemma: word.lemma || word.text,
        partOfSpeech: word.partOfSpeech || "unknown",
        status: "draft"
      });
      createdOrReused.push(created);
      wordByText.set(key, created);
    }

    return createdOrReused;
  }

  private async generateValidatedWords(input: GenerateWordsInput) {
    let retryInstruction = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const generated = await this.llm.generateWords({
        ...input,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined
      });

      const validation = validateGeneratedWords(generated, input);
      if (validation.accepted.length > 0) return validation;

      logAiValidation("words", {
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
        logAiRetry("words", {
          attempt,
          lessonId: input.lessonId,
          retryInstruction
        });
      }
    }

    return { accepted: [], rejected: [] };
  }
}
