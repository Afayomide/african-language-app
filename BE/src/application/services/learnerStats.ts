type AchievementStats = {
  existingAchievements?: string[] | null;
  completedLessonsCount: number;
  currentStreak: number;
  totalXp: number;
};

const PERSISTENT_ACHIEVEMENTS = ["First Step", "Perfect Score"] as const;
const KNOWN_DERIVED_ACHIEVEMENTS = ["First Step", "On Fire", "Perfect Score"] as const;

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function derivePersistentAchievements(input: Omit<AchievementStats, "currentStreak">) {
  const existing = unique(input.existingAchievements || []);
  const next = [...existing];

  if (input.completedLessonsCount > 0 && !next.includes("First Step")) {
    next.push("First Step");
  }

  if (input.totalXp >= 100 && !next.includes("Perfect Score")) {
    next.push("Perfect Score");
  }

  return next;
}

export function deriveDisplayAchievements(input: AchievementStats) {
  const existing = unique(input.existingAchievements || []);
  const extras = existing.filter(
    (achievement) => !KNOWN_DERIVED_ACHIEVEMENTS.includes(achievement as (typeof KNOWN_DERIVED_ACHIEVEMENTS)[number])
  );
  const persistent = derivePersistentAchievements(input);

  return unique([
    ...persistent,
    ...(input.currentStreak >= 3 ? ["On Fire"] : []),
    ...extras
  ]);
}

export function calculateDailyProgressPercent(todayMinutes: number, dailyGoalMinutes: number) {
  const safeGoal = Math.max(1, Number(dailyGoalMinutes || 0));
  const safeMinutes = Math.max(0, Number(todayMinutes || 0));
  return Math.min(100, Math.round((safeMinutes / safeGoal) * 100));
}

export function calculateCourseProgressPercent(completedLessonsCount: number, totalLessonsCount: number) {
  const safeTotal = Math.max(0, Number(totalLessonsCount || 0));
  if (safeTotal === 0) return 0;
  const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completedLessonsCount || 0)));
  return Math.round((safeCompleted / safeTotal) * 100);
}
