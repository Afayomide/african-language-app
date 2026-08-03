import { and, asc, eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  learnerLanguageStates,
  type LearnerLanguageStateRow,
  type NewLearnerLanguageStateRow
} from "../schema.js";
import type { LearnerLanguageStateEntity } from "../../../../domain/entities/LearnerLanguageState.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  LearnerLanguageStateCreateInput,
  LearnerLanguageStateRepository,
  LearnerLanguageStateUpdateInput
} from "../../../../domain/repositories/LearnerLanguageStateRepository.js";
import { findLanguageIdByCode } from "./languageRef.js";
import { loadWeeklyActivity, writeWeeklyActivity, type WeeklyActivity } from "./learnerActivity.js";

function toEntity(row: LearnerLanguageStateRow, weeklyActivity: WeeklyActivity[]): LearnerLanguageStateEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    languageId: row.languageId ?? null,
    languageCode: row.languageCode,
    isEnrolled: Boolean(row.isEnrolled ?? true),
    dailyGoalMinutes: row.dailyGoalMinutes ?? 10,
    totalXp: row.totalXp ?? 0,
    currentStreak: row.currentStreak ?? 0,
    longestStreak: row.longestStreak ?? 0,
    lastActiveDate: row.lastActiveDate ?? undefined,
    completedLessonsCount: row.completedLessonsCount ?? 0,
    weeklyActivity,
    achievements: Array.isArray(row.achievements) ? row.achievements.map(String) : [],
    currentChapterId: row.currentChapterId ?? null,
    currentUnitId: row.currentUnitId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function hydrate(row: LearnerLanguageStateRow | undefined): Promise<LearnerLanguageStateEntity | null> {
  if (!row) return null;
  const activity = await loadWeeklyActivity(row.userId, row.languageCode);
  return toEntity(row, activity);
}

async function enrichLanguageId(
  languageCode: Language,
  input: { languageId?: string | null } = {}
): Promise<string | null> {
  if (input.languageId !== undefined) return input.languageId || null;
  return findLanguageIdByCode(languageCode);
}

function updateValues(update: LearnerLanguageStateUpdateInput): Partial<NewLearnerLanguageStateRow> {
  const values: Partial<NewLearnerLanguageStateRow> = {};
  if (update.languageId !== undefined) values.languageId = update.languageId || null;
  if (update.isEnrolled !== undefined) values.isEnrolled = update.isEnrolled;
  if (update.dailyGoalMinutes !== undefined) values.dailyGoalMinutes = update.dailyGoalMinutes;
  if (update.totalXp !== undefined) values.totalXp = update.totalXp;
  if (update.currentStreak !== undefined) values.currentStreak = update.currentStreak;
  if (update.longestStreak !== undefined) values.longestStreak = update.longestStreak;
  if (update.lastActiveDate !== undefined) values.lastActiveDate = update.lastActiveDate;
  if (update.completedLessonsCount !== undefined) values.completedLessonsCount = update.completedLessonsCount;
  if (update.achievements !== undefined) values.achievements = update.achievements;
  if (update.currentChapterId !== undefined) values.currentChapterId = update.currentChapterId;
  if (update.currentUnitId !== undefined) values.currentUnitId = update.currentUnitId;
  return values;
}

export class DrizzleLearnerLanguageStateRepository implements LearnerLanguageStateRepository {
  async findByUserAndLanguage(
    userId: string,
    languageCode: Language
  ): Promise<LearnerLanguageStateEntity | null> {
    const rows = await db
      .select()
      .from(learnerLanguageStates)
      .where(
        and(eq(learnerLanguageStates.userId, userId), eq(learnerLanguageStates.languageCode, languageCode))
      )
      .limit(1);
    return hydrate(rows[0]);
  }

  async listByUser(userId: string): Promise<LearnerLanguageStateEntity[]> {
    const rows = await db
      .select()
      .from(learnerLanguageStates)
      .where(eq(learnerLanguageStates.userId, userId))
      .orderBy(asc(learnerLanguageStates.createdAt));

    return Promise.all(
      rows.map(async (row) => toEntity(row, await loadWeeklyActivity(row.userId, row.languageCode)))
    );
  }

  async create(input: LearnerLanguageStateCreateInput): Promise<LearnerLanguageStateEntity> {
    const languageId = await enrichLanguageId(input.languageCode, input);

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(learnerLanguageStates)
        .values({
          userId: input.userId,
          languageCode: input.languageCode,
          languageId,
          isEnrolled: input.isEnrolled ?? true,
          dailyGoalMinutes: input.dailyGoalMinutes,
          totalXp: input.totalXp ?? 0,
          currentStreak: input.currentStreak ?? 0,
          longestStreak: input.longestStreak ?? 0,
          lastActiveDate: input.lastActiveDate ?? null,
          completedLessonsCount: input.completedLessonsCount ?? 0,
          achievements: input.achievements ?? [],
          currentChapterId: input.currentChapterId ?? null,
          currentUnitId: input.currentUnitId ?? null
        })
        .returning();

      await writeWeeklyActivity(tx, input.userId, input.languageCode, input.weeklyActivity);
      return created;
    });

    return (await hydrate(row)) as LearnerLanguageStateEntity;
  }

  /**
   * Mongo used $setOnInsert (create defaults) + $set (update fields) with upsert.
   * Postgres equivalent: insert the merged row, and ON CONFLICT apply only the
   * update fields — so create-only defaults never overwrite an existing row.
   */
  async upsertByUserAndLanguage(
    userId: string,
    languageCode: Language,
    create: LearnerLanguageStateCreateInput,
    update: LearnerLanguageStateUpdateInput = {}
  ): Promise<LearnerLanguageStateEntity> {
    const languageId = await enrichLanguageId(languageCode, {
      languageId: update.languageId ?? create.languageId
    });
    const setValues = { ...updateValues(update), ...(languageId ? { languageId } : {}) };

    const insertValues: NewLearnerLanguageStateRow = {
      userId,
      languageCode,
      languageId,
      isEnrolled: create.isEnrolled ?? true,
      dailyGoalMinutes: create.dailyGoalMinutes,
      totalXp: create.totalXp ?? 0,
      currentStreak: create.currentStreak ?? 0,
      longestStreak: create.longestStreak ?? 0,
      lastActiveDate: create.lastActiveDate ?? null,
      completedLessonsCount: create.completedLessonsCount ?? 0,
      achievements: create.achievements ?? [],
      currentChapterId: create.currentChapterId ?? null,
      currentUnitId: create.currentUnitId ?? null,
      // on insert BOTH $setOnInsert and $set applied in Mongo
      ...setValues
    };

    const row = await db.transaction(async (tx) => {
      const [upserted] = await tx
        .insert(learnerLanguageStates)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [learnerLanguageStates.userId, learnerLanguageStates.languageCode],
          set: { ...setValues, updatedAt: new Date() }
        })
        .returning();

      if (update.weeklyActivity !== undefined) {
        await writeWeeklyActivity(tx, userId, languageCode, update.weeklyActivity);
      }
      return upserted;
    });

    return (await hydrate(row)) as LearnerLanguageStateEntity;
  }

  async updateByUserAndLanguage(
    userId: string,
    languageCode: Language,
    update: LearnerLanguageStateUpdateInput
  ): Promise<LearnerLanguageStateEntity | null> {
    const row = await db.transaction(async (tx) => {
      const rows = await tx
        .update(learnerLanguageStates)
        .set({ ...updateValues(update), updatedAt: new Date() })
        .where(
          and(eq(learnerLanguageStates.userId, userId), eq(learnerLanguageStates.languageCode, languageCode))
        )
        .returning();
      const updated = rows[0];
      if (!updated) return undefined;
      if (update.weeklyActivity !== undefined) {
        await writeWeeklyActivity(tx, userId, languageCode, update.weeklyActivity);
      }
      return updated;
    });

    return hydrate(row);
  }
}
