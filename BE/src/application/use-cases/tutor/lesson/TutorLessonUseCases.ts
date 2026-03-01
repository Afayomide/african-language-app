import type { Language, Level, LessonBlock, LessonEntity, Status } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class TutorLessonUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {}

  async create(input: {
    title: string;
    language: Language;
    level: Level;
    description?: string;
    topics?: string[];
    proverbs?: Array<{ text: string; translation: string; contextNote: string }>;
    blocks?: LessonBlock[];
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
      proverbs: Array.isArray(input.proverbs) ? input.proverbs : [],
      blocks: Array.isArray(input.blocks) ? input.blocks : [],
      status: "draft",
      createdBy: input.createdBy
    });
  }

  async list(language: Language, status?: Status) {
    return this.lessons.list({ language, status });
  }

  async getById(id: string, language: Language) {
    return this.lessons.findByIdAndLanguage(id, language);
  }

  async update(
    id: string,
    language: Language,
    update: Partial<{
      title: string;
      description: string;
      level: Level;
      orderIndex: number;
      topics: string[];
      proverbs: Array<{ text: string; translation: string; contextNote: string }>;
      blocks: LessonBlock[];
    }>
  ) {
    return this.lessons.updateByIdAndLanguage(id, language, update);
  }

  async delete(id: string, language: Language) {
    const lesson = await this.lessons.softDeleteByIdAndLanguage(id, language);
    if (!lesson) return null;

    const now = new Date();
    await this.phrases.softDeleteByLessonId(lesson.id, now);
    await this.proverbs.softDeleteByLessonId(lesson.id, now);
    await this.questions.softDeleteByLessonId(lesson.id, now);
    await this.lessons.compactOrderIndexes(language);

    return lesson;
  }

  async bulkDelete(ids: string[], language: Language) {
    const deleted: LessonEntity[] = [];
    for (const id of ids) {
      const lesson = await this.delete(id, language);
      if (lesson) deleted.push(lesson);
    }
    return deleted;
  }

  async reorder(language: Language, lessonIds: string[]): Promise<LessonEntity[] | null> {
    const scoped = await this.lessons.findByIdsAndLanguage(lessonIds, language);
    if (scoped.length !== lessonIds.length) return null;

    await this.lessons.reorderByIds(lessonIds);
    return this.lessons.listByLanguage(language);
  }

  async finish(id: string, language: Language) {
    return this.lessons.finishByIdAndLanguage(id, language);
  }
}
