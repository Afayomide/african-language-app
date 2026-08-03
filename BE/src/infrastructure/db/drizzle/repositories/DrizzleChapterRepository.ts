import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { chapters, type ChapterRow, type NewChapterRow } from "../schema.js";
import type { ChapterEntity } from "../../../../domain/entities/Chapter.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  ChapterCreateInput,
  ChapterListFilter,
  ChapterRepository,
  ChapterUpdateInput
} from "../../../../domain/repositories/ChapterRepository.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";

const notDeleted = () => eq(chapters.isDeleted, false);
const scopeCols = { language: chapters.language, languageId: chapters.languageId };

function toEntity(row: ChapterRow): ChapterEntity {
  return {
    id: row.id,
    _id: row.id,
    languageId: row.languageId ?? null,
    title: row.title,
    description: String(row.description || ""),
    language: row.language,
    level: row.level,
    orderIndex: row.orderIndex,
    status: row.status,
    createdBy: String(row.createdBy),
    publishedAt: row.publishedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleChapterRepository implements ChapterRepository {
  private async simpleUpdate(where: SQL, values: Partial<NewChapterRow>): Promise<ChapterEntity | null> {
    const rows = await db
      .update(chapters)
      .set({ ...values, updatedAt: new Date() })
      .where(where)
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findLastOrderIndex(language: Language, languageId?: string | null): Promise<number | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select({ orderIndex: chapters.orderIndex })
      .from(chapters)
      .where(and(scoped, notDeleted()))
      .orderBy(desc(chapters.orderIndex), desc(chapters.createdAt))
      .limit(1);
    return rows[0]?.orderIndex ?? null;
  }

  async create(input: ChapterCreateInput): Promise<ChapterEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const [row] = await db
      .insert(chapters)
      .values({
        title: input.title,
        description: input.description ?? "",
        language: input.language,
        languageId: languageId ?? null,
        level: input.level,
        orderIndex: input.orderIndex,
        status: input.status,
        createdBy: input.createdBy
      })
      .returning();
    return toEntity(row);
  }

  async list(filter: ChapterListFilter): Promise<ChapterEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
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
        Array.isArray(filter.status) ? inArray(chapters.status, filter.status) : eq(chapters.status, filter.status)
      );
    }

    const rows = await db
      .select()
      .from(chapters)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(chapters.language), asc(chapters.orderIndex), asc(chapters.createdAt));

    return rows.map(toEntity);
  }

  async listByLanguage(language: Language, languageId?: string | null): Promise<ChapterEntity[]> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(chapters)
      .where(and(scoped, notDeleted()))
      .orderBy(asc(chapters.orderIndex), asc(chapters.createdAt));
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<ChapterEntity | null> {
    const rows = await db.select().from(chapters).where(and(eq(chapters.id, id), notDeleted())).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(id: string, update: ChapterUpdateInput): Promise<ChapterEntity | null> {
    const values: Partial<NewChapterRow> = {};

    if (update.language !== undefined) {
      values.language = update.language;
      values.languageId = (await findLanguageIdByCode(update.language)) ?? null;
    }
    if (update.title !== undefined) values.title = update.title;
    if (update.description !== undefined) values.description = update.description;
    if (update.level !== undefined) values.level = update.level;
    if (update.orderIndex !== undefined) values.orderIndex = update.orderIndex;
    if (update.status !== undefined) values.status = update.status;

    return this.simpleUpdate(and(eq(chapters.id, id), notDeleted()) as SQL, values);
  }

  async softDeleteById(id: string): Promise<ChapterEntity | null> {
    return this.simpleUpdate(and(eq(chapters.id, id), notDeleted()) as SQL, {
      isDeleted: true,
      deletedAt: new Date()
    });
  }

  async publishById(id: string, now: Date): Promise<ChapterEntity | null> {
    return this.simpleUpdate(and(eq(chapters.id, id), eq(chapters.status, "finished"), notDeleted()) as SQL, {
      status: "published",
      publishedAt: now
    });
  }

  async reorderByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(chapters)
          .set({ orderIndex: index, updatedAt: new Date() })
          .where(and(eq(chapters.id, id), notDeleted()));
      }
    });
  }
}
