import type { Language } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { ProverbEntity } from "../../../../domain/entities/Proverb.js";
import type { ProverbRepository, ProverbUpdateInput } from "../../../../domain/repositories/ProverbRepository.js";

export class TutorProverbUseCases {
  constructor(
    private readonly proverbs: ProverbRepository,
    private readonly lessons: LessonRepository
  ) {}

  async create(
    input: {
      lessonIds: string[];
      text: string;
      translation?: string;
      contextNote?: string;
      aiMeta?: Partial<ProverbEntity["aiMeta"]>;
    },
    tutorLanguage: Language
  ) {
    const lessons = await Promise.all(input.lessonIds.map((id) => this.lessons.findByIdAndLanguage(id, tutorLanguage)));
    if (lessons.some((item) => !item)) return "lesson_not_found" as const;

    const reusable = await this.proverbs.findReusable(tutorLanguage, input.text);
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
      language: tutorLanguage,
      text: input.text,
      translation: input.translation,
      contextNote: input.contextNote,
      aiMeta: input.aiMeta,
      status: "draft"
    });
  }

  async list(
    filter: {
      lessonId?: string;
      status?: "draft" | "finished" | "published";
    },
    tutorLanguage: Language
  ) {
    if (filter.lessonId) {
      const lesson = await this.lessons.findByIdAndLanguage(filter.lessonId, tutorLanguage);
      if (!lesson) return "lesson_not_found" as const;
      return this.proverbs.list({ lessonId: lesson.id, status: filter.status, language: tutorLanguage });
    }
    return this.proverbs.list({ status: filter.status, language: tutorLanguage });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const proverb = await this.proverbs.findById(id);
    if (!proverb || proverb.language !== tutorLanguage) return null;
    return proverb;
  }

  async updateInScope(id: string, tutorLanguage: Language, update: ProverbUpdateInput) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return "proverb_not_found" as const;

    if (update.lessonIds) {
      const lessons = await Promise.all(
        update.lessonIds.map((lessonId) => this.lessons.findByIdAndLanguage(lessonId, tutorLanguage))
      );
      if (lessons.some((item) => !item)) return "lesson_not_found" as const;
    }

    return this.proverbs.updateById(id, update);
  }

  async deleteInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    return this.proverbs.softDeleteById(id, new Date());
  }

  async finishInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    return this.proverbs.finishById(id);
  }
}

