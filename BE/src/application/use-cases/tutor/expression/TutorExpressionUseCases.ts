import type { Language } from "../../../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../../../domain/entities/Expression.js";
import type {
  ExpressionCreateInput,
  ExpressionRepository,
  ExpressionUpdateInput
} from "../../../../domain/repositories/ExpressionRepository.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class TutorExpressionUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly expressions: ExpressionRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly questions: QuestionRepository
  ) {}

  private async validateLessons(lessonIds: string[], language: Language) {
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) return [];
    const lessons = await Promise.all(lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
    if (lessons.some((lesson) => !lesson || lesson.language !== language)) return null;
    return lessons;
  }

  async create(input: ExpressionCreateInput & { lessonIds?: string[]; createdBy: string }, tutorLanguage: Language) {
    if (input.language !== tutorLanguage) return null;
    const lessonIds = Array.isArray(input.lessonIds) ? input.lessonIds : [];
    const lessons = await this.validateLessons(lessonIds, tutorLanguage);
    if (!lessons) return null;

    const created = await this.expressions.create({
      language: input.language,
      text: input.text,
      textNormalized: input.textNormalized,
      translations: input.translations,
      pronunciation: input.pronunciation,
      explanation: input.explanation,
      examples: input.examples,
      difficulty: input.difficulty,
      aiMeta: input.aiMeta,
      audio: input.audio,
      register: input.register,
      components: input.components,
      status: input.status
    });

    if (lessons.length > 0) {
      await this.lessonContentItems.replaceForContent(
        "expression",
        created.id,
        lessons.map((lesson, index) => ({
          lessonId: lesson!.id,
          unitId: lesson!.unitId,
          contentType: "expression",
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
    return this.expressions.list({ ...filter, language: tutorLanguage });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const expression = await this.expressions.findById(id);
    if (!expression || expression.language !== tutorLanguage) return null;
    return expression;
  }

  async updateInScope(id: string, tutorLanguage: Language, update: ExpressionUpdateInput & { lessonIds?: string[]; createdBy: string }) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    const lessonIds = update.lessonIds;
    if (lessonIds) {
      const lessons = await this.validateLessons(lessonIds, tutorLanguage);
      if (!lessons) return "target_lesson_out_of_scope" as const;
      await this.lessonContentItems.replaceForContent(
        "expression",
        id,
        lessons.map((lesson, index) => ({
          lessonId: lesson!.id,
          unitId: lesson!.unitId,
          contentType: "expression",
          contentId: id,
          role: "introduce",
          stageIndex: 0,
          orderIndex: index,
          createdBy: update.createdBy
        }))
      );
    }

    const { lessonIds: _lessonIds, createdBy: _createdBy, ...expressionUpdate } = update;
    return this.expressions.updateById(id, expressionUpdate);
  }

  async deleteInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    const deleted = await this.expressions.softDeleteById(id);
    if (!deleted) return null;
    const now = new Date();
    await this.lessonContentItems.replaceForContent("expression", id, []);
    await this.questions.softDeleteBySource("expression", id, now);
    return deleted;
  }

  async bulkDeleteInScope(ids: string[], tutorLanguage: Language) {
    const deleted: ExpressionEntity[] = [];
    for (const id of ids) {
      const expression = await this.deleteInScope(id, tutorLanguage);
      if (expression) deleted.push(expression);
    }
    return deleted;
  }

  async finishInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    return this.expressions.updateById(id, { status: "finished" });
  }
}
