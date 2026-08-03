import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { lessonContentItems, type LessonContentItemRow } from "../schema.js";
import type { LessonContentItemEntity } from "../../../../domain/entities/LessonContentItem.js";
import type { ContentType } from "../../../../domain/entities/Content.js";
import type {
  LessonContentItemCreateInput,
  LessonContentItemListFilter,
  LessonContentItemRepository
} from "../../../../domain/repositories/LessonContentItemRepository.js";

function toEntity(row: LessonContentItemRow): LessonContentItemEntity {
  return {
    id: row.id,
    _id: row.id,
    lessonId: String(row.lessonId),
    unitId: String(row.unitId),
    contentType: row.contentType,
    contentId: String(row.contentId),
    role: row.role,
    stageIndex: row.stageIndex == null ? null : Number(row.stageIndex),
    orderIndex: Number(row.orderIndex || 0),
    createdBy: String(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toValues(input: LessonContentItemCreateInput) {
  return {
    lessonId: input.lessonId,
    unitId: input.unitId,
    contentType: input.contentType,
    contentId: input.contentId,
    role: input.role,
    stageIndex: input.stageIndex ?? null,
    orderIndex: input.orderIndex ?? 0,
    createdBy: input.createdBy
  };
}

export class DrizzleLessonContentItemRepository implements LessonContentItemRepository {
  async create(input: LessonContentItemCreateInput): Promise<LessonContentItemEntity> {
    const [row] = await db.insert(lessonContentItems).values(toValues(input)).returning();
    return toEntity(row);
  }

  async list(filter: LessonContentItemListFilter): Promise<LessonContentItemEntity[]> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.lessonId) conditions.push(eq(lessonContentItems.lessonId, filter.lessonId));
    if (filter.unitId) conditions.push(eq(lessonContentItems.unitId, filter.unitId));
    if (filter.contentType) conditions.push(eq(lessonContentItems.contentType, filter.contentType));
    if (filter.contentId) conditions.push(eq(lessonContentItems.contentId, filter.contentId));
    if (filter.role) conditions.push(eq(lessonContentItems.role, filter.role));

    const rows = await db
      .select()
      .from(lessonContentItems)
      .where(conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined)
      .orderBy(asc(lessonContentItems.orderIndex), asc(lessonContentItems.createdAt));

    return rows.map(toEntity);
  }

  async listByContent(contentType: ContentType, contentIds: string[]): Promise<LessonContentItemEntity[]> {
    if (contentIds.length === 0) return [];
    const rows = await db
      .select()
      .from(lessonContentItems)
      .where(and(eq(lessonContentItems.contentType, contentType), inArray(lessonContentItems.contentId, contentIds)))
      .orderBy(asc(lessonContentItems.orderIndex), asc(lessonContentItems.createdAt));
    return rows.map(toEntity);
  }

  async replaceForLesson(
    lessonId: string,
    items: LessonContentItemCreateInput[]
  ): Promise<LessonContentItemEntity[]> {
    return db.transaction(async (tx) => {
      await tx.delete(lessonContentItems).where(eq(lessonContentItems.lessonId, lessonId));
      if (items.length === 0) return [];
      const rows = await tx.insert(lessonContentItems).values(items.map(toValues)).returning();
      return rows.map(toEntity);
    });
  }

  async replaceForContent(
    contentType: ContentType,
    contentId: string,
    items: LessonContentItemCreateInput[]
  ): Promise<LessonContentItemEntity[]> {
    return db.transaction(async (tx) => {
      await tx
        .delete(lessonContentItems)
        .where(and(eq(lessonContentItems.contentType, contentType), eq(lessonContentItems.contentId, contentId)));
      if (items.length === 0) return [];
      const rows = await tx.insert(lessonContentItems).values(items.map(toValues)).returning();
      return rows.map(toEntity);
    });
  }

  async deleteByLessonId(lessonId: string): Promise<void> {
    await db.delete(lessonContentItems).where(eq(lessonContentItems.lessonId, lessonId));
  }
}
