import { and, asc, eq, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { unitContentItems, type UnitContentItemRow } from "../schema.js";
import type { UnitContentItemEntity } from "../../../../domain/entities/UnitContentItem.js";
import type {
  UnitContentItemCreateInput,
  UnitContentItemListFilter,
  UnitContentItemRepository
} from "../../../../domain/repositories/UnitContentItemRepository.js";

function toEntity(row: UnitContentItemRow): UnitContentItemEntity {
  return {
    id: row.id,
    _id: row.id,
    unitId: String(row.unitId),
    contentType: row.contentType,
    contentId: String(row.contentId),
    role: row.role,
    orderIndex: Number(row.orderIndex || 0),
    sourceUnitId: row.sourceUnitId ? String(row.sourceUnitId) : null,
    createdBy: String(row.createdBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toValues(input: UnitContentItemCreateInput) {
  return {
    unitId: input.unitId,
    contentType: input.contentType,
    contentId: input.contentId,
    role: input.role,
    orderIndex: input.orderIndex ?? 0,
    sourceUnitId: input.sourceUnitId ?? null,
    createdBy: input.createdBy
  };
}

export class DrizzleUnitContentItemRepository implements UnitContentItemRepository {
  async create(input: UnitContentItemCreateInput): Promise<UnitContentItemEntity> {
    const [row] = await db.insert(unitContentItems).values(toValues(input)).returning();
    return toEntity(row);
  }

  async list(filter: UnitContentItemListFilter): Promise<UnitContentItemEntity[]> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.unitId) conditions.push(eq(unitContentItems.unitId, filter.unitId));
    if (filter.contentType) conditions.push(eq(unitContentItems.contentType, filter.contentType));
    if (filter.contentId) conditions.push(eq(unitContentItems.contentId, filter.contentId));
    if (filter.role) conditions.push(eq(unitContentItems.role, filter.role));

    const rows = await db
      .select()
      .from(unitContentItems)
      .where(conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined)
      .orderBy(asc(unitContentItems.orderIndex), asc(unitContentItems.createdAt));

    return rows.map(toEntity);
  }

  async replaceForUnit(unitId: string, items: UnitContentItemCreateInput[]): Promise<UnitContentItemEntity[]> {
    return db.transaction(async (tx) => {
      await tx.delete(unitContentItems).where(eq(unitContentItems.unitId, unitId));
      if (items.length === 0) return [];
      const rows = await tx.insert(unitContentItems).values(items.map(toValues)).returning();
      return rows.map(toEntity);
    });
  }

  async deleteByUnitId(unitId: string): Promise<void> {
    await db.delete(unitContentItems).where(eq(unitContentItems.unitId, unitId));
  }
}
