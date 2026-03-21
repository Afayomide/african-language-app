import type { Language } from "../../../../domain/entities/Lesson.js";
import type { WordEntity } from "../../../../domain/entities/Word.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { WordCreateInput, WordRepository, WordUpdateInput } from "../../../../domain/repositories/WordRepository.js";

export class TutorWordUseCases {
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

  async create(input: WordCreateInput & { lessonIds?: string[]; createdBy: string }, tutorLanguage: Language) {
    if (input.language !== tutorLanguage) return null;
    const lessonIds = Array.isArray(input.lessonIds) ? input.lessonIds : [];
    const lessons = await this.validateLessons(lessonIds, tutorLanguage);
    if (!lessons) return null;

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

  async list(filter: { status?: "draft" | "finished" | "published" }, tutorLanguage: Language) {
    return this.words.list({ ...filter, language: tutorLanguage });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const word = await this.words.findById(id);
    if (!word || word.language !== tutorLanguage) return null;
    return word;
  }

  async updateInScope(id: string, tutorLanguage: Language, update: WordUpdateInput & { lessonIds?: string[]; createdBy: string }) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    if (update.lessonIds) {
      const lessons = await this.validateLessons(update.lessonIds, tutorLanguage);
      if (!lessons) return "target_lesson_out_of_scope" as const;
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

  async deleteInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    const deleted = await this.words.softDeleteById(id);
    if (!deleted) return null;
    await this.lessonContentItems.replaceForContent("word", id, []);
    await this.questions.softDeleteBySource("word", id, new Date());
    return deleted;
  }

  async bulkDeleteInScope(ids: string[], tutorLanguage: Language) {
    const deleted: WordEntity[] = [];
    for (const id of ids) {
      const word = await this.deleteInScope(id, tutorLanguage);
      if (word) deleted.push(word);
    }
    return deleted;
  }

  async finishInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    return this.words.updateById(id, { status: "finished" });
  }
}
