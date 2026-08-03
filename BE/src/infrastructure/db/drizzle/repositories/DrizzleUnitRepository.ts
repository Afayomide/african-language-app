import { and, asc, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { units, type NewUnitRow, type UnitRow } from "../schema.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { UnitEntity } from "../../../../domain/entities/Unit.js";
import type {
  UnitAiPreviewPlanUpdateInput,
  UnitAiRunUpdateInput,
  UnitCreateInput,
  UnitListFilter,
  UnitRepository,
  UnitUpdateInput
} from "../../../../domain/repositories/UnitRepository.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";
import { normalizeAiPreviewPlan, normalizeAiRun } from "./unitAiSummaries.js";

const notDeleted = () => eq(units.isDeleted, false);
const scopeCols = { language: units.language, languageId: units.languageId };

function toEntity(row: UnitRow): UnitEntity {
  return {
    id: row.id,
    _id: row.id,
    languageId: row.languageId ?? null,
    chapterId: row.chapterId ?? null,
    title: row.title,
    description: String(row.description || ""),
    language: row.language,
    level: row.level,
    kind: row.kind || "core",
    reviewStyle: row.reviewStyle || "none",
    reviewSourceUnitIds: Array.isArray(row.reviewSourceUnitIds) ? row.reviewSourceUnitIds.map(String) : [],
    orderIndex: row.orderIndex,
    status: row.status,
    createdBy: String(row.createdBy),
    lastAiRun: normalizeAiRun(row.lastAiRun),
    lastAiPreviewPlan: normalizeAiPreviewPlan(row.lastAiPreviewPlan),
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleUnitRepository implements UnitRepository {
  private async simpleUpdate(where: SQL, values: Partial<NewUnitRow>): Promise<UnitEntity | null> {
    const rows = await db
      .update(units)
      .set({ ...values, updatedAt: new Date() })
      .where(where)
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findLastOrderIndex(
    language: Language,
    chapterId?: string | null,
    languageId?: string | null
  ): Promise<number | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const conditions: (SQL | undefined)[] = [scoped, notDeleted()];
    if (chapterId === null) conditions.push(isNull(units.chapterId));
    else if (chapterId) conditions.push(eq(units.chapterId, chapterId));

    const rows = await db
      .select({ orderIndex: units.orderIndex })
      .from(units)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(units.orderIndex), desc(units.createdAt))
      .limit(1);

    return rows[0]?.orderIndex ?? null;
  }

  async create(input: UnitCreateInput): Promise<UnitEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const [row] = await db
      .insert(units)
      .values({
        chapterId: input.chapterId ?? null,
        languageId: languageId ?? null,
        title: input.title,
        description: input.description ?? "",
        language: input.language,
        level: input.level,
        kind: input.kind ?? "core",
        reviewStyle: input.reviewStyle ?? "none",
        reviewSourceUnitIds: input.reviewSourceUnitIds ?? [],
        orderIndex: input.orderIndex,
        status: input.status,
        createdBy: input.createdBy
      })
      .returning();
    return toEntity(row);
  }

  async list(filter: UnitListFilter): Promise<UnitEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.chapterId) conditions.push(eq(units.chapterId, filter.chapterId));
    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (filter.status) {
      conditions.push(
        Array.isArray(filter.status) ? inArray(units.status, filter.status) : eq(units.status, filter.status)
      );
    }
    if (filter.kind) conditions.push(eq(units.kind, filter.kind));

    const rows = await db
      .select()
      .from(units)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(units.language), asc(units.orderIndex), asc(units.createdAt));

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<UnitEntity | null> {
    const rows = await db.select().from(units).where(and(eq(units.id, id), notDeleted())).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(id: string, update: UnitUpdateInput): Promise<UnitEntity | null> {
    const values: Partial<NewUnitRow> = {};

    if (update.language !== undefined) {
      values.language = update.language;
      values.languageId = (await findLanguageIdByCode(update.language)) ?? null;
    }
    if (update.chapterId !== undefined) values.chapterId = update.chapterId;
    if (update.title !== undefined) values.title = update.title;
    if (update.description !== undefined) values.description = update.description;
    if (update.level !== undefined) values.level = update.level;
    if (update.kind !== undefined) values.kind = update.kind;
    if (update.reviewStyle !== undefined) values.reviewStyle = update.reviewStyle;
    if (update.reviewSourceUnitIds !== undefined) values.reviewSourceUnitIds = update.reviewSourceUnitIds;
    if (update.orderIndex !== undefined) values.orderIndex = update.orderIndex;
    if (update.status !== undefined) values.status = update.status;

    return this.simpleUpdate(and(eq(units.id, id), notDeleted()) as SQL, values);
  }

  async updateLastAiRun(id: string, update: UnitAiRunUpdateInput): Promise<UnitEntity | null> {
    return this.simpleUpdate(and(eq(units.id, id), notDeleted()) as SQL, {
      lastAiRun: update.lastAiRun
    });
  }

  async updateLastAiPreviewPlan(id: string, update: UnitAiPreviewPlanUpdateInput): Promise<UnitEntity | null> {
    return this.simpleUpdate(and(eq(units.id, id), notDeleted()) as SQL, {
      lastAiPreviewPlan: update.lastAiPreviewPlan
    });
  }

  async softDeleteById(id: string): Promise<UnitEntity | null> {
    return this.simpleUpdate(and(eq(units.id, id), notDeleted()) as SQL, {
      isDeleted: true,
      deletedAt: new Date()
    });
  }

  async publishById(id: string, now: Date): Promise<UnitEntity | null> {
    return this.simpleUpdate(and(eq(units.id, id), eq(units.status, "finished"), notDeleted()) as SQL, {
      status: "published",
      publishedAt: now
    });
  }

  async findByIdsAndLanguage(
    ids: string[],
    language: Language,
    languageId?: string | null
  ): Promise<Array<{ id: string }>> {
    if (ids.length === 0) return [];
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select({ id: units.id })
      .from(units)
      .where(and(inArray(units.id, ids), scoped, notDeleted()));
    return rows.map((row) => ({ id: row.id }));
  }

  async reorderByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(units)
          .set({ orderIndex: index, updatedAt: new Date() })
          .where(and(eq(units.id, id), notDeleted()));
      }
    });
  }

  async listByLanguage(language: Language, languageId?: string | null): Promise<UnitEntity[]> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(units)
      .where(and(scoped, notDeleted()))
      .orderBy(asc(units.orderIndex), asc(units.createdAt));
    return rows.map(toEntity);
  }

  async listByChapterId(chapterId: string): Promise<UnitEntity[]> {
    const rows = await db
      .select()
      .from(units)
      .where(and(eq(units.chapterId, chapterId), notDeleted()))
      .orderBy(asc(units.orderIndex), asc(units.createdAt));
    return rows.map(toEntity);
  }
}
