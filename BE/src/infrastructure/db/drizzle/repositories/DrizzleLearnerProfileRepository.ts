import { count, eq, gt } from "drizzle-orm";
import { db } from "../client.js";
import { learnerProfiles, type LearnerProfileRow, type NewLearnerProfileRow } from "../schema.js";
import type { LearnerProfileEntity } from "../../../../domain/entities/LearnerProfile.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import { findLanguageIdByCode } from "./languageRef.js";
import { loadWeeklyActivity, writeWeeklyActivity, type WeeklyActivity } from "./learnerActivity.js";

function toEntity(row: LearnerProfileRow, weeklyActivity: WeeklyActivity[]): LearnerProfileEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    activeLanguageId: row.activeLanguageId ?? null,
    name: String(row.name || row.displayName || ""),
    username: String(row.username || ""),
    avatarUrl: String(row.avatarUrl || ""),
    proficientLanguage: String(row.proficientLanguage || ""),
    countryOfOrigin: String(row.countryOfOrigin || ""),
    onboardingCompleted: Boolean(row.onboardingCompleted),
    currentLanguage: row.currentLanguage,
    dailyGoalMinutes: row.dailyGoalMinutes,
    totalXp: row.totalXp ?? 0,
    currentStreak: row.currentStreak ?? 0,
    longestStreak: row.longestStreak ?? 0,
    lastActiveDate: row.lastActiveDate ?? undefined,
    completedLessonsCount: row.completedLessonsCount ?? 0,
    weeklyActivity,
    achievements: Array.isArray(row.achievements) ? row.achievements.map(String) : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/** Profile-level activity lives under the NULL language scope. */
async function hydrate(row: LearnerProfileRow | undefined): Promise<LearnerProfileEntity | null> {
  if (!row) return null;
  const activity = await loadWeeklyActivity(row.userId, null);
  return toEntity(row, activity);
}

export class DrizzleLearnerProfileRepository implements LearnerProfileRepository {
  async findByUserId(userId: string): Promise<LearnerProfileEntity | null> {
    const rows = await db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, userId)).limit(1);
    return hydrate(rows[0]);
  }

  async findByUsername(username: string): Promise<LearnerProfileEntity | null> {
    const rows = await db.select().from(learnerProfiles).where(eq(learnerProfiles.username, username)).limit(1);
    return hydrate(rows[0]);
  }

  async create(input: {
    userId: string;
    name: string;
    username?: string;
    avatarUrl?: string;
    proficientLanguage?: string;
    countryOfOrigin?: string;
    onboardingCompleted?: boolean;
    currentLanguage: Language;
    dailyGoalMinutes: number;
  }): Promise<LearnerProfileEntity> {
    const activeLanguageId = await findLanguageIdByCode(input.currentLanguage);
    const [row] = await db
      .insert(learnerProfiles)
      .values({
        userId: input.userId,
        activeLanguageId: activeLanguageId ?? null,
        name: input.name ?? "",
        // Mongo kept displayName mirrored with name
        displayName: input.name ?? "",
        username: input.username ?? "",
        avatarUrl: input.avatarUrl ?? "",
        proficientLanguage: input.proficientLanguage ?? "",
        countryOfOrigin: input.countryOfOrigin ?? "",
        onboardingCompleted: input.onboardingCompleted ?? false,
        currentLanguage: input.currentLanguage,
        dailyGoalMinutes: input.dailyGoalMinutes
      })
      .returning();
    return (await hydrate(row)) as LearnerProfileEntity;
  }

  async updateByUserId(
    userId: string,
    update: Partial<{
      name: string;
      username: string;
      avatarUrl: string;
      proficientLanguage: string;
      countryOfOrigin: string;
      onboardingCompleted: boolean;
      currentLanguage: Language;
      dailyGoalMinutes: number;
      totalXp: number;
      currentStreak: number;
      longestStreak: number;
      lastActiveDate?: Date;
      completedLessonsCount: number;
      weeklyActivity: LearnerProfileEntity["weeklyActivity"];
      achievements: string[];
    }>
  ): Promise<LearnerProfileEntity | null> {
    const values: Partial<NewLearnerProfileRow> = { updatedAt: new Date() };

    if (update.currentLanguage !== undefined) {
      values.currentLanguage = update.currentLanguage;
      values.activeLanguageId = (await findLanguageIdByCode(update.currentLanguage)) ?? null;
    }
    if (update.name !== undefined) {
      values.name = update.name;
      values.displayName = update.name;
    }
    if (update.username !== undefined) values.username = update.username;
    if (update.avatarUrl !== undefined) values.avatarUrl = update.avatarUrl;
    if (update.proficientLanguage !== undefined) values.proficientLanguage = update.proficientLanguage;
    if (update.countryOfOrigin !== undefined) values.countryOfOrigin = update.countryOfOrigin;
    if (update.onboardingCompleted !== undefined) values.onboardingCompleted = update.onboardingCompleted;
    if (update.dailyGoalMinutes !== undefined) values.dailyGoalMinutes = update.dailyGoalMinutes;
    if (update.totalXp !== undefined) values.totalXp = update.totalXp;
    if (update.currentStreak !== undefined) values.currentStreak = update.currentStreak;
    if (update.longestStreak !== undefined) values.longestStreak = update.longestStreak;
    if (update.lastActiveDate !== undefined) values.lastActiveDate = update.lastActiveDate;
    if (update.completedLessonsCount !== undefined) values.completedLessonsCount = update.completedLessonsCount;
    if (update.achievements !== undefined) values.achievements = update.achievements;

    const row = await db.transaction(async (tx) => {
      const rows = await tx
        .update(learnerProfiles)
        .set(values)
        .where(eq(learnerProfiles.userId, userId))
        .returning();
      const updated = rows[0];
      if (!updated) return undefined;
      if (update.weeklyActivity !== undefined) {
        await writeWeeklyActivity(tx, userId, null, update.weeklyActivity);
      }
      return updated;
    });

    return hydrate(row);
  }

  async countWithHigherTotalXp(totalXp: number): Promise<number> {
    const threshold = Math.max(0, Number(totalXp) || 0);
    const rows = await db
      .select({ total: count() })
      .from(learnerProfiles)
      .where(gt(learnerProfiles.totalXp, threshold));
    return Number(rows[0]?.total ?? 0);
  }
}
