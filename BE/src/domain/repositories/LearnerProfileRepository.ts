import type { LearnerProfileEntity } from "../entities/LearnerProfile.js";
import type { Language } from "../entities/Lesson.js";

export interface LearnerProfileRepository {
  findByUserId(userId: string): Promise<LearnerProfileEntity | null>;
  create(input: {
    userId: string;
    displayName: string;
    currentLanguage: Language;
    dailyGoalMinutes: number;
  }): Promise<LearnerProfileEntity>;
  updateByUserId(
    userId: string,
    update: Partial<{
      displayName: string;
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
}
