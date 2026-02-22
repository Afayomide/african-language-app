import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";
import type { Language } from "../../../../domain/entities/Lesson.js";

function isoDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayDiff(a: Date, b: Date) {
  const ms = isoDay(a).getTime() - isoDay(b).getTime();
  return Math.floor(ms / 86400000);
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekDays() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  return Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - idx));
    return { day: days[d.getDay()], dateKey: toDayKey(isoDay(d)) };
  });
}

export class LearnerDashboardUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly learnerProfiles: LearnerProfileRepository,
    private readonly progress: LessonProgressRepository
  ) {}

  async getOverview(userId: string) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return null;

    const publishedLessons = await this.lessons.list({
      status: "published",
      language: profile.currentLanguage
    });

    const progresses = await this.progress.listByUserAndLessonIds(
      userId,
      publishedLessons.map((l) => l.id)
    );

    const completed = new Set(progresses.filter((p) => p.status === "completed").map((p) => p.lessonId));
    const progressByLessonId = new Map(progresses.map((p) => [p.lessonId, p]));

    const nextLesson = publishedLessons.find((lesson) => !completed.has(lesson.id)) || null;
    const completedLessons = publishedLessons
      .filter((lesson) => completed.has(lesson.id))
      .map((lesson) => {
        const item = progressByLessonId.get(lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          level: lesson.level,
          completedAt: item?.completedAt || null
        };
      })
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 8);

    const thisWeek = weekDays();
    const weekMap = new Map<string, number>();
    for (const item of profile.weeklyActivity || []) {
      weekMap.set(toDayKey(isoDay(new Date(item.date))), item.minutes);
    }

    const weeklyOverview = thisWeek.map((entry) => {
      const minutes = weekMap.get(entry.dateKey) || 0;
      return { day: entry.day, minutes, completed: minutes > 0 };
    });

    const todayMinutes = weeklyOverview[weeklyOverview.length - 1]?.minutes || 0;

    const achievements = profile.achievements.length
      ? profile.achievements
      : [
          profile.completedLessonsCount > 0 ? "First Step" : "",
          profile.currentStreak >= 3 ? "On Fire" : "",
          profile.totalXp >= 100 ? "Perfect Score" : ""
        ].filter(Boolean);

    return {
      stats: {
        currentLanguage: profile.currentLanguage,
        streakDays: profile.currentStreak,
        totalXp: profile.totalXp,
        dailyGoalMinutes: profile.dailyGoalMinutes,
        todayMinutes,
        completedLessonsCount: profile.completedLessonsCount
      },
      nextLesson: nextLesson
        ? {
            id: nextLesson.id,
            title: nextLesson.title,
            description: nextLesson.description,
            level: nextLesson.level
          }
        : null,
      completedLessons,
      weeklyOverview,
      achievements
    };
  }

  async updateDailyGoal(userId: string, minutes: number) {
    return this.learnerProfiles.updateByUserId(userId, { dailyGoalMinutes: minutes });
  }

  async updateCurrentLanguage(userId: string, language: Language) {
    return this.learnerProfiles.updateByUserId(userId, { currentLanguage: language });
  }

  async markLearningSession(userId: string, minutes: number) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return null;

    const now = new Date();
    const today = isoDay(now);
    const lastActive = profile.lastActiveDate ? isoDay(new Date(profile.lastActiveDate)) : null;

    let currentStreak = profile.currentStreak;
    if (!lastActive) {
      currentStreak = 1;
    } else {
      const diff = dayDiff(today, lastActive);
      if (diff === 1) currentStreak += 1;
      if (diff > 1) currentStreak = 1;
    }

    const longestStreak = Math.max(profile.longestStreak, currentStreak);

    const key = toDayKey(today);
    const weekly = [...profile.weeklyActivity];
    const idx = weekly.findIndex((entry) => toDayKey(isoDay(new Date(entry.date))) === key);
    if (idx >= 0) {
      weekly[idx] = { ...weekly[idx], minutes: weekly[idx].minutes + minutes };
    } else {
      weekly.push({ date: now, minutes });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const retained = weekly.filter((entry) => new Date(entry.date) >= cutoff);

    const updated = await this.learnerProfiles.updateByUserId(userId, {
      currentStreak,
      longestStreak,
      lastActiveDate: now,
      weeklyActivity: retained
    });

    if (!updated) return null;
    return {
      streakDays: updated.currentStreak,
      longestStreak: updated.longestStreak
    };
  }
}
