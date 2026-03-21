import type { ContentType, CurriculumRole } from "../../domain/entities/Content.js";
import type { LessonBlock, LessonEntity, LessonStage } from "../../domain/entities/Lesson.js";
import type { UnitEntity } from "../../domain/entities/Unit.js";
import type { LessonContentItemCreateInput } from "../../domain/repositories/LessonContentItemRepository.js";
import type { LessonContentItemRepository } from "../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { UnitContentItemCreateInput } from "../../domain/repositories/UnitContentItemRepository.js";
import type { UnitContentItemRepository } from "../../domain/repositories/UnitContentItemRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";

function sortStages(stages: LessonStage[]) {
  return [...(stages || [])].sort((left, right) => left.orderIndex - right.orderIndex);
}

export class ContentCurriculumService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly unitContentItems: UnitContentItemRepository
  ) {}

  private async buildLessonPositionMap(unit: UnitEntity) {
    const unitsInScope = unit.chapterId
      ? await this.units.listByChapterId(unit.chapterId)
      : await this.units.listByLanguage(unit.language);
    const scopedUnits = unitsInScope
      .filter((item) => item.status !== "draft")
      .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime());

    const lessonMap = new Map<string, number>();
    let cursor = 0;
    for (const scopedUnit of scopedUnits) {
      const lessons = await this.lessons.listByUnitId(scopedUnit.id);
      const sortedLessons = lessons
        .filter((lesson) => lesson.status !== "draft")
        .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime());
      for (const lesson of sortedLessons) {
        lessonMap.set(lesson.id, cursor);
        cursor += 1;
      }
    }
    return lessonMap;
  }

  async wasContentIntroducedBeforeLesson(input: {
    lesson: LessonEntity;
    contentType: ContentType;
    contentId: string;
  }) {
    const unit = await this.units.findById(input.lesson.unitId);
    if (!unit) return false;

    const priorIntroductions = await this.lessonContentItems.list({
      contentType: input.contentType,
      contentId: input.contentId,
      role: "introduce"
    });
    if (priorIntroductions.length === 0) return false;

    const lessonPositionMap = await this.buildLessonPositionMap(unit);
    const currentPosition = lessonPositionMap.get(input.lesson.id) ?? Number.MAX_SAFE_INTEGER;

    return priorIntroductions.some((item) => item.lessonId !== input.lesson.id && (lessonPositionMap.get(item.lessonId) ?? Number.MAX_SAFE_INTEGER) < currentPosition);
  }

  async replaceLessonContentItems(input: {
    lesson: LessonEntity;
    createdBy: string;
    introduced: Array<{ contentType: ContentType; contentId: string }>;
    review?: Array<{ contentType: ContentType; contentId: string }>;
    practice?: Array<{ contentType: ContentType; contentId: string }>;
  }) {
    const items: LessonContentItemCreateInput[] = [];
    const seen = new Set<string>();
    let orderIndex = 0;
    const pushItems = (rows: Array<{ contentType: ContentType; contentId: string }>, role: CurriculumRole, stageIndex: number | null) => {
      for (const row of rows) {
        const key = `${row.contentType}:${row.contentId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          lessonId: input.lesson.id,
          unitId: input.lesson.unitId,
          contentType: row.contentType,
          contentId: row.contentId,
          role,
          stageIndex,
          orderIndex,
          createdBy: input.createdBy
        });
        orderIndex += 1;
      }
    };

    pushItems(input.introduced, "introduce", 0);
    pushItems(input.review || [], "review", 1);
    pushItems(input.practice || [], "practice", 2);

    return this.lessonContentItems.replaceForLesson(input.lesson.id, items);
  }

  async replaceUnitContentItems(input: {
    unitId: string;
    createdBy: string;
    introduced: Array<{ contentType: ContentType; contentId: string }>;
    review?: Array<{ contentType: ContentType; contentId: string; sourceUnitId?: string | null }>;
  }) {
    const items: UnitContentItemCreateInput[] = [];
    const seen = new Set<string>();
    let orderIndex = 0;

    for (const row of input.introduced) {
      const key = `${row.contentType}:${row.contentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        unitId: input.unitId,
        contentType: row.contentType,
        contentId: row.contentId,
        role: "introduce",
        orderIndex,
        sourceUnitId: null,
        createdBy: input.createdBy
      });
      orderIndex += 1;
    }

    for (const row of input.review || []) {
      const key = `${row.contentType}:${row.contentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        unitId: input.unitId,
        contentType: row.contentType,
        contentId: row.contentId,
        role: "review",
        orderIndex,
        sourceUnitId: row.sourceUnitId ?? null,
        createdBy: input.createdBy
      });
      orderIndex += 1;
    }

    return this.unitContentItems.replaceForUnit(input.unitId, items);
  }

  extractIntroducedContentFromStages(stages: LessonStage[]) {
    const introduced: Array<{ contentType: ContentType; contentId: string }> = [];
    const seen = new Set<string>();
    const firstStage = sortStages(stages)[0];
    if (!firstStage) return introduced;

    for (const block of firstStage.blocks || []) {
      if (block.type !== "content") continue;
      const key = `${block.contentType}:${block.refId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      introduced.push({ contentType: block.contentType, contentId: block.refId });
    }

    return introduced;
  }

  extractReferencedContentFromStages(stages: LessonStage[]) {
    const rows: Array<{ contentType: ContentType; contentId: string }> = [];
    const seen = new Set<string>();

    for (const stage of sortStages(stages)) {
      for (const block of stage.blocks || []) {
        if (block.type !== "content") continue;
        const key = `${block.contentType}:${block.refId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ contentType: block.contentType, contentId: block.refId });
      }
    }

    return rows;
  }
}
