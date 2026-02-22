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
    if (!Array.isArray(input.lessonIds) || input.lessonIds.length === 0) return null;
    const lessons = await Promise.all(input.lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
    if (lessons.some((lesson) => !lesson)) return null;
    return this.phrases.create(input);
  }

  async list(filter: { status?: "draft" | "finished" | "published"; lessonId?: string; language?: Language }) {
    return this.phrases.list({
      status: filter.status,
      lessonId: filter.lessonId,
      language: filter.language
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
    if (phrase.status !== "finished") return null;
    return this.phrases.publishById(id, true);
  }

  async finish(id: string): Promise<PhraseEntity | null> {
    const phrase = await this.phrases.findById(id);
    if (!phrase) return null;
    return this.phrases.finishById(id);
  }
}
