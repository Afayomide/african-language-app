import type { Language, Level, LessonEntity } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { LlmClient } from "../../../../services/llm/types.js";

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

export class AdminLessonAiUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly llm: LlmClient
  ) {}

  async generateLessonsBulk(input: {
    language: Language;
    level: Level;
    title?: string;
    topics?: string[];
    count: number;
    createdBy: string;
  }) {
    const existingLessons = await this.lessons.list({ language: input.language });
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

    const lastOrder = await this.lessons.findLastOrderIndex(input.language);
    let nextOrderIndex = (lastOrder ?? -1) + 1;

    for (let idx = 0; idx < input.count; idx += 1) {
      const lessonTopic = targetTopics[idx];
      try {
        const suggestion = await this.llm.suggestLesson({
          language: input.language,
          level: input.level,
          topic: lessonTopic
        });

        const title = String(suggestion.title || "").trim();
        if (!title) {
          skipped.push({ reason: "empty_title", topic: lessonTopic });
          continue;
        }

        const titleKey = normalizeTitle(title);
        if (existingTitleSet.has(titleKey)) {
          skipped.push({ reason: "duplicate_title", topic: lessonTopic, title });
          continue;
        }

        const lesson = await this.lessons.create({
          title,
          language: input.language,
          level: input.level,
          description: suggestion.description ? String(suggestion.description).trim() : "",
          topics: lessonTopic ? [lessonTopic] : [],
          status: "draft",
          createdBy: input.createdBy,
          orderIndex: nextOrderIndex
        });

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
}
