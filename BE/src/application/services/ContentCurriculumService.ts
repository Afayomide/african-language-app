import type { ContentType, CurriculumRole } from "../../domain/entities/Content.js";
import type { LessonBlock, LessonEntity, LessonStage } from "../../domain/entities/Lesson.js";
import type { UnitEntity } from "../../domain/entities/Unit.js";
import type { ChapterRepository } from "../../domain/repositories/ChapterRepository.js";
import type { LessonContentItemCreateInput } from "../../domain/repositories/LessonContentItemRepository.js";
import type { LessonContentItemRepository } from "../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { UnitContentItemCreateInput } from "../../domain/repositories/UnitContentItemRepository.js";
import type { UnitContentItemRepository } from "../../domain/repositories/UnitContentItemRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";

function sortStages(stages: LessonStage[]) {
  return [...(stages || [])].sort((left, right) => left.orderIndex - right.orderIndex);
}

/** A lesson's position in the course: chapter, then unit, then lesson. */
type CoursePosition = [number, number, number, number, number];

function isBefore(left: CoursePosition, right: CoursePosition) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

export class ContentCurriculumService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly unitContentItems: UnitContentItemRepository,
    /**
     * Optional: without it, units are ordered only among themselves, so two units in
     * different chapters compare by their own order index alone.
     */
    private readonly chapters?: ChapterRepository
  ) {}

  /**
   * Where a lesson sits in the course a learner walks through: chapter order, then unit
   * order (createdAt breaking ties, as every listing does), then lesson order.
   */
  private async coursePositionOf(lesson: LessonEntity, cache: Map<string, CoursePosition>): Promise<CoursePosition> {
    const cached = cache.get(lesson.id);
    if (cached) return cached;
    const unit = lesson.unitId ? await this.units.findById(lesson.unitId) : null;
    const chapter = unit?.chapterId && this.chapters ? await this.chapters.findById(unit.chapterId) : null;
    const position: CoursePosition = [
      chapter?.orderIndex ?? 0,
      unit?.orderIndex ?? 0,
      unit?.createdAt ? unit.createdAt.getTime() : 0,
      lesson.orderIndex ?? 0,
      lesson.createdAt ? lesson.createdAt.getTime() : 0
    ];
    cache.set(lesson.id, position);
    return position;
  }

  /**
   * Was this content taught in a lesson the learner reaches BEFORE this one?
   *
   * Order matters: this answer decides whether the item is presented as new (with its
   * "what does this mean?" questions) or as review. Comparing by existence alone made any
   * introduction anywhere count, including one further along the course, so a word could be
   * introduced in unit 15 and then silently demoted to review when unit 1 tried to teach it
   * -- and the same word could be marked "new" in five different lessons with nothing
   * noticing.
   */
  async wasContentIntroducedBeforeLesson(input: {
    lesson: LessonEntity;
    contentType: ContentType;
    contentId: string;
  }) {
    const introductions = (
      await this.lessonContentItems.list({
        contentType: input.contentType,
        contentId: input.contentId,
        role: "introduce"
      })
    ).filter((item) => item.lessonId !== input.lesson.id);
    if (introductions.length === 0) return false;

    const cache = new Map<string, CoursePosition>();
    const here = await this.coursePositionOf(input.lesson, cache);
    for (const item of introductions) {
      // findById skips deleted lessons, and a lesson the learner never sees taught nothing.
      const lesson = await this.lessons.findById(item.lessonId);
      if (!lesson) continue;
      if (isBefore(await this.coursePositionOf(lesson, cache), here)) return true;
    }
    return false;
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

  async rebuildUnitContentItemsFromLessons(input: {
    unitId: string;
    createdBy: string;
  }) {
    const unitLessons = (await this.lessons.list({ unitId: input.unitId }))
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime());
    const lessonOrderMap = new Map(unitLessons.map((lesson, index) => [lesson.id, index]));
    const lessonItems = await this.lessonContentItems.list({ unitId: input.unitId });
    const sortedItems = lessonItems
      .slice()
      .sort((left, right) => {
        const lessonDiff = (lessonOrderMap.get(left.lessonId) ?? 0) - (lessonOrderMap.get(right.lessonId) ?? 0);
        if (lessonDiff !== 0) return lessonDiff;
        const stageDiff = (left.stageIndex ?? Number.MAX_SAFE_INTEGER) - (right.stageIndex ?? Number.MAX_SAFE_INTEGER);
        if (stageDiff !== 0) return stageDiff;
        return left.orderIndex - right.orderIndex;
      });

    const introduced: Array<{ contentType: ContentType; contentId: string }> = [];
    const review: Array<{ contentType: ContentType; contentId: string; sourceUnitId?: string | null }> = [];
    const introducedKeys = new Set<string>();
    const reviewKeys = new Set<string>();

    for (const item of sortedItems) {
      const key = `${item.contentType}:${item.contentId}`;
      if (item.role === "introduce" && !introducedKeys.has(key)) {
        introduced.push({ contentType: item.contentType, contentId: item.contentId });
        introducedKeys.add(key);
        continue;
      }

      if ((item.role === "review" || item.role === "practice") && !reviewKeys.has(key)) {
        review.push({ contentType: item.contentType, contentId: item.contentId, sourceUnitId: null });
        reviewKeys.add(key);
      }
    }

    return this.replaceUnitContentItems({
      unitId: input.unitId,
      createdBy: input.createdBy,
      introduced,
      review
    });
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
