import type { LearnerProfileEntity } from "../entities/LearnerProfile.js";
import type { Language } from "../entities/Lesson.js";

export interface LearnerProfileRepository {
  findByUserId(userId: string): Promise<LearnerProfileEntity | null>;
  findByUsername(username: string): Promise<LearnerProfileEntity | null>;
  create(input: {
    userId: string;
    name: string;
    username?: string;
    avatarUrl?: string;
    proficientLanguage?: string;
    countryOfOrigin?: string;
    onboardingCompleted?: boolean;
    currentLanguage: Language;
    dailyGoalMinutes: number;
  }): Promise<LearnerProfileEntity>;
  updateByUserId(
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
  ): Promise<LearnerProfileEntity | null>;
  countWithHigherTotalXp(totalXp: number): Promise<number>;
}
