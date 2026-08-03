import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { learnerQuestionMisses, type LearnerQuestionMissRow } from "../schema.js";
import type { LearnerQuestionMissEntity } from "../../../../domain/entities/LearnerQuestionMiss.js";
import type {
  LearnerQuestionMissRepository,
  LearnerQuestionMissUpsertInput
} from "../../../../domain/repositories/LearnerQuestionMissRepository.js";

function toEntity(row: LearnerQuestionMissRow): LearnerQuestionMissEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    lessonId: String(row.lessonId),
    questionId: String(row.questionId),
    questionType: row.questionType,
    questionSubtype: row.questionSubtype,
    sourceType: row.sourceType ?? undefined,
    sourceId: row.sourceId ? String(row.sourceId) : undefined,
    missCount: row.missCount ?? 0,
    firstMissedAt: row.firstMissedAt,
    lastMissedAt: row.lastMissedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/** Same folding rule as content performance — one row per (user, question). */
function foldRows(rows: LearnerQuestionMissUpsertInput[]): LearnerQuestionMissUpsertInput[] {
  const byKey = new Map<string, LearnerQuestionMissUpsertInput>();

  for (const row of rows) {
    const key = `${row.userId}|${row.questionId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, missIncrement: Math.max(1, row.missIncrement) });
      continue;
    }
    const newer = row.seenAt >= existing.seenAt;
    byKey.set(key, {
      ...existing,
      missIncrement: existing.missIncrement + Math.max(1, row.missIncrement),
      seenAt: newer ? row.seenAt : existing.seenAt
    });
  }

  return Array.from(byKey.values());
}

export class DrizzleLearnerQuestionMissRepository implements LearnerQuestionMissRepository {
  async listByUserAndLessonIds(userId: string, lessonIds: string[]): Promise<LearnerQuestionMissEntity[]> {
    if (!lessonIds.length) return [];
    const rows = await db
      .select()
      .from(learnerQuestionMisses)
      .where(and(eq(learnerQuestionMisses.userId, userId), inArray(learnerQuestionMisses.lessonId, lessonIds)))
      .orderBy(desc(learnerQuestionMisses.lastMissedAt), desc(learnerQuestionMisses.updatedAt));
    return rows.map(toEntity);
  }

  async upsertMany(rows: LearnerQuestionMissUpsertInput[]): Promise<void> {
    if (!rows.length) return;

    const folded = foldRows(rows);

    await db
      .insert(learnerQuestionMisses)
      .values(
        folded.map((row) => ({
          userId: row.userId,
          lessonId: row.lessonId,
          questionId: row.questionId,
          questionType: row.questionType,
          questionSubtype: row.questionSubtype,
          sourceType: row.sourceType ?? null,
          sourceId: row.sourceId ?? null,
          missCount: Math.max(1, row.missIncrement),
          firstMissedAt: row.seenAt,
          lastMissedAt: row.seenAt
        }))
      )
      .onConflictDoUpdate({
        target: [learnerQuestionMisses.userId, learnerQuestionMisses.questionId],
        set: {
          missCount: sql`${learnerQuestionMisses.missCount} + excluded.miss_count`,
          lastMissedAt: sql`excluded.last_missed_at`,
          updatedAt: new Date()
        }
      });
  }
}
