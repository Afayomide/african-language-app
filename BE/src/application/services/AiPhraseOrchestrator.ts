import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../domain/entities/Phrase.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";
import type { LlmClient, LlmGeneratedPhrase } from "../../services/llm/types.js";

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
  if (!phrase.text || !phrase.translation) return null;

  const result: LlmGeneratedPhrase = {
    text: String(phrase.text).trim(),
    translation: String(phrase.translation).trim()
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

function normalizePhraseKey(text: string, translation: string) {
  return `${text.trim().toLowerCase()}::${translation.trim().toLowerCase()}`;
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
  }) {
    const existingPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const existingKeys = new Set(
      existingPhrases.map((phrase) => normalizePhraseKey(phrase.text, phrase.translation))
    );

    const phrases = await this.llm.generatePhrases({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      seedWords: input.seedWords,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      existingPhrases: existingPhrases.map((phrase) => phrase.text)
    });

    const uniqueInBatch = new Set<string>();
    const sanitized = phrases
      .map(sanitizePhrase)
      .filter((item): item is LlmGeneratedPhrase => Boolean(item))
      .filter((item) => {
        const key = normalizePhraseKey(item.text, item.translation);
        if (existingKeys.has(key) || uniqueInBatch.has(key)) return false;
        uniqueInBatch.add(key);
        return true;
      });

    if (sanitized.length === 0) return [];

    const created: PhraseEntity[] = [];
    for (const phrase of sanitized) {
      const item = await this.phrases.create({
        lessonId: input.lesson.id,
        text: phrase.text,
        translation: phrase.translation,
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

  async enhancePhrase(input: {
    phrase: PhraseEntity;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
  }) {
    const updates = await this.llm.enhancePhrase({
      text: input.phrase.text,
      translation: input.phrase.translation,
      language: input.language,
      level: input.level
    });

    const sanitized = sanitizePhrase({
      text: input.phrase.text,
      translation: input.phrase.translation,
      pronunciation: updates.pronunciation,
      explanation: updates.explanation,
      examples: updates.examples,
      difficulty: updates.difficulty
    });
    if (!sanitized) return null;

    return this.phrases.updateById(input.phrase.id, {
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
}
