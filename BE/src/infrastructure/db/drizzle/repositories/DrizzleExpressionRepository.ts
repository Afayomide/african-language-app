import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { expressions, type ExpressionRow, type NewExpressionRow } from "../schema.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import type { ExpressionEntity } from "../../../../domain/entities/Expression.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  ExpressionCreateInput,
  ExpressionListFilter,
  ExpressionPageFilter,
  ExpressionRepository,
  ExpressionUpdateInput
} from "../../../../domain/repositories/ExpressionRepository.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";
import { loadExpressionComponents, writeExpressionComponents } from "./contentComponents.js";
import {
  likePattern,
  mapAiMeta,
  mapContentAudio,
  mapExamples,
  normalizeContentText,
  normalizeTranslations
} from "./contentMappers.js";
import type { ContentComponentRef } from "../../../../domain/entities/Content.js";

const notDeleted = () => eq(expressions.isDeleted, false);
const scopeCols = { language: expressions.language, languageId: expressions.languageId };

function toEntity(row: ExpressionRow, components: ContentComponentRef[]): ExpressionEntity {
  return {
    id: row.id,
    _id: row.id,
    kind: "expression",
    languageId: row.languageId ?? null,
    language: row.language,
    text: String(row.text || ""),
    textNormalized: String(row.textNormalized || ""),
    translations: Array.isArray(row.translations) ? row.translations.map(String) : [],
    pronunciation: String(row.pronunciation || ""),
    explanation: String(row.explanation || ""),
    examples: mapExamples(row.examples),
    difficulty: Number(row.difficulty || 1),
    aiMeta: mapAiMeta(row.aiMeta),
    audio: mapContentAudio(row.audio),
    register: row.register === "formal" || row.register === "casual" ? row.register : "neutral",
    components,
    status: row.status,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function hydrate(rows: ExpressionRow[]): Promise<ExpressionEntity[]> {
  if (rows.length === 0) return [];
  const componentsByParent = await loadExpressionComponents(rows.map((row) => row.id));
  return rows.map((row) => toEntity(row, componentsByParent.get(row.id) ?? []));
}

async function hydrateOne(row: ExpressionRow | undefined): Promise<ExpressionEntity | null> {
  if (!row) return null;
  const [entity] = await hydrate([row]);
  return entity ?? null;
}

export class DrizzleExpressionRepository implements ExpressionRepository {
  async create(input: ExpressionCreateInput): Promise<ExpressionEntity> {
    const { text, textNormalized } = normalizeContentText(input.text);
    const languageId = await findLanguageIdByCode(input.language);

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(expressions)
        .values({
          language: input.language,
          languageId: languageId ?? null,
          text,
          textNormalized,
          translations: normalizeTranslations(input.translations),
          pronunciation: input.pronunciation ?? "",
          explanation: input.explanation ?? "",
          examples: input.examples ?? [],
          difficulty: input.difficulty ?? 1,
          aiMeta: mapAiMeta(input.aiMeta),
          audio: mapContentAudio(input.audio),
          register: input.register ?? "neutral",
          status: input.status ?? "draft"
        })
        .returning();

      await writeExpressionComponents(tx, created.id, input.components);
      return created;
    });

    return (await hydrateOne(row)) as ExpressionEntity;
  }

  async list(filter: ExpressionListFilter): Promise<ExpressionEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (filter.status) conditions.push(eq(expressions.status, filter.status));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(expressions.id, filter.ids));

    const rows = await db
      .select()
      .from(expressions)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(expressions.language), asc(expressions.text), asc(expressions.createdAt));

    return hydrate(rows);
  }

  /** Paginated + searched listing for the admin/tutor screens. */
  async listPaged(filter: ExpressionPageFilter): Promise<PagedResult<ExpressionEntity>> {
    const conditions: (SQL | undefined)[] = [notDeleted()];

    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (filter.status) conditions.push(eq(expressions.status, filter.status));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(expressions.id, filter.ids));
    if (filter.search) {
      const like = likePattern(filter.search);
      conditions.push(
        or(
          ilike(expressions.text, like),
          sql`array_to_string(${expressions.translations}, ' ') ilike ${like}`,
          ilike(expressions.pronunciation, like),
          ilike(expressions.explanation, like),
          // status/language are enums — cast so ILIKE applies (matches the Mongo regex)
          sql`${expressions.status}::text ilike ${like}`,
          sql`${expressions.language}::text ilike ${like}`
        )
      );
    }

    const where = and(...conditions.filter(Boolean));
    const [totals] = await db.select({ total: count() }).from(expressions).where(where);
    const total = Number(totals?.total ?? 0);

    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);

    const rows = await db
      .select()
      .from(expressions)
      .where(where)
      .orderBy(desc(expressions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: await hydrate(rows), total };
  }

  async listDeleted(filter?: {
    ids?: string[];
    language?: Language;
    languageId?: string | null;
  }): Promise<ExpressionEntity[]> {
    const conditions: (SQL | undefined)[] = [eq(expressions.isDeleted, true)];
    if (filter?.languageId || filter?.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (Array.isArray(filter?.ids) && filter.ids.length > 0) conditions.push(inArray(expressions.id, filter.ids));

    const rows = await db
      .select()
      .from(expressions)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(expressions.updatedAt), desc(expressions.createdAt));

    return hydrate(rows);
  }

  async findById(id: string): Promise<ExpressionEntity | null> {
    const rows = await db.select().from(expressions).where(and(eq(expressions.id, id), notDeleted())).limit(1);
    return hydrateOne(rows[0]);
  }

  async findByIds(ids: string[]): Promise<ExpressionEntity[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(expressions).where(and(inArray(expressions.id, ids), notDeleted()));
    return hydrate(rows);
  }

  async findByText(
    language: Language,
    text: string,
    languageId?: string | null
  ): Promise<ExpressionEntity | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(expressions)
      .where(and(scoped, eq(expressions.textNormalized, normalizeContentText(text).textNormalized), notDeleted()))
      .limit(1);
    return hydrateOne(rows[0]);
  }

  async updateById(id: string, update: ExpressionUpdateInput): Promise<ExpressionEntity | null> {
    const values: Partial<NewExpressionRow> = { updatedAt: new Date() };

    if (update.language !== undefined) {
      values.language = update.language;
      values.languageId = (await findLanguageIdByCode(update.language)) ?? null;
    } else if (update.languageId !== undefined) {
      values.languageId = update.languageId;
    }

    if (update.text !== undefined) {
      const normalized = normalizeContentText(update.text);
      values.text = normalized.text;
      values.textNormalized = normalized.textNormalized;
    }
    if (update.translations !== undefined) values.translations = normalizeTranslations(update.translations);
    if (update.pronunciation !== undefined) values.pronunciation = update.pronunciation;
    if (update.explanation !== undefined) values.explanation = update.explanation;
    if (update.examples !== undefined) values.examples = update.examples;
    if (update.difficulty !== undefined) values.difficulty = update.difficulty;
    if (update.aiMeta !== undefined) values.aiMeta = mapAiMeta(update.aiMeta);
    if (update.audio !== undefined) values.audio = mapContentAudio(update.audio);
    if (update.register !== undefined) values.register = update.register;
    if (update.status !== undefined) values.status = update.status;

    const row = await db.transaction(async (tx) => {
      const rows = await tx.update(expressions).set(values).where(and(eq(expressions.id, id), notDeleted())).returning();
      const updated = rows[0];
      if (!updated) return undefined;
      if (update.components !== undefined) await writeExpressionComponents(tx, updated.id, update.components);
      return updated;
    });

    return hydrateOne(row);
  }

  async softDeleteById(id: string): Promise<ExpressionEntity | null> {
    const rows = await db
      .update(expressions)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(expressions.id, id), notDeleted()))
      .returning();
    return hydrateOne(rows[0]);
  }

  async restoreById(id: string): Promise<ExpressionEntity | null> {
    const rows = await db
      .update(expressions)
      .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
      .where(and(eq(expressions.id, id), eq(expressions.isDeleted, true)))
      .returning();
    return hydrateOne(rows[0]);
  }
}
