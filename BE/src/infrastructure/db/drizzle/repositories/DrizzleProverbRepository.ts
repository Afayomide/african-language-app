import { and, arrayContains, arrayOverlaps, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { proverbs, type NewProverbRow, type ProverbRow } from "../schema.js";
import type { ProverbEntity } from "../../../../domain/entities/Proverb.js";
import type {
  ProverbCreateInput,
  ProverbDeletedListFilter,
  ProverbListFilter,
  ProverbRepository,
  ProverbUpdateInput
} from "../../../../domain/repositories/ProverbRepository.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";

const notDeleted = () => eq(proverbs.isDeleted, false);
const scopeCols = { language: proverbs.language, languageId: proverbs.languageId };

function toEntity(row: ProverbRow): ProverbEntity {
  return {
    id: row.id,
    _id: row.id,
    languageId: row.languageId ?? null,
    lessonIds: Array.isArray(row.lessonIds) ? row.lessonIds.map(String) : [],
    language: row.language,
    text: String(row.text || ""),
    translation: String(row.translation || ""),
    contextNote: String(row.contextNote || ""),
    aiMeta: {
      generatedByAI: Boolean(row.aiMeta?.generatedByAI),
      model: String(row.aiMeta?.model || ""),
      reviewedByAdmin: Boolean(row.aiMeta?.reviewedByAdmin)
    },
    status: row.status,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function uniqueIds(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map(String).filter(Boolean)));
}

export class DrizzleProverbRepository implements ProverbRepository {
  async create(input: ProverbCreateInput): Promise<ProverbEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const text = String(input.text || "").trim();

    const [row] = await db
      .insert(proverbs)
      .values({
        lessonIds: uniqueIds(input.lessonIds),
        deletedLessonIds: [],
        language: input.language,
        languageId: languageId ?? null,
        text,
        // replaces the Mongoose pre("validate") hook
        normalizedText: text.toLowerCase(),
        translation: input.translation ?? "",
        contextNote: input.contextNote ?? "",
        aiMeta: {
          generatedByAI: Boolean(input.aiMeta?.generatedByAI),
          model: String(input.aiMeta?.model || ""),
          reviewedByAdmin: Boolean(input.aiMeta?.reviewedByAdmin)
        },
        status: input.status
      })
      .returning();

    return toEntity(row);
  }

  async list(filter: ProverbListFilter): Promise<ProverbEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.status) conditions.push(eq(proverbs.status, filter.status));
    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    // Mongo `lessonIds: <value>` means "array contains value" -> @>
    if (filter.lessonId) conditions.push(arrayContains(proverbs.lessonIds, [filter.lessonId]));
    // Mongo `lessonIds: {$in: [...]}` means "arrays overlap" -> &&
    if (filter.lessonIds && filter.lessonIds.length > 0) {
      conditions.push(arrayOverlaps(proverbs.lessonIds, filter.lessonIds));
    }

    const rows = await db
      .select()
      .from(proverbs)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(proverbs.createdAt));

    return rows.map(toEntity);
  }

  async listDeleted(filter?: ProverbDeletedListFilter): Promise<ProverbEntity[]> {
    const conditions: (SQL | undefined)[] = [eq(proverbs.isDeleted, true)];
    if (filter?.languageId || filter?.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (Array.isArray(filter?.ids) && filter.ids.length > 0) conditions.push(inArray(proverbs.id, filter.ids));
    if (Array.isArray(filter?.lessonIds) && filter.lessonIds.length > 0) {
      conditions.push(
        or(
          arrayOverlaps(proverbs.lessonIds, filter.lessonIds),
          arrayOverlaps(proverbs.deletedLessonIds, filter.lessonIds)
        )
      );
    }

    const rows = await db
      .select()
      .from(proverbs)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(proverbs.updatedAt), desc(proverbs.createdAt));

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<ProverbEntity | null> {
    const rows = await db.select().from(proverbs).where(and(eq(proverbs.id, id), notDeleted())).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByLessonId(lessonId: string): Promise<ProverbEntity[]> {
    const rows = await db
      .select()
      .from(proverbs)
      .where(and(arrayContains(proverbs.lessonIds, [lessonId]), notDeleted()))
      .orderBy(desc(proverbs.createdAt));
    return rows.map(toEntity);
  }

  async findReusable(
    language: ProverbEntity["language"],
    text: string,
    languageId?: string | null
  ): Promise<ProverbEntity | null> {
    const normalizedText = String(text || "").trim().toLowerCase();
    if (!normalizedText) return null;
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(proverbs)
      .where(and(scoped, eq(proverbs.normalizedText, normalizedText), notDeleted()))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(id: string, update: ProverbUpdateInput): Promise<ProverbEntity | null> {
    const values: Partial<NewProverbRow> = { updatedAt: new Date() };

    if (update.language !== undefined) {
      values.language = update.language;
      values.languageId = (await findLanguageIdByCode(update.language)) ?? null;
    }
    if (Array.isArray(update.lessonIds)) values.lessonIds = uniqueIds(update.lessonIds);
    if (update.text !== undefined) {
      const text = String(update.text || "").trim();
      values.text = text;
      values.normalizedText = text.toLowerCase();
    }
    if (update.translation !== undefined) values.translation = update.translation;
    if (update.contextNote !== undefined) values.contextNote = update.contextNote;
    if (update.status !== undefined) values.status = update.status;
    if (update.aiMeta !== undefined) {
      values.aiMeta = {
        generatedByAI: Boolean(update.aiMeta.generatedByAI),
        model: String(update.aiMeta.model || ""),
        reviewedByAdmin: Boolean(update.aiMeta.reviewedByAdmin)
      };
    }

    const rows = await db
      .update(proverbs)
      .set(values)
      .where(and(eq(proverbs.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<ProverbEntity | null> {
    const rows = await db
      .update(proverbs)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(and(eq(proverbs.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  /**
   * Detach one lesson: pull it from lessonIds ($pull), remember it in
   * deletedLessonIds ($addToSet), then soft-delete any proverb left with no
   * lessons at all — same two-step the Mongo version did.
   */
  async softDeleteByLessonId(lessonId: string, now: Date): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(proverbs)
        .set({
          lessonIds: sql`array_remove(${proverbs.lessonIds}, ${lessonId}::text)`,
          deletedLessonIds: sql`case when ${lessonId}::text = any(${proverbs.deletedLessonIds}) then ${proverbs.deletedLessonIds} else array_append(${proverbs.deletedLessonIds}, ${lessonId}::text) end`,
          updatedAt: new Date()
        })
        .where(and(arrayContains(proverbs.lessonIds, [lessonId]), notDeleted()));

      await tx
        .update(proverbs)
        .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
        .where(and(sql`cardinality(${proverbs.lessonIds}) = 0`, notDeleted()));
    });
  }

  async restoreById(id: string, lessonIdsToAdd: string[] = []): Promise<ProverbEntity | null> {
    return db.transaction(async (tx) => {
      const rows = await tx.select().from(proverbs).where(eq(proverbs.id, id)).limit(1);
      const current = rows[0];
      if (!current) return null;

      const currentLessonIds = Array.isArray(current.lessonIds) ? current.lessonIds.map(String) : [];
      const removedLessonIds = uniqueIds(current.deletedLessonIds as string[]);
      const canRestoreExplicitIds = currentLessonIds.length === 0 && removedLessonIds.length === 0;
      const lessonIdsToRestore = uniqueIds(lessonIdsToAdd).filter(
        (lessonId) =>
          canRestoreExplicitIds || removedLessonIds.includes(lessonId) || currentLessonIds.includes(lessonId)
      );
      const mergedLessonIds = Array.from(new Set([...currentLessonIds, ...lessonIdsToRestore]));
      const remainingDeletedLessonIds = removedLessonIds.filter(
        (lessonId) => !lessonIdsToRestore.includes(lessonId)
      );

      const [updated] = await tx
        .update(proverbs)
        .set({
          lessonIds: mergedLessonIds,
          deletedLessonIds: remainingDeletedLessonIds,
          isDeleted: false,
          deletedAt: null,
          updatedAt: new Date()
        })
        .where(eq(proverbs.id, id))
        .returning();

      return updated ? toEntity(updated) : null;
    });
  }

  async restoreByLessonId(lessonId: string): Promise<void> {
    await db
      .update(proverbs)
      .set({
        lessonIds: sql`case when ${lessonId}::text = any(${proverbs.lessonIds}) then ${proverbs.lessonIds} else array_append(${proverbs.lessonIds}, ${lessonId}::text) end`,
        deletedLessonIds: sql`array_remove(${proverbs.deletedLessonIds}, ${lessonId}::text)`,
        isDeleted: false,
        deletedAt: null,
        updatedAt: new Date()
      })
      .where(arrayContains(proverbs.deletedLessonIds, [lessonId]));
  }

  async publishById(id: string, reviewedByAdmin: boolean): Promise<ProverbEntity | null> {
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(proverbs)
        .where(and(eq(proverbs.id, id), notDeleted()))
        .limit(1);
      const current = rows[0];
      if (!current || current.status !== "finished") return null;

      const aiMeta = {
        generatedByAI: Boolean(current.aiMeta?.generatedByAI),
        model: String(current.aiMeta?.model || ""),
        reviewedByAdmin: current.aiMeta?.generatedByAI
          ? reviewedByAdmin
          : Boolean(current.aiMeta?.reviewedByAdmin)
      };

      const [updated] = await tx
        .update(proverbs)
        .set({ status: "published", aiMeta, updatedAt: new Date() })
        .where(eq(proverbs.id, id))
        .returning();

      return updated ? toEntity(updated) : null;
    });
  }

  async finishById(id: string): Promise<ProverbEntity | null> {
    const rows = await db
      .update(proverbs)
      .set({ status: "finished", updatedAt: new Date() })
      .where(and(eq(proverbs.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
