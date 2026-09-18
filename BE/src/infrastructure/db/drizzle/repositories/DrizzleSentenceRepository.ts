import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { sentences, type NewSentenceRow, type SentenceRow } from "../schema.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import type { SentenceEntity, SentenceMeaningSegment } from "../../../../domain/entities/Sentence.js";
import type { ContentComponentRef } from "../../../../domain/entities/Content.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  SentenceCreateInput,
  SentenceListFilter,
  SentencePageFilter,
  SentenceRepository,
  SentenceUpdateInput
} from "../../../../domain/repositories/SentenceRepository.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";
import { loadSentenceComponents, writeSentenceComponents } from "./contentComponents.js";
import {
  likePattern,
  mapAiMeta,
  mapContentAudio,
  mapExamples,
  normalizeContentText,
  normalizeTranslations
} from "./contentMappers.js";

const notDeleted = () => eq(sentences.isDeleted, false);
const scopeCols = { language: sentences.language, languageId: sentences.languageId };

/** Mirrors the Mongo mapper: drops segments with no text or no source word indexes. */
function mapMeaningSegments(value: unknown): SentenceMeaningSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      text: String(row?.text || "").trim(),
      sourceWordIndexes: Array.isArray(row?.sourceWordIndexes)
        ? row.sourceWordIndexes.map(Number).filter((item: number) => Number.isInteger(item) && item >= 0)
        : [],
      sourceComponentIndexes: Array.isArray(row?.sourceComponentIndexes)
        ? row.sourceComponentIndexes.map(Number).filter((item: number) => Number.isInteger(item) && item >= 0)
        : []
    }))
    .filter((row) => row.text && row.sourceWordIndexes.length > 0);
}

function toEntity(row: SentenceRow, components: ContentComponentRef[]): SentenceEntity {
  return {
    id: row.id,
    _id: row.id,
    kind: "sentence",
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
    literalTranslation: String(row.literalTranslation || ""),
    usageNotes: String(row.usageNotes || ""),
    components,
    meaningSegments: mapMeaningSegments(row.meaningSegments),
    status: row.status,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function hydrate(rows: SentenceRow[]): Promise<SentenceEntity[]> {
  if (rows.length === 0) return [];
  const componentsByParent = await loadSentenceComponents(rows.map((row) => row.id));
  return rows.map((row) => toEntity(row, componentsByParent.get(row.id) ?? []));
}

async function hydrateOne(row: SentenceRow | undefined): Promise<SentenceEntity | null> {
  if (!row) return null;
  const [entity] = await hydrate([row]);
  return entity ?? null;
}

export class DrizzleSentenceRepository implements SentenceRepository {
  async create(input: SentenceCreateInput): Promise<SentenceEntity> {
    const { text, textNormalized } = normalizeContentText(input.text);
    const languageId = await findLanguageIdByCode(input.language);

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(sentences)
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
          literalTranslation: input.literalTranslation ?? "",
          usageNotes: input.usageNotes ?? "",
          meaningSegments: input.meaningSegments ?? [],
          status: input.status ?? "draft"
        })
        .returning();

      await writeSentenceComponents(tx, created.id, input.components);
      return created;
    });

    return (await hydrateOne(row)) as SentenceEntity;
  }

  async list(filter: SentenceListFilter): Promise<SentenceEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (filter.status) conditions.push(eq(sentences.status, filter.status));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(sentences.id, filter.ids));

    const rows = await db
      .select()
      .from(sentences)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(sentences.language), asc(sentences.text), asc(sentences.createdAt));

    return hydrate(rows);
  }

  /** Paginated + searched listing for the admin/tutor screens. */
  async listPaged(filter: SentencePageFilter): Promise<PagedResult<SentenceEntity>> {
    const conditions: (SQL | undefined)[] = [notDeleted()];

    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (filter.status) conditions.push(eq(sentences.status, filter.status));
    if (Array.isArray(filter.ids) && filter.ids.length > 0) conditions.push(inArray(sentences.id, filter.ids));
    if (filter.search) {
      const like = likePattern(filter.search);
      conditions.push(
        or(
          ilike(sentences.text, like),
          sql`array_to_string(${sentences.translations}, ' ') ilike ${like}`,
          ilike(sentences.pronunciation, like),
          ilike(sentences.explanation, like),
          ilike(sentences.literalTranslation, like),
          ilike(sentences.usageNotes, like)
        )
      );
    }

    const where = and(...conditions.filter(Boolean));
    const [totals] = await db.select({ total: count() }).from(sentences).where(where);
    const total = Number(totals?.total ?? 0);

    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);

    const rows = await db
      .select()
      .from(sentences)
      .where(where)
      .orderBy(desc(sentences.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: await hydrate(rows), total };
  }

  async listDeleted(filter?: {
    ids?: string[];
    language?: Language;
    languageId?: string | null;
  }): Promise<SentenceEntity[]> {
    const conditions: (SQL | undefined)[] = [eq(sentences.isDeleted, true)];
    if (filter?.languageId || filter?.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (Array.isArray(filter?.ids) && filter.ids.length > 0) conditions.push(inArray(sentences.id, filter.ids));

    const rows = await db
      .select()
      .from(sentences)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(sentences.updatedAt), desc(sentences.createdAt));

    return hydrate(rows);
  }

  async findById(id: string): Promise<SentenceEntity | null> {
    const rows = await db.select().from(sentences).where(and(eq(sentences.id, id), notDeleted())).limit(1);
    return hydrateOne(rows[0]);
  }

  async findByIds(ids: string[]): Promise<SentenceEntity[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(sentences).where(and(inArray(sentences.id, ids), notDeleted()));
    return hydrate(rows);
  }

  async findByText(language: Language, text: string, languageId?: string | null): Promise<SentenceEntity | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(sentences)
      .where(and(scoped, eq(sentences.textNormalized, normalizeContentText(text).textNormalized), notDeleted()))
      .limit(1);
    return hydrateOne(rows[0]);
  }

  async updateById(id: string, update: SentenceUpdateInput): Promise<SentenceEntity | null> {
    const values: Partial<NewSentenceRow> = { updatedAt: new Date() };

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
    if (update.literalTranslation !== undefined) values.literalTranslation = update.literalTranslation;
    if (update.usageNotes !== undefined) values.usageNotes = update.usageNotes;
    if (update.meaningSegments !== undefined) values.meaningSegments = update.meaningSegments;
    if (update.status !== undefined) values.status = update.status;

    const row = await db.transaction(async (tx) => {
      const rows = await tx.update(sentences).set(values).where(and(eq(sentences.id, id), notDeleted())).returning();
      const updated = rows[0];
      if (!updated) return undefined;
      if (update.components !== undefined) await writeSentenceComponents(tx, updated.id, update.components);
      return updated;
    });

    return hydrateOne(row);
  }

  async softDeleteById(id: string): Promise<SentenceEntity | null> {
    const rows = await db
      .update(sentences)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sentences.id, id), notDeleted()))
      .returning();
    return hydrateOne(rows[0]);
  }

  async restoreById(id: string): Promise<SentenceEntity | null> {
    const rows = await db
      .update(sentences)
      .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
      .where(and(eq(sentences.id, id), eq(sentences.isDeleted, true)))
      .returning();
    return hydrateOne(rows[0]);
  }
}
