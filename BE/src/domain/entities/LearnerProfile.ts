import type { Language } from "./Lesson.js";

export type LearnerWeeklyActivity = {
  date: Date;
  minutes: number;
};

export type LearnerProfileEntity = {
  id: string;
  _id?: string;
  userId: string;
  activeLanguageId?: string | null;
  name: string;
  username?: string;
  avatarUrl?: string;
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
  weeklyActivity: LearnerWeeklyActivity[];
  achievements: string[];
  createdAt?: Date;
  updatedAt?: Date;
};
