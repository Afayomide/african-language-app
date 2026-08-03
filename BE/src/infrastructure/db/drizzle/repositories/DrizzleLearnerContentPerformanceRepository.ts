import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { learnerContentPerformance, type LearnerContentPerformanceRow } from "../schema.js";
import type { LearnerContentPerformanceEntity } from "../../../../domain/entities/LearnerContentPerformance.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  LearnerContentPerformanceRepository,
  LearnerContentPerformanceUpsertInput
} from "../../../../domain/repositories/LearnerContentPerformanceRepository.js";

function toEntity(row: LearnerContentPerformanceRow): LearnerContentPerformanceEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    language: row.language,
    contentType: row.contentType,
    contentId: String(row.contentId),
    exposureCount: row.exposureCount ?? 0,
    attemptCount: row.attemptCount ?? 0,
    correctCount: row.correctCount ?? 0,
    wrongCount: row.wrongCount ?? 0,
    retryCount: row.retryCount ?? 0,
    speakingFailureCount: row.speakingFailureCount ?? 0,
    listeningFailureCount: row.listeningFailureCount ?? 0,
    contextScenarioFailureCount: row.contextScenarioFailureCount ?? 0,
    lastLessonId: row.lastLessonId ? String(row.lastLessonId) : undefined,
    lastQuestionType: row.lastQuestionType ?? undefined,
    lastQuestionSubtype: row.lastQuestionSubtype ?? undefined,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * Postgres refuses to let a single INSERT ... ON CONFLICT DO UPDATE touch the
 * same row twice, so rows targeting the same (user, contentType, contentId) are
 * folded together first: increments sum, and the latest seenAt wins for the
 * "last*" fields. Mongo's sequential bulkWrite produced the same net result.
 */
function foldRows(rows: LearnerContentPerformanceUpsertInput[]): LearnerContentPerformanceUpsertInput[] {
  const byKey = new Map<string, LearnerContentPerformanceUpsertInput>();

  for (const row of rows) {
    const key = `${row.userId}|${row.contentType}|${row.contentId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    const newer = row.seenAt >= existing.seenAt;
    byKey.set(key, {
      ...existing,
      exposureIncrement: existing.exposureIncrement + row.exposureIncrement,
      attemptIncrement: existing.attemptIncrement + row.attemptIncrement,
      correctIncrement: existing.correctIncrement + row.correctIncrement,
      wrongIncrement: existing.wrongIncrement + row.wrongIncrement,
      retryIncrement: existing.retryIncrement + row.retryIncrement,
      speakingFailureIncrement: existing.speakingFailureIncrement + row.speakingFailureIncrement,
      listeningFailureIncrement: existing.listeningFailureIncrement + row.listeningFailureIncrement,
      contextScenarioFailureIncrement:
        existing.contextScenarioFailureIncrement + row.contextScenarioFailureIncrement,
      seenAt: newer ? row.seenAt : existing.seenAt,
      lastLessonId: newer ? row.lastLessonId ?? existing.lastLessonId : existing.lastLessonId,
      lastQuestionType: newer ? row.lastQuestionType ?? existing.lastQuestionType : existing.lastQuestionType,
      lastQuestionSubtype: newer
        ? row.lastQuestionSubtype ?? existing.lastQuestionSubtype
        : existing.lastQuestionSubtype
    });
  }

  return Array.from(byKey.values());
}

export class DrizzleLearnerContentPerformanceRepository implements LearnerContentPerformanceRepository {
  async listByUserAndLanguage(
    userId: string,
    language: Language
  ): Promise<LearnerContentPerformanceEntity[]> {
    const rows = await db
      .select()
      .from(learnerContentPerformance)
      .where(and(eq(learnerContentPerformance.userId, userId), eq(learnerContentPerformance.language, language)))
      .orderBy(desc(learnerContentPerformance.updatedAt));
    return rows.map(toEntity);
  }

  async upsertMany(rows: LearnerContentPerformanceUpsertInput[]): Promise<void> {
    if (!rows.length) return;

    const folded = foldRows(rows);

    await db
      .insert(learnerContentPerformance)
      .values(
        folded.map((row) => ({
          userId: row.userId,
          language: row.language,
          contentType: row.contentType,
          contentId: row.contentId,
          exposureCount: row.exposureIncrement,
          attemptCount: row.attemptIncrement,
          correctCount: row.correctIncrement,
          wrongCount: row.wrongIncrement,
          retryCount: row.retryIncrement,
          speakingFailureCount: row.speakingFailureIncrement,
          listeningFailureCount: row.listeningFailureIncrement,
          contextScenarioFailureCount: row.contextScenarioFailureIncrement,
          lastLessonId: row.lastLessonId ?? null,
          lastQuestionType: row.lastQuestionType ?? null,
          lastQuestionSubtype: row.lastQuestionSubtype ?? null,
          // $setOnInsert in Mongo — never overwritten on conflict
          firstSeenAt: row.seenAt,
          lastSeenAt: row.seenAt
        }))
      )
      .onConflictDoUpdate({
        target: [
          learnerContentPerformance.userId,
          learnerContentPerformance.contentType,
          learnerContentPerformance.contentId
        ],
        set: {
          // $inc — add the new increment to whatever is already stored
          exposureCount: sql`${learnerContentPerformance.exposureCount} + excluded.exposure_count`,
          attemptCount: sql`${learnerContentPerformance.attemptCount} + excluded.attempt_count`,
          correctCount: sql`${learnerContentPerformance.correctCount} + excluded.correct_count`,
          wrongCount: sql`${learnerContentPerformance.wrongCount} + excluded.wrong_count`,
          retryCount: sql`${learnerContentPerformance.retryCount} + excluded.retry_count`,
          speakingFailureCount: sql`${learnerContentPerformance.speakingFailureCount} + excluded.speaking_failure_count`,
          listeningFailureCount: sql`${learnerContentPerformance.listeningFailureCount} + excluded.listening_failure_count`,
          contextScenarioFailureCount: sql`${learnerContentPerformance.contextScenarioFailureCount} + excluded.context_scenario_failure_count`,
          // $set
          lastSeenAt: sql`excluded.last_seen_at`,
          lastLessonId: sql`excluded.last_lesson_id`,
          lastQuestionType: sql`excluded.last_question_type`,
          lastQuestionSubtype: sql`excluded.last_question_subtype`,
          updatedAt: new Date()
        }
      });
  }
}
