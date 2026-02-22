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
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.language !== tutorLanguage) return null;
    return this.phrases.create(input);
  }

  async list(filter: { status?: "draft" | "published"; lessonId?: string }, tutorLanguage: Language) {
    const scopedLessons = await this.lessons.listByLanguage(tutorLanguage);
    const scopedLessonIds = scopedLessons.map((item) => item.id);
    if (filter.lessonId && !scopedLessonIds.includes(filter.lessonId)) return [];

    return this.phrases.list({
      status: filter.status,
      lessonId: filter.lessonId,
      lessonIds: filter.lessonId ? undefined : scopedLessonIds
    });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const phrase = await this.phrases.findById(id);
    if (!phrase) return null;
    const lesson = await this.lessons.findById(phrase.lessonId);
    if (!lesson || lesson.language !== tutorLanguage) return null;
    return { phrase, lesson };
  }

  async updateInScope(
    id: string,
    tutorLanguage: Language,
    update: PhraseUpdateInput
  ) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;

    if (update.lessonId) {
      const targetLesson = await this.lessons.findById(update.lessonId);
      if (!targetLesson || targetLesson.language !== tutorLanguage) {
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
}
