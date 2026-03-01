import type { ProverbRepository, ProverbUpdateInput } from "../../../../domain/repositories/ProverbRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { ProverbEntity } from "../../../../domain/entities/Proverb.js";

export class AdminProverbUseCases {
  constructor(
    private readonly proverbs: ProverbRepository,
    private readonly lessons: LessonRepository
  ) {}

  async create(input: {
    lessonIds: string[];
    language: ProverbEntity["language"];
    text: string;
    translation?: string;
    contextNote?: string;
    aiMeta?: Partial<ProverbEntity["aiMeta"]>;
  }) {
    const lessons = await Promise.all(input.lessonIds.map((id) => this.lessons.findById(id)));
    if (lessons.some((item) => !item)) return "lesson_not_found" as const;

    const languages = Array.from(new Set(lessons.filter(Boolean).map((item) => item!.language)));
    if (languages.length !== 1 || languages[0] !== input.language) {
      return "language_mismatch_with_lessons" as const;
    }

    const reusable = await this.proverbs.findReusable(input.language, input.text);
    if (reusable) {
      const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, ...input.lessonIds]));
      return this.proverbs.updateById(reusable.id, {
        lessonIds: mergedLessonIds,
        translation: input.translation !== undefined ? input.translation : reusable.translation,
        contextNote: input.contextNote !== undefined ? input.contextNote : reusable.contextNote,
        aiMeta: input.aiMeta
      });
    }

    return this.proverbs.create({
      lessonIds: input.lessonIds,
      language: input.language,
      text: input.text,
      translation: input.translation,
      contextNote: input.contextNote,
      aiMeta: input.aiMeta,
      status: "draft"
    });
  }

  async list(filter: {
    lessonId?: string;
    language?: ProverbEntity["language"];
    status?: "draft" | "finished" | "published";
  }) {
    return this.proverbs.list(filter);
  }

  async getById(id: string) {
    return this.proverbs.findById(id);
  }

  async update(id: string, update: ProverbUpdateInput) {
    if (update.lessonIds) {
      const lessons = await Promise.all(update.lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
      if (lessons.some((item) => !item)) return "lesson_not_found" as const;
    }
    return this.proverbs.updateById(id, update);
  }

  async delete(id: string) {
    return this.proverbs.softDeleteById(id, new Date());
  }

  async publish(id: string) {
    return this.proverbs.publishById(id, true);
  }

  async finish(id: string) {
    return this.proverbs.finishById(id);
  }
}

