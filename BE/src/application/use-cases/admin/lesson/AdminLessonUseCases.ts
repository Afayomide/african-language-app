import type { Language, Level, LessonBlock, LessonEntity, Status } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class AdminLessonUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {}

  async create(input: {
    title: string;
    unitId: string;
    language: Language;
    level: Level;
    description?: string;
    topics?: string[];
    proverbs?: Array<{ text: string; translation: string; contextNote: string }>;
    blocks?: LessonBlock[];
    createdBy: string;
  }) {
    const lastOrderIndex = await this.lessons.findLastOrderIndex(input.unitId);
    const orderIndex = (lastOrderIndex ?? -1) + 1;

    return this.lessons.create({
      title: input.title,
      unitId: input.unitId,
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
      unitId: string;
      language: Language;
      level: Level;
      orderIndex: number;
      topics: string[];
      proverbs: Array<{ text: string; translation: string; contextNote: string }>;
      blocks: LessonBlock[];
    }>
  ) {
    const current = await this.lessons.findById(id);
    if (!current) return null;

    const payload = { ...update };
    if (payload.unitId && payload.unitId !== current.unitId && payload.orderIndex === undefined) {
      const lastOrderIndex = await this.lessons.findLastOrderIndex(payload.unitId);
      payload.orderIndex = (lastOrderIndex ?? -1) + 1;
    }

    return this.lessons.updateById(id, payload);
  }

  async delete(id: string) {
    const lesson = await this.lessons.softDeleteById(id);
    if (!lesson) return null;

    const now = new Date();
    await this.phrases.softDeleteByLessonId(lesson.id, now);
    await this.proverbs.softDeleteByLessonId(lesson.id, now);
    await this.questions.softDeleteByLessonId(lesson.id, now);
    await this.lessons.compactOrderIndexesByUnit(lesson.unitId);

    return lesson;
  }

  async bulkDelete(ids: string[]) {
    const deleted: LessonEntity[] = [];
    for (const id of ids) {
      const lesson = await this.delete(id);
      if (lesson) deleted.push(lesson);
    }
    return deleted;
  }

  async publish(id: string) {
    const lesson = await this.getById(id);
    console.log(lesson)
    for (const block of lesson?.blocks || []) {
      if (block.type === "phrase" && block.refId) {
        const phrase = await this.phrases.findById(block.refId);
        if (phrase?.status !== "published") {
          return "phrases_not_published" as const;
        }
      } 
      if (block.type === "proverb" && block.refId) {
        const proverb = await this.proverbs.findById(block.refId);
        if (proverb?.status !== "published") {
          return "proverbs_not_published" as const;
        }
      }
      if (block.type === "question" && block.refId) {
        const question = await this.questions.findById(block.refId);
        if (question?.status !== "published") {
          return "questions_not_published" as const;
        }
      }
    } 
    const published = await this.lessons.publishById(id, new Date());
    return published;
  }

  async reorder(unitId: string, lessonIds: string[]): Promise<LessonEntity[] | null> {
    const scoped = await this.lessons.findByIdsAndUnit(lessonIds, unitId);
    if (scoped.length !== lessonIds.length) return null;

    await this.lessons.reorderByIds(lessonIds);
    return this.lessons.listByUnitId(unitId);
  }
}
