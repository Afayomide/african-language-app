import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { learnerActivityDays } from "../schema.js";
import type { Language } from "../../../../domain/entities/Lesson.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WeeklyActivity = { date: Date; minutes: number };

/**
 * weeklyActivity[] normalized into learner_activity_days.
 *
 * `language_code` NULL = the profile-level (all-languages) series that
 * LearnerProfile.weeklyActivity used to hold; a code = that language's series
 * from LearnerLanguageState.
 *
 * NOTE: activity_date is a calendar DATE, so a full timestamp is narrowed to a
 * UTC day. Round-tripping returns UTC midnight, not the original time-of-day.
 */

function toDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function fromDateKey(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(`${value}T00:00:00.000Z`);
}

const scopeCondition = (userId: string, languageCode: Language | null) =>
  languageCode === null
    ? and(eq(learnerActivityDays.userId, userId), isNull(learnerActivityDays.languageCode))
    : and(eq(learnerActivityDays.userId, userId), eq(learnerActivityDays.languageCode, languageCode));

export async function loadWeeklyActivity(
  userId: string,
  languageCode: Language | null
): Promise<WeeklyActivity[]> {
  const rows = await db
    .select()
    .from(learnerActivityDays)
    .where(scopeCondition(userId, languageCode))
    .orderBy(asc(learnerActivityDays.activityDate));

  return rows.map((row) => ({
    date: fromDateKey(row.activityDate),
    minutes: Number(row.minutes) || 0
  }));
}

/** Replace the whole series for one (user, language) scope. */
export async function writeWeeklyActivity(
  tx: Tx,
  userId: string,
  languageCode: Language | null,
  entries: WeeklyActivity[] | undefined
): Promise<void> {
  await tx.delete(learnerActivityDays).where(scopeCondition(userId, languageCode));
  if (!Array.isArray(entries) || entries.length === 0) return;

  // collapse duplicate days (last wins) so the unique index can't be violated
  const byDay = new Map<string, number>();
  for (const entry of entries) {
    if (!entry?.date) continue;
    byDay.set(toDateKey(entry.date), Number(entry.minutes) || 0);
  }
  if (byDay.size === 0) return;

  await tx.insert(learnerActivityDays).values(
    Array.from(byDay.entries()).map(([activityDate, minutes]) => ({
      userId,
      languageCode,
      activityDate,
      minutes
    }))
  );
}
