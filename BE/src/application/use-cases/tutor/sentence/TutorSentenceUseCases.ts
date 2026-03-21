import type { ContentComponentRef } from "../../../../domain/entities/Content.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { SentenceEntity } from "../../../../domain/entities/Sentence.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { SentenceCreateInput, SentenceRepository, SentenceUpdateInput } from "../../../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";

export class TutorSentenceUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly sentences: SentenceRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly questions: QuestionRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository
  ) {}

  private async validateLessons(lessonIds: string[], language: Language) {
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) return [];
    const lessons = await Promise.all(lessonIds.map((lessonId) => this.lessons.findById(lessonId)));
    if (lessons.some((lesson) => !lesson || lesson.language !== language)) return null;
    return lessons;
  }

  private async normalizeComponents(language: Language, components: ContentComponentRef[]) {
    if (!Array.isArray(components) || components.length === 0) return [];
    const normalized: ContentComponentRef[] = [];
    for (let index = 0; index < components.length; index += 1) {
      const component = components[index];
      if (!component || (component.type !== "word" && component.type !== "expression") || !component.refId) {
        return null;
      }
      const entity = component.type === "word"
        ? await this.words.findById(component.refId)
        : await this.expressions.findById(component.refId);
      if (!entity || entity.language !== language) return null;
      normalized.push({
        type: component.type,
        refId: entity.id,
        orderIndex: Number.isInteger(component.orderIndex) ? Number(component.orderIndex) : index,
        textSnapshot: entity.text
      });
    }
    return normalized.sort((left, right) => left.orderIndex - right.orderIndex);
  }

  async create(input: SentenceCreateInput & { lessonIds?: string[]; createdBy: string }, tutorLanguage: Language) {
    if (input.language !== tutorLanguage) return null;
    const lessonIds = Array.isArray(input.lessonIds) ? input.lessonIds : [];
    const lessons = await this.validateLessons(lessonIds, tutorLanguage);
    if (!lessons) return null;
    const components = await this.normalizeComponents(tutorLanguage, input.components || []);
    if (!components || components.length === 0) return "invalid_components" as const;

    const created = await this.sentences.create({ ...input, components });
    if (lessons.length > 0) {
      await this.lessonContentItems.replaceForContent(
        "sentence",
        created.id,
        lessons.map((lesson, index) => ({
          lessonId: lesson!.id,
          unitId: lesson!.unitId,
          contentType: "sentence",
          contentId: created.id,
          role: "practice",
          stageIndex: 2,
          orderIndex: index,
          createdBy: input.createdBy
        }))
      );
    }
    return created;
  }

  async list(filter: { status?: "draft" | "finished" | "published" }, tutorLanguage: Language) {
    return this.sentences.list({ ...filter, language: tutorLanguage });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const sentence = await this.sentences.findById(id);
    if (!sentence || sentence.language !== tutorLanguage) return null;
    return sentence;
  }

  async updateInScope(id: string, tutorLanguage: Language, update: SentenceUpdateInput & { lessonIds?: string[]; createdBy: string }) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    if (update.lessonIds) {
      const lessons = await this.validateLessons(update.lessonIds, tutorLanguage);
      if (!lessons) return "target_lesson_out_of_scope" as const;
      await this.lessonContentItems.replaceForContent(
        "sentence",
        id,
        lessons.map((lesson, index) => ({
          lessonId: lesson!.id,
          unitId: lesson!.unitId,
          contentType: "sentence",
          contentId: id,
          role: "practice",
          stageIndex: 2,
          orderIndex: index,
          createdBy: update.createdBy
        }))
      );
    }

    const normalizedComponents = update.components
      ? await this.normalizeComponents(tutorLanguage, update.components)
      : undefined;
    if (update.components && (!normalizedComponents || normalizedComponents.length === 0)) {
      return "invalid_components" as const;
    }

    const { lessonIds: _lessonIds, createdBy: _createdBy, ...sentenceUpdate } = update;
    return this.sentences.updateById(id, {
      ...sentenceUpdate,
      ...(normalizedComponents ? { components: normalizedComponents } : {})
    });
  }

  async deleteInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    const deleted = await this.sentences.softDeleteById(id);
    if (!deleted) return null;
    await this.lessonContentItems.replaceForContent("sentence", id, []);
    await this.questions.softDeleteBySource("sentence", id, new Date());
    return deleted;
  }

  async bulkDeleteInScope(ids: string[], tutorLanguage: Language) {
    const deleted: SentenceEntity[] = [];
    for (const id of ids) {
      const sentence = await this.deleteInScope(id, tutorLanguage);
      if (sentence) deleted.push(sentence);
    }
    return deleted;
  }

  async finishInScope(id: string, tutorLanguage: Language) {
    const current = await this.getByIdInScope(id, tutorLanguage);
    if (!current) return null;
    return this.sentences.updateById(id, { status: "finished" });
  }
}
