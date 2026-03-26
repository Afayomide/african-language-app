import type { Language } from "./Lesson.js";

export type LearnerLanguageWeeklyActivity = {
  date: Date;
  minutes: number;
};

export type LearnerLanguageStateEntity = {
  id: string;
  _id?: string;
  userId: string;
  languageId?: string | null;
  languageCode: Language;
  isEnrolled: boolean;
  dailyGoalMinutes: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: Date;
  completedLessonsCount: number;
  weeklyActivity: LearnerLanguageWeeklyActivity[];
  achievements: string[];
  currentChapterId?: string | null;
  currentUnitId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};
