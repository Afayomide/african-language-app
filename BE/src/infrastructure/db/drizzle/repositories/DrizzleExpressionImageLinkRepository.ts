import { and, desc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { expressionImageLinks, type ExpressionImageLinkRow } from "../schema.js";
import type { ExpressionImageLinkEntity } from "../../../../domain/entities/ExpressionImageLink.js";
import type {
  ExpressionImageLinkCreateInput,
  ExpressionImageLinkRepository,
  ExpressionImageLinkUpdateInput
} from "../../../../domain/repositories/ExpressionImageLinkRepository.js";

const notDeleted = () => eq(expressionImageLinks.isDeleted, false);

function normalizeTranslationIndex(value?: number | null): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

/**
 * Mongo matched `translationIndex: null` directly; SQL needs IS NULL, since
 * `= NULL` never matches. Getting this wrong would silently break the
 * "one primary image per (expression, translationIndex)" rule.
 */
function translationIndexCondition(value: number | null): SQL {
  return value === null
    ? isNull(expressionImageLinks.translationIndex)
    : eq(expressionImageLinks.translationIndex, value);
}

function toEntity(row: ExpressionImageLinkRow): ExpressionImageLinkEntity {
  return {
    id: row.id,
    _id: row.id,
    expressionId: String(row.expressionId),
    translationIndex: normalizeTranslationIndex(row.translationIndex),
    imageAssetId: String(row.imageAssetId),
    isPrimary: Boolean(row.isPrimary),
    notes: String(row.notes || ""),
    createdBy: String(row.createdBy),
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleExpressionImageLinkRepository implements ExpressionImageLinkRepository {
  async create(input: ExpressionImageLinkCreateInput): Promise<ExpressionImageLinkEntity> {
    const translationIndex = normalizeTranslationIndex(input.translationIndex);

    // reuse an existing active link for the same (expression, asset, index)
    const existingRows = await db
      .select()
      .from(expressionImageLinks)
      .where(
        and(
          eq(expressionImageLinks.expressionId, input.expressionId),
          eq(expressionImageLinks.imageAssetId, input.imageAssetId),
          translationIndexCondition(translationIndex),
          notDeleted()
        )
      )
      .limit(1);

    const existing = existingRows[0];
    if (existing) {
      if (input.isPrimary) {
        await this.clearPrimaryForExpression(input.expressionId, translationIndex, existing.id);
      }
      const [updated] = await db
        .update(expressionImageLinks)
        .set({
          ...(input.isPrimary ? { isPrimary: true } : {}),
          ...(input.notes !== undefined ? { notes: String(input.notes || "") } : {}),
          updatedAt: new Date()
        })
        .where(eq(expressionImageLinks.id, existing.id))
        .returning();
      return toEntity(updated);
    }

    if (input.isPrimary) {
      await this.clearPrimaryForExpression(input.expressionId, translationIndex);
    }

    const [row] = await db
      .insert(expressionImageLinks)
      .values({
        expressionId: input.expressionId,
        translationIndex,
        imageAssetId: input.imageAssetId,
        isPrimary: Boolean(input.isPrimary),
        notes: input.notes || "",
        createdBy: input.createdBy
      })
      .returning();
    return toEntity(row);
  }

  async listByExpressionId(expressionId: string): Promise<ExpressionImageLinkEntity[]> {
    const rows = await db
      .select()
      .from(expressionImageLinks)
      .where(and(eq(expressionImageLinks.expressionId, expressionId), notDeleted()))
      .orderBy(desc(expressionImageLinks.isPrimary), desc(expressionImageLinks.createdAt));
    return rows.map(toEntity);
  }

  async listByExpressionIds(expressionIds: string[]): Promise<ExpressionImageLinkEntity[]> {
    if (!expressionIds.length) return [];
    const rows = await db
      .select()
      .from(expressionImageLinks)
      .where(and(inArray(expressionImageLinks.expressionId, expressionIds), notDeleted()))
      .orderBy(desc(expressionImageLinks.isPrimary), desc(expressionImageLinks.createdAt));
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<ExpressionImageLinkEntity | null> {
    const rows = await db
      .select()
      .from(expressionImageLinks)
      .where(and(eq(expressionImageLinks.id, id), notDeleted()))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findActiveByExpressionAndAsset(
    expressionId: string,
    imageAssetId: string,
    translationIndex?: number | null
  ): Promise<ExpressionImageLinkEntity | null> {
    const rows = await db
      .select()
      .from(expressionImageLinks)
      .where(
        and(
          eq(expressionImageLinks.expressionId, expressionId),
          eq(expressionImageLinks.imageAssetId, imageAssetId),
          translationIndexCondition(normalizeTranslationIndex(translationIndex)),
          notDeleted()
        )
      )
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(
    id: string,
    update: ExpressionImageLinkUpdateInput
  ): Promise<ExpressionImageLinkEntity | null> {
    const currentRows = await db
      .select()
      .from(expressionImageLinks)
      .where(and(eq(expressionImageLinks.id, id), notDeleted()))
      .limit(1);
    const current = currentRows[0];
    if (!current) return null;

    const nextTranslationIndex =
      update.translationIndex !== undefined
        ? normalizeTranslationIndex(update.translationIndex)
        : normalizeTranslationIndex(current.translationIndex);

    if (update.isPrimary) {
      await this.clearPrimaryForExpression(current.expressionId, nextTranslationIndex, current.id);
    }

    const [updated] = await db
      .update(expressionImageLinks)
      .set({
        ...(update.translationIndex !== undefined ? { translationIndex: nextTranslationIndex } : {}),
        ...(update.imageAssetId !== undefined ? { imageAssetId: update.imageAssetId } : {}),
        ...(update.isPrimary !== undefined ? { isPrimary: Boolean(update.isPrimary) } : {}),
        ...(update.notes !== undefined ? { notes: String(update.notes || "") } : {}),
        updatedAt: new Date()
      })
      .where(eq(expressionImageLinks.id, id))
      .returning();

    return updated ? toEntity(updated) : null;
  }

  async clearPrimaryForExpression(
    expressionId: string,
    translationIndex?: number | null,
    excludeId?: string
  ): Promise<void> {
    const conditions: (SQL | undefined)[] = [
      eq(expressionImageLinks.expressionId, expressionId),
      notDeleted(),
      translationIndexCondition(normalizeTranslationIndex(translationIndex))
    ];
    if (excludeId) conditions.push(ne(expressionImageLinks.id, excludeId));

    await db
      .update(expressionImageLinks)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(...conditions.filter(Boolean)));
  }

  async softDeleteById(id: string, now: Date): Promise<ExpressionImageLinkEntity | null> {
    const rows = await db
      .update(expressionImageLinks)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(and(eq(expressionImageLinks.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async softDeleteByImageAssetId(imageAssetId: string, now: Date): Promise<void> {
    await db
      .update(expressionImageLinks)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(and(eq(expressionImageLinks.imageAssetId, imageAssetId), notDeleted()));
  }
}
