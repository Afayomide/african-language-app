import type { Language, Level, LessonEntity, Status } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class AdminLessonUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly questions: QuestionRepository
  ) {}

  async create(input: {
    title: string;
    language: Language;
    level: Level;
    description?: string;
    topics?: string[];
    createdBy: string;
  }) {
    const lastOrderIndex = await this.lessons.findLastOrderIndex(input.language);
    const orderIndex = (lastOrderIndex ?? -1) + 1;

    return this.lessons.create({
      title: input.title,
      language: input.language,
      level: input.level,
      orderIndex,
      description: input.description?.trim() || "",
      topics: Array.isArray(input.topics) ? input.topics : [],
      status: "draft",
      createdBy: input.createdBy
    });
  }

  async list(filter: { language?: Language; status?: Status }) {
    return this.lessons.list(filter);
  }

  async getById(id: string) {
    return this.lessons.findById(id);
  }

  async update(
    id: string,
    update: Partial<{
      title: string;
      description: string;
      language: Language;
      level: Level;
      orderIndex: number;
      topics: string[];
    }>
  ) {
    const current = await this.lessons.findById(id);
    if (!current) return null;

    const payload = { ...update };
    if (payload.language && payload.language !== current.language && payload.orderIndex === undefined) {
      const lastOrderIndex = await this.lessons.findLastOrderIndex(payload.language);
      payload.orderIndex = (lastOrderIndex ?? -1) + 1;
    }

    return this.lessons.updateById(id, payload);
  }

  async delete(id: string) {
    const lesson = await this.lessons.softDeleteById(id);
    if (!lesson) return null;

    const now = new Date();
    await this.phrases.softDeleteByLessonId(lesson.id, now);
    await this.questions.softDeleteByLessonId(lesson.id, now);
    await this.lessons.compactOrderIndexes(lesson.language);

    return lesson;
  }

  async publish(id: string) {
    return this.lessons.publishById(id, new Date());
  }

  async reorder(language: Language, lessonIds: string[]): Promise<LessonEntity[] | null> {
    const scoped = await this.lessons.findByIdsAndLanguage(lessonIds, language);
    if (scoped.length !== lessonIds.length) return null;

    await this.lessons.reorderByIds(lessonIds);
    return this.lessons.listByLanguage(language);
  }
}
