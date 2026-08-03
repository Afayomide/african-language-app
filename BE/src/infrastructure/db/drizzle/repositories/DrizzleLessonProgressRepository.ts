import { and, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { lessonProgress, type LessonProgressRow, type NewLessonProgressRow } from "../schema.js";
import type {
  LessonProgressEntity,
  LessonProgressStatus,
  LessonStageProgressEntity,
  LessonStepProgressEntity
} from "../../../../domain/entities/LessonProgress.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";
import {
  loadStageProgress,
  loadStepProgress,
  writeStageProgress,
  writeStepProgress
} from "./lessonProgressChildren.js";

function toEntity(
  row: LessonProgressRow,
  stepProgress: LessonStepProgressEntity[],
  stageProgress: LessonStageProgressEntity[]
): LessonProgressEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    lessonId: String(row.lessonId),
    status: row.status,
    progressPercent: row.progressPercent,
    xpEarned: row.xpEarned ?? 0,
    stepProgress,
    stageProgress,
    currentStageIndex: row.currentStageIndex ?? 0,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function hydrate(rows: LessonProgressRow[]): Promise<LessonProgressEntity[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [steps, stages] = await Promise.all([loadStepProgress(ids), loadStageProgress(ids)]);
  return rows.map((row) => toEntity(row, steps.get(row.id) ?? [], stages.get(row.id) ?? []));
}

async function hydrateOne(row: LessonProgressRow | undefined): Promise<LessonProgressEntity | null> {
  if (!row) return null;
  const [entity] = await hydrate([row]);
  return entity ?? null;
}

export class DrizzleLessonProgressRepository implements LessonProgressRepository {
  async findByUserAndLessonId(userId: string, lessonId: string): Promise<LessonProgressEntity | null> {
    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
      .limit(1);
    return hydrateOne(rows[0]);
  }

  async listByUserAndLessonIds(userId: string, lessonIds: string[]): Promise<LessonProgressEntity[]> {
    if (lessonIds.length === 0) return [];
    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds)));
    return hydrate(rows);
  }

  /**
   * Mongo used findOneAndUpdate({$setOnInsert}, {upsert:true}) — i.e. return the
   * existing row untouched if one exists, otherwise create it. Postgres:
   * ON CONFLICT DO NOTHING, then read back the existing row.
   */
  async create(input: {
    userId: string;
    lessonId: string;
    status: LessonProgressStatus;
    progressPercent: number;
    stepProgress: LessonStepProgressEntity[];
    stageProgress: LessonStageProgressEntity[];
    currentStageIndex: number;
  }): Promise<LessonProgressEntity> {
    const row = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(lessonProgress)
        .values({
          userId: input.userId,
          lessonId: input.lessonId,
          status: input.status,
          progressPercent: input.progressPercent,
          currentStageIndex: input.currentStageIndex
        })
        .onConflictDoNothing({ target: [lessonProgress.userId, lessonProgress.lessonId] })
        .returning();

      if (inserted[0]) {
        await writeStepProgress(tx, inserted[0].id, input.stepProgress);
        await writeStageProgress(tx, inserted[0].id, input.stageProgress);
        return inserted[0];
      }

      const existing = await tx
        .select()
        .from(lessonProgress)
        .where(and(eq(lessonProgress.userId, input.userId), eq(lessonProgress.lessonId, input.lessonId)))
        .limit(1);
      return existing[0];
    });

    return (await hydrateOne(row)) as LessonProgressEntity;
  }

  async updateById(
    id: string,
    update: Partial<{
      status: LessonProgressStatus;
      progressPercent: number;
      xpEarned: number;
      stepProgress: LessonStepProgressEntity[];
      stageProgress: LessonStageProgressEntity[];
      currentStageIndex: number;
      startedAt?: Date;
      completedAt?: Date;
    }>
  ): Promise<LessonProgressEntity | null> {
    const values: Partial<NewLessonProgressRow> = { updatedAt: new Date() };
    if (update.status !== undefined) values.status = update.status;
    if (update.progressPercent !== undefined) values.progressPercent = update.progressPercent;
    if (update.xpEarned !== undefined) values.xpEarned = update.xpEarned;
    if (update.currentStageIndex !== undefined) values.currentStageIndex = update.currentStageIndex;
    if (update.startedAt !== undefined) values.startedAt = update.startedAt;
    if (update.completedAt !== undefined) values.completedAt = update.completedAt;

    const row = await db.transaction(async (tx) => {
      const rows = await tx.update(lessonProgress).set(values).where(eq(lessonProgress.id, id)).returning();
      const updated = rows[0];
      if (!updated) return undefined;
      if (update.stepProgress !== undefined) await writeStepProgress(tx, updated.id, update.stepProgress);
      if (update.stageProgress !== undefined) await writeStageProgress(tx, updated.id, update.stageProgress);
      return updated;
    });

    return hydrateOne(row);
  }
}
