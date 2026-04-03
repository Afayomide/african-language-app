import type { Language } from "../../../../domain/entities/Lesson.js";
import type { WordEntity } from "../../../../domain/entities/Word.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { WordCreateInput, WordRepository, WordUpdateInput } from "../../../../domain/repositories/WordRepository.js";

export class AdminWordUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly words: WordRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly questions: QuestionRepository
  ) {}

  private async validateLessons(lessonIds: string[], language: Language) {
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) return [];
    const lessons = await Promise.all(lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
    if (lessons.some((lesson) => !lesson || lesson.language !== language)) return null;
    return lessons;
  }

  async create(input: WordCreateInput & { lessonIds?: string[]; createdBy: string }) {
    const lessonIds = Array.isArray(input.lessonIds) ? input.lessonIds : [];
    const lessons = await this.validateLessons(lessonIds, input.language);
    if (!lessons) return null;
    if (input.status !== "published" && lessons.some((lesson) => lesson?.status === "published")) {
      return "cannot_add_draft_to_published_lesson" as const;
    }

    const created = await this.words.create(input);
    if (lessons.length > 0) {
      await this.lessonContentItems.replaceForContent(
        "word",
        created.id,
        lessons.map((lesson, index) => ({
          lessonId: lesson!.id,
          unitId: lesson!.unitId,
          contentType: "word",
          contentId: created.id,
          role: "introduce",
          stageIndex: 0,
          orderIndex: index,
          createdBy: input.createdBy
        }))
      );
    }
    return created;
  }

  async getById(id: string) {
    return this.words.findById(id);
  }

  async list(filter: { status?: "draft" | "finished" | "published"; language?: Language }) {
    return this.words.list(filter);
  }

  async update(id: string, update: WordUpdateInput & { lessonIds?: string[]; createdBy: string }) {
    const current = await this.words.findById(id);
    if (!current) return null;

    const targetLanguage = update.language ?? current.language;
    const targetStatus = update.status ?? current.status;
    if (update.lessonIds) {
      const lessons = await this.validateLessons(update.lessonIds, targetLanguage);
      if (!lessons) return "target_lesson_out_of_scope" as const;
      if (targetStatus !== "published" && lessons.some((lesson) => lesson?.status === "published")) {
        return "cannot_add_draft_to_published_lesson" as const;
      }
      await this.lessonContentItems.replaceForContent(
        "word",
        id,
        lessons.map((lesson, index) => ({
          lessonId: lesson!.id,
          unitId: lesson!.unitId,
          contentType: "word",
          contentId: id,
          role: "introduce",
          stageIndex: 0,
          orderIndex: index,
          createdBy: update.createdBy
        }))
      );
    }

    const { lessonIds: _lessonIds, createdBy: _createdBy, ...wordUpdate } = update;
    return this.words.updateById(id, wordUpdate);
  }

  async delete(id: string) {
    const deleted = await this.words.softDeleteById(id);
    if (!deleted) return null;
    await this.lessonContentItems.replaceForContent("word", id, []);
    await this.questions.softDeleteBySource("word", id, new Date());
    return deleted;
  }

  async bulkDelete(ids: string[]) {
    const deleted: WordEntity[] = [];
    for (const id of ids) {
      const word = await this.delete(id);
      if (word) deleted.push(word);
    }
    return deleted;
  }

  async finish(id: string) {
    const current = await this.words.findById(id);
    if (!current || current.status !== "draft") return null;
    return this.words.updateById(id, { status: "finished" });
  }

  async publish(id: string) {
    const current = await this.words.findById(id);
    if (!current || current.status !== "finished") return null;
    return this.words.updateById(id, { status: "published" });
  }
}
