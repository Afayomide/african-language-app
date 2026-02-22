import type { Language } from "../../../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type {
  PhraseCreateInput,
  PhraseRepository,
  PhraseUpdateInput
} from "../../../../domain/repositories/PhraseRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class AdminPhraseUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly questions: QuestionRepository
  ) {}

  async create(input: PhraseCreateInput) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson) return null;
    return this.phrases.create(input);
  }

  async list(filter: { status?: "draft" | "published"; lessonId?: string; language?: Language }) {
    if (filter.language) {
      const scopedLessons = await this.lessons.listByLanguage(filter.language);
      return this.phrases.list({
        status: filter.status,
        lessonIds: filter.lessonId
          ? scopedLessons.map((item) => item.id).filter((id) => id === filter.lessonId)
          : scopedLessons.map((item) => item.id)
      });
    }

    return this.phrases.list({
      status: filter.status,
      lessonId: filter.lessonId
    });
  }

  async getById(id: string) {
    return this.phrases.findById(id);
  }

  async update(id: string, update: PhraseUpdateInput) {
    return this.phrases.updateById(id, update);
  }

  async delete(id: string) {
    const now = new Date();
    const phrase = await this.phrases.softDeleteById(id, now);
    if (!phrase) return null;
    await this.questions.softDeleteByPhraseId(phrase.id, now);
    return phrase;
  }

  async publish(id: string): Promise<PhraseEntity | null> {
    const phrase = await this.phrases.findById(id);
    if (!phrase) return null;
    return this.phrases.publishById(id, true);
  }
}
