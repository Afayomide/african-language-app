import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { imageAssets, type ImageAssetRow, type NewImageAssetRow } from "../schema.js";
import type { ImageAssetEntity } from "../../../../domain/entities/ImageAsset.js";
import type {
  ImageAssetCreateInput,
  ImageAssetListFilter,
  ImageAssetPageFilter,
  ImageAssetRepository,
  ImageAssetUpdateInput
} from "../../../../domain/repositories/ImageAssetRepository.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import { likePattern } from "./contentMappers.js";

const notDeleted = () => eq(imageAssets.isDeleted, false);

/** Replaces the Mongoose pre("validate") hook, which ran on create AND save. */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((item) => String(item || "").trim()).filter(Boolean)));
}

function toEntity(row: ImageAssetRow): ImageAssetEntity {
  return {
    id: row.id,
    _id: row.id,
    url: String(row.url || ""),
    thumbnailUrl: String(row.thumbnailUrl || ""),
    storageKey: String(row.storageKey || ""),
    mimeType: String(row.mimeType || ""),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    description: String(row.description || ""),
    altText: String(row.altText || ""),
    tags: normalizeTags(row.tags as string[]),
    languageNeutralLabel: String(row.languageNeutralLabel || ""),
    status: row.status,
    uploadedBy: String(row.uploadedBy),
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleImageAssetRepository implements ImageAssetRepository {
  async create(input: ImageAssetCreateInput): Promise<ImageAssetEntity> {
    const [row] = await db
      .insert(imageAssets)
      .values({
        url: input.url,
        thumbnailUrl: input.thumbnailUrl ?? "",
        storageKey: input.storageKey ?? "",
        mimeType: input.mimeType,
        width: input.width ?? null,
        height: input.height ?? null,
        description: String(input.description || "").trim(),
        altText: String(input.altText || "").trim(),
        tags: normalizeTags(input.tags),
        languageNeutralLabel: String(input.languageNeutralLabel || "").trim(),
        status: input.status ?? "draft",
        uploadedBy: input.uploadedBy
      })
      .returning();
    return toEntity(row);
  }

  async list(filter: ImageAssetListFilter = {}): Promise<ImageAssetEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.status) conditions.push(eq(imageAssets.status, filter.status));
    if (filter.uploadedBy) conditions.push(eq(imageAssets.uploadedBy, filter.uploadedBy));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(imageAssets.id, filter.ids));

    const rows = await db
      .select()
      .from(imageAssets)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(imageAssets.createdAt));
    return rows.map(toEntity);
  }

  async listPaged(filter: ImageAssetPageFilter): Promise<PagedResult<ImageAssetEntity>> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.status) conditions.push(eq(imageAssets.status, filter.status));
    if (filter.uploadedBy) conditions.push(eq(imageAssets.uploadedBy, filter.uploadedBy));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(imageAssets.id, filter.ids));
    if (filter.search) {
      const like = likePattern(filter.search);
      conditions.push(
        or(
          ilike(imageAssets.description, like),
          ilike(imageAssets.altText, like),
          sql`array_to_string(${imageAssets.tags}, ' ') ilike ${like}`,
          ilike(imageAssets.languageNeutralLabel, like),
          ilike(imageAssets.mimeType, like)
        )
      );
    }

    const where = and(...conditions.filter(Boolean));
    const [totals] = await db.select({ total: count() }).from(imageAssets).where(where);
    const total = Number(totals?.total ?? 0);

    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);

    const rows = await db
      .select()
      .from(imageAssets)
      .where(where)
      .orderBy(desc(imageAssets.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: rows.map(toEntity), total };
  }

  async findById(id: string): Promise<ImageAssetEntity | null> {
    const rows = await db.select().from(imageAssets).where(and(eq(imageAssets.id, id), notDeleted())).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<ImageAssetEntity[]> {
    if (!ids.length) return [];
    const rows = await db.select().from(imageAssets).where(and(inArray(imageAssets.id, ids), notDeleted()));
    return rows.map(toEntity);
  }

  async updateById(id: string, update: ImageAssetUpdateInput): Promise<ImageAssetEntity | null> {
    const values: Partial<NewImageAssetRow> = { updatedAt: new Date() };
    if (update.url !== undefined) values.url = update.url;
    if (update.thumbnailUrl !== undefined) values.thumbnailUrl = update.thumbnailUrl;
    if (update.storageKey !== undefined) values.storageKey = update.storageKey;
    if (update.mimeType !== undefined) values.mimeType = update.mimeType;
    if (update.width !== undefined) values.width = update.width;
    if (update.height !== undefined) values.height = update.height;
    if (update.description !== undefined) values.description = String(update.description || "").trim();
    if (update.altText !== undefined) values.altText = String(update.altText || "").trim();
    if (update.tags !== undefined) values.tags = normalizeTags(update.tags);
    if (update.languageNeutralLabel !== undefined) {
      values.languageNeutralLabel = String(update.languageNeutralLabel || "").trim();
    }
    if (update.status !== undefined) values.status = update.status;

    const rows = await db
      .update(imageAssets)
      .set(values)
      .where(and(eq(imageAssets.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<ImageAssetEntity | null> {
    const rows = await db
      .update(imageAssets)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(and(eq(imageAssets.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
