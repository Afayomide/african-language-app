import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { ProverbRepository } from "../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";

type StageRefIds = {
  expressionIds: string[];
  proverbIds: string[];
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map(String).filter(Boolean)));
}

function collectStageRefIds(lesson: LessonEntity): StageRefIds {
  const expressionIds: string[] = [];
  const proverbIds: string[] = [];

  for (const stage of lesson.stages || []) {
    for (const block of stage.blocks || []) {
      if (!("refId" in block) || !block.refId) continue;
      if (block.type === "content" && block.contentType === "expression") expressionIds.push(block.refId);
      if (block.type === "proverb") proverbIds.push(block.refId);
    }
  }

  return {
    expressionIds: uniqueIds(expressionIds),
    proverbIds: uniqueIds(proverbIds)
  };
}

function sortDeleted<T extends { deletedAt?: Date | null; updatedAt: Date }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftTime = left.deletedAt ? new Date(left.deletedAt).getTime() : new Date(left.updatedAt).getTime();
    const rightTime = right.deletedAt ? new Date(right.deletedAt).getTime() : new Date(right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}

export class UnitDeletedEntriesService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly expressions: ExpressionRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {}

  async list(unitId: string): Promise<{ lessons: LessonEntity[]; expressions: ExpressionEntity[] }> {
    const [activeLessons, deletedLessons] = await Promise.all([
      this.lessons.listByUnitId(unitId),
      this.lessons.listDeletedByUnitId(unitId)
    ]);

    const expressionIds = uniqueIds(
      [...activeLessons, ...deletedLessons].flatMap((lesson) => collectStageRefIds(lesson).expressionIds)
    );

    const deletedExpressions = expressionIds.length > 0
      ? await this.expressions.listDeleted({ ids: expressionIds })
      : [];

    return {
      lessons: sortDeleted(deletedLessons),
      expressions: sortDeleted(deletedExpressions)
    };
  }

  async restoreLesson(unitId: string, lessonId: string): Promise<LessonEntity | null> {
    const deletedLessons = await this.lessons.listDeletedByUnitId(unitId);
    const targetLesson = deletedLessons.find((lesson) => lesson.id === lessonId);
    if (!targetLesson) return null;

    const lastOrderIndex = await this.lessons.findLastOrderIndex(unitId);
    const restoredLesson = await this.lessons.restoreById(lessonId, (lastOrderIndex ?? -1) + 1);
    if (!restoredLesson) return null;

    const { expressionIds, proverbIds } = collectStageRefIds(targetLesson);

    await Promise.all([
      this.proverbs.restoreByLessonId(restoredLesson.id),
      this.questions.restoreByLessonId(restoredLesson.id)
    ]);

    for (const expressionId of expressionIds) {
      await this.expressions.restoreById(expressionId);
    }

    for (const proverbId of proverbIds) {
      await this.proverbs.restoreById(proverbId, [restoredLesson.id]);
    }

    return restoredLesson;
  }

  async restoreExpression(unitId: string, expressionId: string): Promise<ExpressionEntity | null> {
    const { expressions } = await this.list(unitId);
    const targetExpression = expressions.find((expression) => expression.id === expressionId);
    if (!targetExpression) return null;
    return this.expressions.restoreById(expressionId);
  }
}
