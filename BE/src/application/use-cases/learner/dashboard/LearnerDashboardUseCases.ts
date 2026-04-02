import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { LearnerLanguageStateEntity } from "../../../../domain/entities/LearnerLanguageState.js";
import type { LearnerLanguageStateRepository } from "../../../../domain/repositories/LearnerLanguageStateRepository.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type { ChapterRepository } from "../../../../domain/repositories/ChapterRepository.js";
import { LANGUAGE_VALUES, type Language, type LessonEntity } from "../../../../domain/entities/Lesson.js";
import {
  calculateCourseProgressPercent,
  calculateDailyProgressPercent,
  deriveDisplayAchievements
} from "../../../services/learnerStats.js";

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

type WeeklyActivityRow = { date: Date; minutes: number };

type StreakSnapshot = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: Date;
  weeklyActivity: WeeklyActivityRow[];
};

function buildActivityStateUpdate(snapshot: StreakSnapshot, minutes: number) {
  const safeMinutes = Math.max(0, minutes);
  const now = new Date();
  const today = isoDay(now);
  const lastActive = snapshot.lastActiveDate ? isoDay(new Date(snapshot.lastActiveDate)) : null;

  let currentStreak = snapshot.currentStreak;
  if (!lastActive) {
    currentStreak = 1;
  } else {
    const diff = dayDiff(today, lastActive);
    if (diff === 0) currentStreak = Math.max(snapshot.currentStreak, 1);
    if (diff === 1) currentStreak = Math.max(snapshot.currentStreak, 0) + 1;
    if (diff > 1) currentStreak = 1;
  }

  const longestStreak = Math.max(snapshot.longestStreak, currentStreak);
  const todayKey = toDayKey(today);
  const weekly = [...(snapshot.weeklyActivity || [])];
  const idx = weekly.findIndex((entry) => toDayKey(isoDay(new Date(entry.date))) === todayKey);
  if (idx >= 0) {
    weekly[idx] = { ...weekly[idx], minutes: weekly[idx].minutes + safeMinutes };
  } else {
    weekly.push({ date: now, minutes: safeMinutes });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: now,
    weeklyActivity: weekly.filter((entry) => new Date(entry.date) >= cutoff)
  };
}

function getTodayMinutes(weeklyActivity: WeeklyActivityRow[]) {
  const todayKey = toDayKey(isoDay(new Date()));
  const todayEntry = weeklyActivity.find((item) => toDayKey(isoDay(new Date(item.date))) === todayKey);
  return todayEntry?.minutes || 0;
}

function sortLearnerLanguages(languageStates: LearnerLanguageStateEntity[], activeLanguage: Language) {
  const order = new Map(LANGUAGE_VALUES.map((code, index) => [code, index]));
  return languageStates
    .slice()
    .sort((left, right) => {
      if (left.languageCode === activeLanguage && right.languageCode !== activeLanguage) return -1;
      if (right.languageCode === activeLanguage && left.languageCode !== activeLanguage) return 1;
      return (order.get(left.languageCode) ?? 999) - (order.get(right.languageCode) ?? 999);
    });
}

function buildOrderedPublishedUnits<T extends { id: string; chapterId?: string | null; orderIndex: number; createdAt: Date }>(
  chapters: Array<{ id: string; orderIndex: number; createdAt: Date }>,
  units: T[]
): T[] {
  const chapterMetaById = new Map(
    chapters.map((chapter) => [
      chapter.id,
      { orderIndex: chapter.orderIndex, createdAt: chapter.createdAt.getTime() }
    ])
  );

  return units
    .slice()
    .sort((left, right) => {
      const leftChapter = left.chapterId ? chapterMetaById.get(left.chapterId) : null;
      const rightChapter = right.chapterId ? chapterMetaById.get(right.chapterId) : null;
      const leftChapterOrder = leftChapter?.orderIndex ?? Number.MAX_SAFE_INTEGER;
      const rightChapterOrder = rightChapter?.orderIndex ?? Number.MAX_SAFE_INTEGER;
      const chapterOrderDiff = leftChapterOrder - rightChapterOrder;
      if (chapterOrderDiff !== 0) return chapterOrderDiff;

      if ((left.chapterId || null) !== (right.chapterId || null)) {
        const leftChapterTime = leftChapter?.createdAt ?? Number.MAX_SAFE_INTEGER;
        const rightChapterTime = rightChapter?.createdAt ?? Number.MAX_SAFE_INTEGER;
        const chapterTimeDiff = leftChapterTime - rightChapterTime;
        if (chapterTimeDiff !== 0) return chapterTimeDiff;
        return String(left.chapterId || "").localeCompare(String(right.chapterId || ""));
      }

      const unitOrderDiff = (left.orderIndex ?? 0) - (right.orderIndex ?? 0);
      if (unitOrderDiff !== 0) return unitOrderDiff;
      return left.createdAt.getTime() - right.createdAt.getTime();
    });
}

function buildOrderedPublishedLessons<T extends { id: string; orderIndex: number; createdAt: Date }>(
  orderedUnits: T[],
  lessons: LessonEntity[]
) {
  const unitPositionMap = new Map(orderedUnits.map((unit, index) => [unit.id, index]));
  return lessons
    .filter((lesson) => unitPositionMap.has(lesson.unitId))
    .slice()
    .sort((a, b) => {
      const unitPositionDiff = (unitPositionMap.get(a.unitId) ?? 0) - (unitPositionMap.get(b.unitId) ?? 0);
      if (unitPositionDiff !== 0) return unitPositionDiff;
      const lessonOrderDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
      if (lessonOrderDiff !== 0) return lessonOrderDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

export class LearnerDashboardUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly chapters: ChapterRepository,
    private readonly learnerProfiles: LearnerProfileRepository,
    private readonly learnerLanguageStates: LearnerLanguageStateRepository,
    private readonly progress: LessonProgressRepository
  ) {}

  private async ensureLearnerLanguageState(input: {
    userId: string;
    language: Language;
    profile: Awaited<ReturnType<LearnerProfileRepository["findByUserId"]>>;
  }) {
    if (!input.profile) return null;
    const existing = await this.learnerLanguageStates.findByUserAndLanguage(input.userId, input.language);
    if (existing) return existing;
    return this.learnerLanguageStates.create({
      userId: input.userId,
      languageCode: input.language,
      dailyGoalMinutes: input.profile.dailyGoalMinutes,
      isEnrolled: true,
      achievements: [],
      weeklyActivity: []
    });
  }

  async getOverview(userId: string, languageOverride?: Language) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return null;
    const language = languageOverride || profile.currentLanguage;
    const languageState = await this.ensureLearnerLanguageState({ userId, language, profile });
    if (!languageState) return null;
    const scopedLanguageId = languageState.languageId || (profile.currentLanguage === language ? profile.activeLanguageId || null : null);
    const learnerLanguages = sortLearnerLanguages(await this.learnerLanguageStates.listByUser(userId), language);

    const publishedLessons = await this.lessons.list({
      status: "published",
      language,
      languageId: scopedLanguageId
    });
    const publishedChapters = await this.chapters.list({
      status: "published",
      language,
      languageId: scopedLanguageId
    });
    const publishedUnits = await this.units.list({
      status: "published",
      language,
      languageId: scopedLanguageId
    });

    const progresses = await this.progress.listByUserAndLessonIds(
      userId,
      publishedLessons.map((l) => l.id)
    );

    const orderedUnits = buildOrderedPublishedUnits(publishedChapters, publishedUnits);
    const orderedLessons = buildOrderedPublishedLessons(orderedUnits, publishedLessons);
    const completed = new Set(progresses.filter((p) => p.status === "completed").map((p) => p.lessonId));
    const progressByLessonId = new Map(progresses.map((p) => [p.lessonId, p]));

    const nextLesson = orderedLessons.find((lesson) => !completed.has(lesson.id)) || null;
    const unitsById = new Map(publishedUnits.map((unit) => [unit.id, unit]));
    const completedLessons = orderedLessons
      .filter((lesson) => completed.has(lesson.id))
      .map((lesson) => {
        const item = progressByLessonId.get(lesson.id);
        const unit = unitsById.get(lesson.unitId);
        return {
          id: lesson.id,
          unitId: lesson.unitId,
          unitTitle: unit?.title || "Unit",
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
    for (const item of languageState.weeklyActivity || []) {
      weekMap.set(toDayKey(isoDay(new Date(item.date))), item.minutes);
    }

    const weeklyOverview = thisWeek.map((entry) => {
      const minutes = weekMap.get(entry.dateKey) || 0;
      return { day: entry.day, minutes, completed: minutes > 0 };
    });

    const todayMinutes = weeklyOverview[weeklyOverview.length - 1]?.minutes || 0;
    const globalTodayMinutes = getTodayMinutes(profile.weeklyActivity || []);
    const filteredTotalXp = progresses.reduce((sum, item) => sum + (item.xpEarned || 0), 0);
    const filteredCompletedLessonsCount = completed.size;
    const totalXp = filteredTotalXp;
    const completedLessonsCount = filteredCompletedLessonsCount;
    const totalLessonsCount = orderedLessons.length;
    const dailyGoalMinutes = languageState.dailyGoalMinutes;
    const dailyProgressPercent = calculateDailyProgressPercent(todayMinutes, dailyGoalMinutes);
    const courseProgressPercent = calculateCourseProgressPercent(completedLessonsCount, totalLessonsCount);

    const achievements = deriveDisplayAchievements({
      existingAchievements: languageState.achievements,
      completedLessonsCount,
      currentStreak: languageState.currentStreak,
      totalXp
    });

    const learnerLanguageSummaries = await Promise.all(
      learnerLanguages.map(async (state) => {
        const summaryScopedLanguageId =
          state.languageId || (profile.currentLanguage === state.languageCode ? profile.activeLanguageId || null : null);
        const languageLessons = await this.lessons.list({
          status: "published",
          language: state.languageCode,
          languageId: summaryScopedLanguageId
        });
        const languageProgresses = languageLessons.length
          ? await this.progress.listByUserAndLessonIds(
              userId,
              languageLessons.map((lesson) => lesson.id)
            )
          : [];
        const languageCompletedLessonsCount = languageProgresses.filter((item) => item.status === "completed").length;
        const languageTotalXp = languageProgresses.reduce((sum, item) => sum + (item.xpEarned || 0), 0);
        const languageTodayMinutes = getTodayMinutes(state.weeklyActivity);

        return {
          languageId: state.languageId || null,
          languageCode: state.languageCode,
          isEnrolled: state.isEnrolled,
          isActive: state.languageCode === language,
          totalXp: languageTotalXp,
          streakDays: state.currentStreak,
          longestStreak: state.longestStreak,
          dailyGoalMinutes: state.dailyGoalMinutes,
          todayMinutes: languageTodayMinutes,
          dailyProgressPercent: calculateDailyProgressPercent(languageTodayMinutes, state.dailyGoalMinutes),
          completedLessonsCount: languageCompletedLessonsCount,
          totalLessonsCount: languageLessons.length,
          courseProgressPercent: calculateCourseProgressPercent(languageCompletedLessonsCount, languageLessons.length)
        };
      })
    );

    const units = orderedUnits.map((unit) => {
      const unitLessons = orderedLessons
        .filter((lesson) => lesson.unitId === unit.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((lesson) => {
          const lessonProgress = progressByLessonId.get(lesson.id);
          return {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            level: lesson.level,
            orderIndex: lesson.orderIndex,
            status: lessonProgress?.status || "not_started",
            progressPercent: lessonProgress?.progressPercent || 0,
            currentStageIndex: lessonProgress?.currentStageIndex || 0,
            totalStages: Array.isArray(lesson.stages) ? lesson.stages.length : 0
          };
        });

      const completedCount = unitLessons.filter((lesson) => lesson.status === "completed").length;
      const totalLessons = unitLessons.length;
      const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

      return {
        id: unit.id,
        chapterId: unit.chapterId ?? null,
        title: unit.title,
        description: unit.description,
        level: unit.level,
        orderIndex: unit.orderIndex,
        progressPercent,
        completedLessons: completedCount,
        totalLessons,
        lessons: unitLessons
      };
    });

    const currentUnitId = nextLesson?.unitId || units.find((unit) => unit.progressPercent < 100)?.id || null;
    const currentChapterId =
      units.find((unit) => unit.id === currentUnitId)?.chapterId ||
      publishedChapters.find((chapter) => units.some((unit) => unit.chapterId === chapter.id && unit.progressPercent < 100))?.id ||
      null;
    const unitsByChapterId = new Map<string | null, typeof units>();

    for (const unit of units) {
      const key = unit.chapterId ?? null;
      const bucket = unitsByChapterId.get(key) || [];
      bucket.push(unit);
      unitsByChapterId.set(key, bucket);
    }

    const orderedChapters = publishedChapters
      .slice()
      .sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        if (orderDiff !== 0) return orderDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((chapter) => {
        const chapterUnits = (unitsByChapterId.get(chapter.id) || []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
        const completedUnits = chapterUnits.filter((unit) => unit.progressPercent >= 100).length;
        const totalUnits = chapterUnits.length;
        const progressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

        return {
          id: chapter.id,
          title: chapter.title,
          description: chapter.description,
          level: chapter.level,
          orderIndex: chapter.orderIndex,
          progressPercent,
          completedUnits,
          totalUnits,
          status:
            chapter.id === currentChapterId
              ? "current"
              : progressPercent >= 100
                ? "completed"
                : currentChapterId && chapter.orderIndex > (publishedChapters.find((item) => item.id === currentChapterId)?.orderIndex ?? -1)
                  ? "locked"
                  : "available",
          units: chapterUnits
        };
      });

    const orphanUnits = (unitsByChapterId.get(null) || []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
    if (orphanUnits.length) {
      const completedUnits = orphanUnits.filter((unit) => unit.progressPercent >= 100).length;
      const totalUnits = orphanUnits.length;
      const progressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
      orderedChapters.unshift({
        id: "unassigned",
        title: "Foundations",
        description: "Build the basics before moving deeper into the language.",
        level: orphanUnits[0]?.level || "beginner",
        orderIndex: -1,
        progressPercent,
        completedUnits,
        totalUnits,
        status:
          currentChapterId === null
            ? "current"
            : progressPercent >= 100
              ? "completed"
              : "available",
        units: orphanUnits
      });
    }

    return {
      stats: {
        currentLanguage: language,
        streakDays: profile.currentStreak,
        languageStreakDays: languageState.currentStreak,
        longestStreak: profile.longestStreak,
        languageLongestStreak: languageState.longestStreak,
        totalXp,
        globalTotalXp: profile.totalXp,
        dailyGoalMinutes,
        todayMinutes,
        dailyProgressPercent,
        globalTodayMinutes,
        completedLessonsCount,
        globalCompletedLessonsCount: profile.completedLessonsCount,
        totalLessonsCount,
        courseProgressPercent
      },
      learnerLanguages: learnerLanguageSummaries,
      nextLesson: nextLesson
        ? {
            id: nextLesson.id,
            unitId: nextLesson.unitId,
            unitTitle: unitsById.get(nextLesson.unitId)?.title || "Unit",
            title: nextLesson.title,
            description: nextLesson.description,
            level: nextLesson.level,
            orderIndex: nextLesson.orderIndex,
            currentStageIndex: progressByLessonId.get(nextLesson.id)?.currentStageIndex || 0,
            totalStages: Array.isArray(nextLesson.stages) ? nextLesson.stages.length : 0,
            progressPercent: progressByLessonId.get(nextLesson.id)?.progressPercent || 0
          }
        : null,
      chapters: orderedChapters,
      units,
      completedLessons,
      weeklyOverview,
      achievements
    };
  }

  async updateDailyGoal(userId: string, minutes: number) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return null;

    const state = await this.ensureLearnerLanguageState({
      userId,
      language: profile.currentLanguage,
      profile
    });
    if (!state) return null;

    await this.learnerLanguageStates.updateByUserAndLanguage(userId, profile.currentLanguage, {
      dailyGoalMinutes: minutes
    });

    return this.learnerProfiles.updateByUserId(userId, { dailyGoalMinutes: minutes });
  }

  async updateCurrentLanguage(userId: string, language: Language) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return null;

    const state = await this.ensureLearnerLanguageState({ userId, language, profile });
    if (!state) return null;

    await this.learnerLanguageStates.updateByUserAndLanguage(userId, language, { isEnrolled: true });

    return this.learnerProfiles.updateByUserId(userId, {
      currentLanguage: language,
      dailyGoalMinutes: state.dailyGoalMinutes
    });
  }

  async markLearningSession(userId: string, minutes: number) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return null;
    const language = profile.currentLanguage;
    const state = await this.ensureLearnerLanguageState({ userId, language, profile });
    if (!state) return null;

    const nextGlobalActivity = buildActivityStateUpdate(
      {
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        lastActiveDate: profile.lastActiveDate,
        weeklyActivity: profile.weeklyActivity || []
      },
      minutes
    );
    const nextLanguageActivity = buildActivityStateUpdate(
      {
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastActiveDate: state.lastActiveDate,
        weeklyActivity: state.weeklyActivity || []
      },
      minutes
    );

    const [updatedProfile, updatedState] = await Promise.all([
      this.learnerProfiles.updateByUserId(userId, nextGlobalActivity),
      this.learnerLanguageStates.updateByUserAndLanguage(userId, language, nextLanguageActivity)
    ]);

    if (!updatedProfile || !updatedState) return null;
    return {
      streakDays: updatedProfile.currentStreak,
      longestStreak: updatedProfile.longestStreak,
      languageStreakDays: updatedState.currentStreak,
      languageLongestStreak: updatedState.longestStreak
    };
  }
}
