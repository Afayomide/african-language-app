import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import {
  lessonBlocks,
  lessonStages,
  lessons,
  type LessonRow,
  type NewLessonBlockRow,
  type NewLessonRow
} from "../schema.js";
import { genObjectId, isValidId } from "../ids.js";
import type { Language, LessonBlock, LessonEntity, LessonStage } from "../../../../domain/entities/Lesson.js";
import type {
  LessonCreateInput,
  LessonListFilter,
  LessonPageFilter,
  LessonRepository,
  LessonSummaryEntity,
  LessonUpdateInput
} from "../../../../domain/repositories/LessonRepository.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import { likePattern } from "./contentMappers.js";
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";

type LessonTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BlockRow = typeof lessonBlocks.$inferSelect;

const notDeleted = () => eq(lessons.isDeleted, false);

const scopeCols = { language: lessons.language, languageId: lessons.languageId };

/* ------------------------------------------------------------------ */
/* Block <-> row mapping (LessonBlock is a discriminated union)         */
/* ------------------------------------------------------------------ */

function toBlockEntity(row: BlockRow): LessonBlock {
  if (row.type === "content") {
    const rawIndex = Number(row.translationIndex ?? 0);
    return {
      type: "content",
      contentType: row.contentType === "sentence" || row.contentType === "word" ? row.contentType : "expression",
      refId: row.refId ? String(row.refId) : "",
      translationIndex: Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0
    };
  }
  if (row.type === "text") {
    return { type: "text", content: String(row.content || "") };
  }
  return { type: row.type as "proverb" | "question", refId: row.refId ? String(row.refId) : "" };
}

function toBlockRow(stageId: string, orderIndex: number, block: LessonBlock): NewLessonBlockRow {
  if (block.type === "content") {
    return {
      stageId,
      orderIndex,
      type: "content",
      content: null,
      contentType: block.contentType,
      refId: block.refId,
      translationIndex: Number.isInteger(block.translationIndex) && (block.translationIndex ?? 0) >= 0
        ? Number(block.translationIndex)
        : 0
    };
  }
  if (block.type === "text") {
    return {
      stageId,
      orderIndex,
      type: "text",
      content: String(block.content || ""),
      contentType: null,
      refId: null,
      translationIndex: 0
    };
  }
  return {
    stageId,
    orderIndex,
    type: block.type,
    content: null,
    contentType: null,
    refId: block.refId,
    translationIndex: 0
  };
}

/* ------------------------------------------------------------------ */
/* Stage loading / writing                                             */
/* ------------------------------------------------------------------ */

/** Batched load: one query for stages, one for blocks — never N+1 per lesson. */
async function loadStagesByLesson(lessonIds: string[]): Promise<Map<string, LessonStage[]>> {
  const byLesson = new Map<string, LessonStage[]>();
  if (lessonIds.length === 0) return byLesson;

  const stageRows = await db
    .select()
    .from(lessonStages)
    .where(inArray(lessonStages.lessonId, lessonIds))
    .orderBy(asc(lessonStages.lessonId), asc(lessonStages.orderIndex));

  if (stageRows.length === 0) return byLesson;

  const blockRows = await db
    .select()
    .from(lessonBlocks)
    .where(inArray(lessonBlocks.stageId, stageRows.map((row) => row.id)))
    .orderBy(asc(lessonBlocks.stageId), asc(lessonBlocks.orderIndex));

  const blocksByStage = new Map<string, LessonBlock[]>();
  for (const row of blockRows) {
    const list = blocksByStage.get(row.stageId) ?? [];
    list.push(toBlockEntity(row));
    blocksByStage.set(row.stageId, list);
  }

  for (const row of stageRows) {
    const list = byLesson.get(row.lessonId) ?? [];
    list.push({
      id: row.id,
      title: String(row.title || ""),
      description: String(row.description || ""),
      orderIndex: Number(row.orderIndex ?? list.length),
      blocks: blocksByStage.get(row.id) ?? []
    });
    byLesson.set(row.lessonId, list);
  }

  return byLesson;
}

/**
 * Replace a lesson's stages wholesale (delete + re-insert), mirroring how the
 * Mongo `stages` array was overwritten by findOneAndUpdate. Existing stage ids
 * are PRESERVED when the caller round-trips them, because learner progress
 * (lesson_stage_progress.stage_id) references them. Blocks cascade on delete.
 */
async function writeStages(tx: LessonTx, lessonId: string, stages: LessonStage[] | undefined): Promise<void> {
  await tx.delete(lessonStages).where(eq(lessonStages.lessonId, lessonId));
  if (!Array.isArray(stages) || stages.length === 0) return;

  const stageRows = stages.map((stage, index) => ({
    id: isValidId(stage.id) ? stage.id : genObjectId(),
    lessonId,
    orderIndex: Number.isFinite(stage.orderIndex) ? Number(stage.orderIndex) : index,
    title: String(stage.title || ""),
    description: String(stage.description || "")
  }));

  await tx.insert(lessonStages).values(stageRows);

  const blockRows: NewLessonBlockRow[] = [];
  stages.forEach((stage, index) => {
    const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
    blocks.forEach((block, blockIndex) => {
      blockRows.push(toBlockRow(stageRows[index].id, blockIndex, block));
    });
  });

  if (blockRows.length > 0) await tx.insert(lessonBlocks).values(blockRows);
}

/* ------------------------------------------------------------------ */
/* Row -> entity                                                       */
/* ------------------------------------------------------------------ */

function toEntity(row: LessonRow, stages: LessonStage[]): LessonEntity {
  return {
    id: row.id,
    _id: row.id,
    languageId: row.languageId ?? null,
    title: row.title,
    unitId: row.unitId ? String(row.unitId) : "",
    language: row.language,
    level: row.level,
    orderIndex: row.orderIndex,
    description: String(row.description || ""),
    topics: Array.isArray(row.topics) ? row.topics.map(String) : [],
    kind: row.kind === "review" ? "review" : "core",
    proverbs: Array.isArray(row.proverbs)
      ? row.proverbs.map((item) => ({
          text: String(item?.text || ""),
          translation: String(item?.translation || ""),
          contextNote: String(item?.contextNote || "")
        }))
      : [],
    stages,
    status: row.status,
    createdBy: String(row.createdBy),
    publishedAt: row.publishedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function hydrate(rows: LessonRow[]): Promise<LessonEntity[]> {
  if (rows.length === 0) return [];
  const stagesByLesson = await loadStagesByLesson(rows.map((row) => row.id));
  return rows.map((row) => toEntity(row, stagesByLesson.get(row.id) ?? []));
}

async function hydrateOne(row: LessonRow | undefined): Promise<LessonEntity | null> {
  if (!row) return null;
  const [entity] = await hydrate([row]);
  return entity ?? null;
}

function statusCondition(status: LessonListFilter["status"]): SQL | undefined {
  if (!status) return undefined;
  return Array.isArray(status) ? inArray(lessons.status, status) : eq(lessons.status, status);
}

/* ------------------------------------------------------------------ */

export class DrizzleLessonRepository implements LessonRepository {
  private async buildListConditions(filter: LessonListFilter): Promise<(SQL | undefined)[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.languageId || filter.language) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }
    if (filter.unitId) conditions.push(eq(lessons.unitId, filter.unitId));
    conditions.push(statusCondition(filter.status));
    return conditions;
  }

  private async updateWhere(where: SQL, update: LessonUpdateInput): Promise<LessonEntity | null> {
    const values: Partial<NewLessonRow> = { updatedAt: new Date() };

    if (update.language !== undefined) {
      values.language = update.language;
      values.languageId = (await findLanguageIdByCode(update.language)) ?? null;
    }
    if (update.title !== undefined) values.title = update.title;
    if (update.unitId !== undefined) values.unitId = update.unitId;
    if (update.level !== undefined) values.level = update.level;
    if (update.kind !== undefined) values.kind = update.kind;
    if (update.orderIndex !== undefined) values.orderIndex = update.orderIndex;
    if (update.description !== undefined) values.description = update.description;
    if (update.topics !== undefined) values.topics = update.topics;
    if (update.proverbs !== undefined) values.proverbs = update.proverbs;
    if (update.status !== undefined) values.status = update.status;

    const row = await db.transaction(async (tx) => {
      const rows = await tx.update(lessons).set(values).where(where).returning();
      const updated = rows[0];
      if (!updated) return undefined;
      if (update.stages !== undefined) await writeStages(tx, updated.id, update.stages);
      return updated;
    });

    return hydrateOne(row);
  }

  private async simpleUpdate(where: SQL, values: Partial<NewLessonRow>): Promise<LessonEntity | null> {
    const rows = await db
      .update(lessons)
      .set({ ...values, updatedAt: new Date() })
      .where(where)
      .returning();
    return hydrateOne(rows[0]);
  }

  async findLastOrderIndex(unitId: string): Promise<number | null> {
    const rows = await db
      .select({ orderIndex: lessons.orderIndex })
      .from(lessons)
      .where(and(eq(lessons.unitId, unitId), notDeleted()))
      .orderBy(desc(lessons.orderIndex), desc(lessons.createdAt))
      .limit(1);
    return rows[0]?.orderIndex ?? null;
  }

  async create(input: LessonCreateInput): Promise<LessonEntity> {
    const languageId = await findLanguageIdByCode(input.language);

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(lessons)
        .values({
          title: input.title,
          unitId: input.unitId,
          language: input.language,
          languageId: languageId ?? null,
          level: input.level,
          kind: input.kind ?? "core",
          orderIndex: input.orderIndex,
          description: input.description ?? "",
          topics: input.topics ?? [],
          proverbs: input.proverbs ?? [],
          status: input.status,
          createdBy: input.createdBy
        })
        .returning();

      await writeStages(tx, created.id, input.stages);
      return created;
    });

    return (await hydrateOne(row)) as LessonEntity;
  }

  async list(filter: LessonListFilter): Promise<LessonEntity[]> {
    const conditions = await this.buildListConditions(filter);
    const rows = await db
      .select()
      .from(lessons)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(lessons.language), asc(lessons.orderIndex), asc(lessons.createdAt));
    return hydrate(rows);
  }

  async listPaged(filter: LessonPageFilter): Promise<PagedResult<LessonEntity>> {
    const conditions = await this.buildListConditions(filter);
    if (filter.search) {
      const like = likePattern(filter.search);
      conditions.push(
        or(
          ilike(lessons.title, like),
          ilike(lessons.description, like),
          sql`${lessons.status}::text ilike ${like}`,
          sql`array_to_string(${lessons.topics}, ' ') ilike ${like}`,
          // Mongo matched `{ proverbs: regex }` against objects, which never hit;
          // searching the serialized jsonb makes proverb text actually findable.
          sql`${lessons.proverbs}::text ilike ${like}`
        )
      );
    }

    const where = and(...conditions.filter(Boolean));
    const [totals] = await db.select({ total: count() }).from(lessons).where(where);
    const total = Number(totals?.total ?? 0);

    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);

    const rows = await db
      .select()
      .from(lessons)
      .where(where)
      .orderBy(desc(lessons.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: await hydrate(rows), total };
  }

  async listSummaries(filter: LessonListFilter): Promise<LessonSummaryEntity[]> {
    const conditions = await this.buildListConditions(filter);
    const rows = await db
      .select()
      .from(lessons)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(asc(lessons.language), asc(lessons.orderIndex), asc(lessons.createdAt));

    if (rows.length === 0) return [];

    // stageCount only — avoid loading every block just to count stages
    const counts = await db
      .select({ lessonId: lessonStages.lessonId, total: count() })
      .from(lessonStages)
      .where(inArray(lessonStages.lessonId, rows.map((row) => row.id)))
      .groupBy(lessonStages.lessonId);

    const countByLesson = new Map(counts.map((row) => [row.lessonId, Number(row.total)]));

    return rows.map((row) => ({
      id: row.id,
      _id: row.id,
      languageId: row.languageId ?? null,
      title: row.title,
      unitId: row.unitId ? String(row.unitId) : "",
      language: row.language,
      level: row.level,
      kind: row.kind === "review" ? "review" : "core",
      orderIndex: row.orderIndex,
      description: String(row.description || ""),
      status: row.status,
      createdBy: String(row.createdBy),
      publishedAt: row.publishedAt ?? null,
      deletedAt: row.deletedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      stageCount: countByLesson.get(row.id) ?? 0
    }));
  }

  async findById(id: string): Promise<LessonEntity | null> {
    const rows = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, id), notDeleted()))
      .limit(1);
    return hydrateOne(rows[0]);
  }

  async findByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, id), scoped, notDeleted()))
      .limit(1);
    return hydrateOne(rows[0]);
  }

  async updateById(id: string, update: LessonUpdateInput): Promise<LessonEntity | null> {
    return this.updateWhere(and(eq(lessons.id, id), notDeleted()) as SQL, update);
  }

  async updateByIdAndLanguage(
    id: string,
    language: Language,
    update: LessonUpdateInput,
    scopedLanguageId?: string | null
  ): Promise<LessonEntity | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId: scopedLanguageId });
    return this.updateWhere(and(eq(lessons.id, id), scoped, notDeleted()) as SQL, update);
  }

  async softDeleteById(id: string): Promise<LessonEntity | null> {
    return this.simpleUpdate(and(eq(lessons.id, id), notDeleted()) as SQL, {
      isDeleted: true,
      deletedAt: new Date()
    });
  }

  async softDeleteByIdAndLanguage(
    id: string,
    language: Language,
    languageId?: string | null
  ): Promise<LessonEntity | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    return this.simpleUpdate(and(eq(lessons.id, id), scoped, notDeleted()) as SQL, {
      isDeleted: true,
      deletedAt: new Date()
    });
  }

  async restoreById(id: string, orderIndex: number): Promise<LessonEntity | null> {
    return this.simpleUpdate(and(eq(lessons.id, id), eq(lessons.isDeleted, true)) as SQL, {
      isDeleted: false,
      deletedAt: null,
      orderIndex
    });
  }

  async publishById(id: string, now: Date): Promise<LessonEntity | null> {
    return this.simpleUpdate(and(eq(lessons.id, id), eq(lessons.status, "finished"), notDeleted()) as SQL, {
      status: "published",
      publishedAt: now
    });
  }

  async finishByIdAndLanguage(
    id: string,
    language: Language,
    languageId?: string | null
  ): Promise<LessonEntity | null> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    return this.simpleUpdate(and(eq(lessons.id, id), scoped, notDeleted()) as SQL, { status: "finished" });
  }

  async findByIdsAndLanguage(
    ids: string[],
    language: Language,
    languageId?: string | null
  ): Promise<Array<{ id: string }>> {
    if (ids.length === 0) return [];
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(inArray(lessons.id, ids), scoped, notDeleted()));
    return rows.map((row) => ({ id: row.id }));
  }

  async findByIdsAndUnit(ids: string[], unitId: string): Promise<Array<{ id: string }>> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(inArray(lessons.id, ids), eq(lessons.unitId, unitId), notDeleted()));
    return rows.map((row) => ({ id: row.id }));
  }

  async reorderByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(lessons)
          .set({ orderIndex: index, updatedAt: new Date() })
          .where(and(eq(lessons.id, id), notDeleted()));
      }
    });
  }

  async listByLanguage(language: Language, languageId?: string | null): Promise<LessonEntity[]> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select()
      .from(lessons)
      .where(and(scoped, notDeleted()))
      .orderBy(asc(lessons.orderIndex), asc(lessons.createdAt));
    return hydrate(rows);
  }

  async listByUnitId(unitId: string): Promise<LessonEntity[]> {
    const rows = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.unitId, unitId), notDeleted()))
      .orderBy(asc(lessons.orderIndex), asc(lessons.createdAt));
    return hydrate(rows);
  }

  async listDeletedByUnitId(unitId: string): Promise<LessonEntity[]> {
    const rows = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.unitId, unitId), eq(lessons.isDeleted, true)))
      .orderBy(desc(lessons.deletedAt), desc(lessons.updatedAt));
    return hydrate(rows);
  }

  async compactOrderIndexes(language: Language, languageId?: string | null): Promise<void> {
    const scoped = await buildScopedLanguageCondition(scopeCols, { language, languageId });
    const rows = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(scoped, notDeleted()))
      .orderBy(asc(lessons.orderIndex), asc(lessons.createdAt));
    await this.applyCompactedOrder(rows.map((row) => row.id));
  }

  async compactOrderIndexesByUnit(unitId: string): Promise<void> {
    const rows = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.unitId, unitId), notDeleted()))
      .orderBy(asc(lessons.orderIndex), asc(lessons.createdAt));
    await this.applyCompactedOrder(rows.map((row) => row.id));
  }

  private async applyCompactedOrder(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(lessons)
          .set({ orderIndex: index, updatedAt: new Date() })
          .where(and(eq(lessons.id, id), notDeleted()));
      }
    });
  }
}
