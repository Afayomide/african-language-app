import type { Language } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type {
  PhraseCreateInput,
  PhraseRepository,
  PhraseUpdateInput
} from "../../../../domain/repositories/PhraseRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class TutorPhraseUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly questions: QuestionRepository
  ) {}

  async create(input: PhraseCreateInput, tutorLanguage: Language) {
    if (!Array.isArray(input.lessonIds) || input.lessonIds.length === 0) return null;
    const lessons = await Promise.all(input.lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
    if (lessons.some((lesson) => !lesson || lesson.language !== tutorLanguage)) return null;
    return this.phrases.create(input);
  }

  async list(filter: { status?: "draft" | "finished" | "published"; lessonId?: string }, tutorLanguage: Language) {
    if (filter.lessonId) {
      const lesson = await this.lessons.findByIdAndLanguage(filter.lessonId, tutorLanguage);
      if (!lesson) return [];
      return this.phrases.list({
        status: filter.status,
        lessonId: filter.lessonId,
        language: tutorLanguage
      });
    }
    return this.phrases.list({
      status: filter.status,
      language: tutorLanguage
    });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const phrase = await this.phrases.findById(id);
    if (!phrase) return null;
    if (phrase.language !== tutorLanguage) return null;
    return { phrase };
  }

  async updateInScope(
    id: string,
    tutorLanguage: Language,
    update: PhraseUpdateInput
  ) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;

    if (update.lessonIds) {
      if (update.lessonIds.length === 0) return "target_lesson_out_of_scope" as const;
      const targetLessons = await Promise.all(update.lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
      if (targetLessons.some((lesson) => !lesson || lesson.language !== tutorLanguage)) {
        return "target_lesson_out_of_scope" as const;
      }
    }

    return this.phrases.updateById(id, update);
  }

  async deleteInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    const now = new Date();
    const phrase = await this.phrases.softDeleteById(id, now);
    if (!phrase) return null;
    await this.questions.softDeleteByPhraseId(phrase.id, now);
    return phrase;
  }

  async finishInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    return this.phrases.finishById(id);
  }
}
