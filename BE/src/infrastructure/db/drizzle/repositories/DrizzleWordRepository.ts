import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { words, type NewWordRow, type WordRow } from "../schema.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import type { WordEntity } from "../../../../domain/entities/Word.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  WordCreateInput,
  WordListFilter,
  WordPageFilter,
  WordRepository,
  WordUpdateInput
} from "../../../../domain/repositories/WordRepository.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";
import {
  mapAiMeta,
  mapContentAudio,
  mapContentImage,
  likePattern,
  mapExamples,
  normalizeContentText,
  normalizeTranslations,
  toStoredImage
} from "./contentMappers.js";

function toEntity(row: WordRow): WordEntity {
  return {
    id: row.id,
    _id: row.id,
    kind: "word",
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
    lemma: String(row.lemma || ""),
    partOfSpeech: String(row.partOfSpeech || ""),
    image: mapContentImage(row.image),
    status: row.status,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const notDeleted = () => eq(words.isDeleted, false);

export class DrizzleWordRepository implements WordRepository {
  async create(input: WordCreateInput): Promise<WordEntity> {
    const { text, textNormalized } = normalizeContentText(input.text);
    const languageId = await findLanguageIdByCode(input.language);

    const [row] = await db
      .insert(words)
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
        status: input.status ?? "draft",
        lemma: input.lemma ?? "",
        partOfSpeech: input.partOfSpeech ?? "",
        image: toStoredImage(input.image)
      })
      .returning();

    return toEntity(row);
  }

  async list(filter: WordListFilter): Promise<WordEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];

    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(
          { language: words.language, languageId: words.languageId },
          { language: filter.language, languageId: filter.languageId }
        )
      );
    }
    if (filter.status) conditions.push(eq(words.status, filter.status));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(words.id, filter.ids));

    const rows = await db
      .select()
      .from(words)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(words.language), asc(words.text), asc(words.createdAt));

    return rows.map(toEntity);
  }

  /** Paginated + searched listing for the admin/tutor screens. */
  async listPaged(filter: WordPageFilter): Promise<PagedResult<WordEntity>> {
    const conditions: (SQL | undefined)[] = [notDeleted()];

    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(
          { language: words.language, languageId: words.languageId },
          { language: filter.language, languageId: filter.languageId }
        )
      );
    }
    if (filter.status) conditions.push(eq(words.status, filter.status));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(words.id, filter.ids));
    if (filter.search) {
      const like = likePattern(filter.search);
      conditions.push(
        or(
          ilike(words.text, like),
          sql`array_to_string(${words.translations}, ' ') ilike ${like}`,
          ilike(words.pronunciation, like),
          ilike(words.explanation, like),
          ilike(words.lemma, like),
          ilike(words.partOfSpeech, like)
        )
      );
    }

    const where = and(...conditions.filter(Boolean));
    const [totals] = await db.select({ total: count() }).from(words).where(where);
    const total = Number(totals?.total ?? 0);

    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);

    const rows = await db
      .select()
      .from(words)
      .where(where)
      .orderBy(desc(words.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: rows.map(toEntity), total };
  }

  async listDeleted(filter?: {
    ids?: string[];
    language?: Language;
    languageId?: string | null;
  }): Promise<WordEntity[]> {
    const conditions: (SQL | undefined)[] = [eq(words.isDeleted, true)];

    if (filter?.languageId || filter?.language) {
      conditions.push(
        await buildScopedLanguageCondition(
          { language: words.language, languageId: words.languageId },
          { language: filter.language, languageId: filter.languageId }
        )
      );
    }
    if (Array.isArray(filter?.ids) && filter.ids.length > 0) conditions.push(inArray(words.id, filter.ids));

    const rows = await db
      .select()
      .from(words)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(words.updatedAt), desc(words.createdAt));

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<WordEntity | null> {
    const rows = await db
      .select()
      .from(words)
      .where(and(eq(words.id, id), notDeleted()))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<WordEntity[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(words)
      .where(and(inArray(words.id, ids), notDeleted()));
    return rows.map(toEntity);
  }

  async findByText(language: Language, text: string, languageId?: string | null): Promise<WordEntity | null> {
    const scoped = await buildScopedLanguageCondition(
      { language: words.language, languageId: words.languageId },
      { language, languageId }
    );

    const rows = await db
      .select()
      .from(words)
      .where(and(scoped, eq(words.textNormalized, text.trim().toLowerCase()), notDeleted()))
      .limit(1);

    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(id: string, update: WordUpdateInput): Promise<WordEntity | null> {
    // Postgres does not touch updated_at for us the way Mongoose timestamps did.
    const values: Partial<NewWordRow> = { updatedAt: new Date() };

    if (update.language !== undefined) {
      values.language = update.language;
      values.languageId = (await findLanguageIdByCode(update.language)) ?? null;
    } else if (update.languageId !== undefined) {
      values.languageId = update.languageId;
    }

    if (update.text !== undefined) {
      // Mongoose's normalize hook did NOT run on findOneAndUpdate, so text_normalized
      // could drift. We recompute it here — the partial unique index depends on it.
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
    if (update.status !== undefined) values.status = update.status;
    if (update.lemma !== undefined) values.lemma = update.lemma;
    if (update.partOfSpeech !== undefined) values.partOfSpeech = update.partOfSpeech;
    if (update.image !== undefined) values.image = toStoredImage(update.image);

    const rows = await db
      .update(words)
      .set(values)
      .where(and(eq(words.id, id), notDeleted()))
      .returning();

    return rows[0] ? toEntity(rows[0]) : null;
  }

  async softDeleteById(id: string): Promise<WordEntity | null> {
    const rows = await db
      .update(words)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(words.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async restoreById(id: string): Promise<WordEntity | null> {
    const rows = await db
      .update(words)
      .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
      .where(and(eq(words.id, id), eq(words.isDeleted, true)))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
