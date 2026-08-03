import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { lessonStageProgress, lessonStepProgress } from "../schema.js";
import type {
  LessonStageProgressEntity,
  LessonStepProgressEntity
} from "../../../../domain/entities/LessonProgress.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * stepProgress[] / stageProgress[] normalized into child tables with a cascading
 * FK to lesson_progress, so each step can be updated atomically instead of
 * rewriting a whole jsonb array (which races under concurrent lesson play).
 *
 * Steps are returned ordered by stepKey (the Mongo array had only insertion
 * order and callers look steps up by key); stages keep their meaningful
 * stageIndex order.
 */

export async function loadStepProgress(
  progressIds: string[]
): Promise<Map<string, LessonStepProgressEntity[]>> {
  const byProgress = new Map<string, LessonStepProgressEntity[]>();
  if (progressIds.length === 0) return byProgress;

  const rows = await db
    .select()
    .from(lessonStepProgress)
    .where(inArray(lessonStepProgress.lessonProgressId, progressIds))
    .orderBy(asc(lessonStepProgress.lessonProgressId), asc(lessonStepProgress.stepKey));

  for (const row of rows) {
    const list = byProgress.get(row.lessonProgressId) ?? [];
    list.push({
      stepKey: String(row.stepKey),
      status: row.status,
      score: Number(row.score) || 0,
      completedAt: row.completedAt ?? undefined
    });
    byProgress.set(row.lessonProgressId, list);
  }
  return byProgress;
}

export async function loadStageProgress(
  progressIds: string[]
): Promise<Map<string, LessonStageProgressEntity[]>> {
  const byProgress = new Map<string, LessonStageProgressEntity[]>();
  if (progressIds.length === 0) return byProgress;

  const rows = await db
    .select()
    .from(lessonStageProgress)
    .where(inArray(lessonStageProgress.lessonProgressId, progressIds))
    .orderBy(asc(lessonStageProgress.lessonProgressId), asc(lessonStageProgress.stageIndex));

  for (const row of rows) {
    const list = byProgress.get(row.lessonProgressId) ?? [];
    list.push({
      stageId: String(row.stageId),
      stageIndex: Number(row.stageIndex) || 0,
      status: row.status,
      completedAt: row.completedAt ?? undefined
    });
    byProgress.set(row.lessonProgressId, list);
  }
  return byProgress;
}

export async function writeStepProgress(
  tx: Tx,
  progressId: string,
  steps: LessonStepProgressEntity[] | undefined
): Promise<void> {
  await tx.delete(lessonStepProgress).where(eq(lessonStepProgress.lessonProgressId, progressId));
  if (!Array.isArray(steps) || steps.length === 0) return;

  // collapse duplicate stepKeys (last wins) to respect the unique index
  const byKey = new Map<string, LessonStepProgressEntity>();
  for (const step of steps) {
    if (!step?.stepKey) continue;
    byKey.set(String(step.stepKey), step);
  }
  if (byKey.size === 0) return;

  await tx.insert(lessonStepProgress).values(
    Array.from(byKey.entries()).map(([stepKey, step]) => ({
      lessonProgressId: progressId,
      stepKey,
      status: step.status ?? "available",
      score: Number(step.score) || 0,
      completedAt: step.completedAt ?? null
    }))
  );
}

export async function writeStageProgress(
  tx: Tx,
  progressId: string,
  stages: LessonStageProgressEntity[] | undefined
): Promise<void> {
  await tx.delete(lessonStageProgress).where(eq(lessonStageProgress.lessonProgressId, progressId));
  if (!Array.isArray(stages) || stages.length === 0) return;

  const byStageId = new Map<string, LessonStageProgressEntity>();
  for (const stage of stages) {
    if (!stage?.stageId) continue;
    byStageId.set(String(stage.stageId), stage);
  }
  if (byStageId.size === 0) return;

  await tx.insert(lessonStageProgress).values(
    Array.from(byStageId.entries()).map(([stageId, stage]) => ({
      lessonProgressId: progressId,
      stageId,
      stageIndex: Number(stage.stageIndex) || 0,
      status: stage.status ?? "not_started",
      completedAt: stage.completedAt ?? null
    }))
  );
}
