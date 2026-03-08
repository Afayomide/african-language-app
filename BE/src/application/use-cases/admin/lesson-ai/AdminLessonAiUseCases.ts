import type { Language, Level, LessonEntity } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { LlmClient } from "../../../../services/llm/types.js";

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

function isEnglishLikeTitle(value: string) {
  const title = String(value || "").trim();
  if (!title) return false;
  // Guardrail: keep lesson titles in English-like latin script to avoid target-language titles.
  const latinPattern = /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/;
  return latinPattern.test(title);
}

function normalizeSuggestedProverb(item: unknown) {
  if (typeof item === "string") {
    const text = item.trim();
    if (!text) return null;
    return { text, translation: "", contextNote: "" };
  }
  if (!item || typeof item !== "object") return null;
  const payload = item as { text?: unknown; translation?: unknown; contextNote?: unknown };
  const text = String(payload.text || "").trim();
  if (!text) return null;
  return {
    text,
    translation: String(payload.translation || "").trim(),
    contextNote: String(payload.contextNote || "").trim()
  };
}

export class AdminLessonAiUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly llm: LlmClient
  ) {}

  async generateLessonsBulk(input: {
    unitId: string;
    language: Language;
    level: Level;
    title?: string;
    topics?: string[];
    count: number;
    createdBy: string;
  }) {
    const existingLessons = await this.lessons.list({ unitId: input.unitId });
    const existingTitleSet = new Set(
      existingLessons
        .filter((item) => item.level === input.level)
        .map((item) => normalizeTitle(String(item.title || "")))
    );

    const providedTopics = Array.isArray(input.topics)
      ? input.topics.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 20)
      : [];

    const fallbackTitle = input.title ? String(input.title).trim() : "";
    const targetTopics =
      providedTopics.length > 0
        ? providedTopics.slice(0, input.count)
        : Array.from({ length: input.count }).map((_, idx) =>
            fallbackTitle ? `${fallbackTitle} #${idx + 1}` : undefined
          );
    
    

    const created: LessonEntity[] = [];
    const skipped: { reason: string; topic?: string; title?: string }[] = [];
    const errors: { topic?: string; error: string }[] = [];

    const lastOrder = await this.lessons.findLastOrderIndex(input.unitId);
    let nextOrderIndex = (lastOrder ?? -1) + 1;
    const lessonIdsInUnit = existingLessons.map((item) => item.id);
    const existingPhrasesInUnit = lessonIdsInUnit.length
      ? await this.phrases.list({ lessonIds: lessonIdsInUnit })
      : [];
    const existingPhraseTexts = existingPhrasesInUnit.map((item) => item.text).filter(Boolean);
    const existingProverbTexts = (
      await Promise.all(lessonIdsInUnit.map((lessonId) => this.proverbs.findByLessonId(lessonId)))
    )
      .flat()
      .map((item) => item.text)
      .filter(Boolean);

    for (let idx = 0; idx < input.count; idx += 1) {
      const lessonTopic = targetTopics[idx];
      try {
        const suggestion = await this.llm.suggestLesson({
          language: input.language,
          level: input.level,
          topic: lessonTopic,
          curriculumInstruction:
            "Continue the same unit curriculum progressively and avoid repeating existing lessons with renamed titles.",
          existingLessonTitles: existingLessons.map((item) => item.title).filter(Boolean),
          existingPhraseTexts,
          existingProverbTexts
        });

        const title = String(suggestion.title || "").trim();
        if (!title) {
          skipped.push({ reason: "empty_title", topic: lessonTopic });
          continue;
        }
        if (!isEnglishLikeTitle(title)) {
          skipped.push({ reason: "non_english_title", topic: lessonTopic, title });
          continue;
        }

        const titleKey = normalizeTitle(title);
        if (existingTitleSet.has(titleKey)) {
          skipped.push({ reason: "duplicate_title", topic: lessonTopic, title });
          continue;
        }

        const lesson = await this.lessons.create({
          title,
          unitId: input.unitId,
          language: input.language,
          level: input.level,
          description: suggestion.description ? String(suggestion.description).trim() : "",
          topics: lessonTopic ? [lessonTopic] : [],
          proverbs: [],
          status: "draft",
          createdBy: input.createdBy,
          orderIndex: nextOrderIndex
        });

        const suggestedProverbs = Array.isArray(suggestion.proverbs)
          ? suggestion.proverbs.map(normalizeSuggestedProverb).filter((item): item is { text: string; translation: string; contextNote: string } => Boolean(item))
          : [];
        for (const proverbItem of suggestedProverbs) {
          const reusable = await this.proverbs.findReusable(input.language, proverbItem.text);
          if (reusable) {
            const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, lesson.id]));
            await this.proverbs.updateById(reusable.id, {
              lessonIds: mergedLessonIds,
              translation: proverbItem.translation || reusable.translation,
              contextNote: proverbItem.contextNote || reusable.contextNote,
              aiMeta: { generatedByAI: true, model: "", reviewedByAdmin: false }
            });
            continue;
          }

          await this.proverbs.create({
            lessonIds: [lesson.id],
            language: input.language,
            text: proverbItem.text,
            translation: proverbItem.translation,
            contextNote: proverbItem.contextNote,
            aiMeta: { generatedByAI: true, model: "", reviewedByAdmin: false },
            status: "draft"
          });
        }

        nextOrderIndex += 1;
        existingTitleSet.add(titleKey);
        created.push(lesson);
      } catch (error) {
        console.error("Admin AI bulk lesson generation item failed", {
          language: input.language,
          level: input.level,
          topic: lessonTopic,
          error
        });

        errors.push({
          topic: lessonTopic,
          error: error instanceof Error ? error.message : "unknown_error"
        });
      }
    }

    return {
      totalRequested: input.count,
      createdCount: created.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      lessons: created,
      skipped,
      errors
    };
  }

  async generateLessonProverbs(input: {
    lesson: LessonEntity;
    count: number;
    extraInstructions?: string;
  }) {
    const existing = await this.proverbs.findByLessonId(input.lesson.id);
    const suggested = await this.llm.generateProverbs({
      language: input.lesson.language,
      level: input.lesson.level,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      count: input.count,
      extraInstructions: input.extraInstructions?.trim() || undefined,
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

      const reusable = await this.proverbs.findReusable(input.lesson.language, text);
      if (reusable) {
        const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, input.lesson.id]));
        const updated = await this.proverbs.updateById(reusable.id, {
          lessonIds: mergedLessonIds,
          translation: String(item.translation || reusable.translation || "").trim(),
          contextNote: String(item.contextNote || reusable.contextNote || "").trim(),
          aiMeta: { generatedByAI: true, model: this.llm.modelName, reviewedByAdmin: false }
        });
        if (updated) created.push(updated);
        continue;
      }

      const proverb = await this.proverbs.create({
        lessonIds: [input.lesson.id],
        language: input.lesson.language,
        text,
        translation: String(item.translation || "").trim(),
        contextNote: String(item.contextNote || "").trim(),
        aiMeta: { generatedByAI: true, model: this.llm.modelName, reviewedByAdmin: false },
        status: "draft"
      });
      created.push(proverb);
    }

    return created;
  }
}
