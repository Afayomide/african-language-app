import type { Language } from "../../../../domain/entities/Lesson.js";
import type { LessonContentItemCreateInput } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { ExpressionEntity } from "../../../../domain/entities/Expression.js";
import type {
  ExpressionCreateInput,
  ExpressionRepository,
  ExpressionUpdateInput
} from "../../../../domain/repositories/ExpressionRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";

export class AdminExpressionUseCases {
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

  private buildLessonContentRows(input: {
    expressionId: string;
    lessonIds: string[];
    language: Language;
    createdBy: string;
  }): LessonContentItemCreateInput[] {
    return input.lessonIds.map((lessonId, index) => ({
      lessonId,
      unitId: "",
      contentType: "expression",
      contentId: input.expressionId,
      role: "introduce",
      stageIndex: 0,
      orderIndex: index,
      createdBy: input.createdBy
    }));
  }

  async create(input: ExpressionCreateInput & { lessonIds?: string[]; createdBy: string }) {
    const lessonIds = Array.isArray(input.lessonIds) ? input.lessonIds : [];
    const lessons = await this.validateLessons(lessonIds, input.language);
    if (!lessons) return null;
    if (input.status !== "published" && lessons.some((lesson) => lesson?.status === "published")) {
      return "cannot_add_draft_to_published_lesson" as const;
    }

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

  async getById(id: string) {
    return this.expressions.findById(id);
  }

  async list(filter: { status?: "draft" | "finished" | "published"; language?: Language }) {
    return this.expressions.list(filter);
  }

  async update(id: string, update: ExpressionUpdateInput & { lessonIds?: string[]; createdBy: string }) {
    const current = await this.expressions.findById(id);
    if (!current) return null;

    const targetLanguage = update.language ?? current.language;
    const targetStatus = update.status ?? current.status;
    const lessonIds = update.lessonIds;
    if (lessonIds) {
      const lessons = await this.validateLessons(lessonIds, targetLanguage);
      if (!lessons) return "target_lesson_out_of_scope" as const;
      if (targetStatus !== "published" && lessons.some((lesson) => lesson?.status === "published")) {
        return "cannot_add_draft_to_published_lesson" as const;
      }
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

  async delete(id: string) {
    const deleted = await this.expressions.softDeleteById(id);
    if (!deleted) return null;
    const now = new Date();
    await this.lessonContentItems.replaceForContent("expression", id, []);
    await this.questions.softDeleteBySource("expression", id, now);
    return deleted;
  }

  async bulkDelete(ids: string[]) {
    const deleted: ExpressionEntity[] = [];
    for (const id of ids) {
      const expression = await this.delete(id);
      if (expression) deleted.push(expression);
    }
    return deleted;
  }

  async publish(id: string) {
    const current = await this.expressions.findById(id);
    if (!current || current.status !== "finished") return null;
    return this.expressions.updateById(id, { status: "published" });
  }

  async finish(id: string) {
    const current = await this.expressions.findById(id);
    if (!current) return null;
    return this.expressions.updateById(id, { status: "finished" });
  }
}
