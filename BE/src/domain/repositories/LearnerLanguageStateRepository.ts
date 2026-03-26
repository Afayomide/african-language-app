import type { LearnerLanguageStateEntity } from "../entities/LearnerLanguageState.js";
import type { Language } from "../entities/Lesson.js";

export type LearnerLanguageStateCreateInput = {
  userId: string;
  languageCode: Language;
  languageId?: string | null;
  isEnrolled?: boolean;
  dailyGoalMinutes: number;
  totalXp?: number;
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: Date;
  completedLessonsCount?: number;
  weeklyActivity?: LearnerLanguageStateEntity["weeklyActivity"];
  achievements?: string[];
  currentChapterId?: string | null;
  currentUnitId?: string | null;
};

export type LearnerLanguageStateUpdateInput = Partial<
  Pick<
    LearnerLanguageStateEntity,
    | "languageId"
    | "isEnrolled"
    | "dailyGoalMinutes"
    | "totalXp"
    | "currentStreak"
    | "longestStreak"
    | "lastActiveDate"
    | "completedLessonsCount"
    | "weeklyActivity"
    | "achievements"
    | "currentChapterId"
    | "currentUnitId"
  >
>;

export interface LearnerLanguageStateRepository {
  findByUserAndLanguage(userId: string, languageCode: Language): Promise<LearnerLanguageStateEntity | null>;
  listByUser(userId: string): Promise<LearnerLanguageStateEntity[]>;
  create(input: LearnerLanguageStateCreateInput): Promise<LearnerLanguageStateEntity>;
  upsertByUserAndLanguage(
    userId: string,
    languageCode: Language,
    create: LearnerLanguageStateCreateInput,
    update?: LearnerLanguageStateUpdateInput
  ): Promise<LearnerLanguageStateEntity>;
  updateByUserAndLanguage(
    userId: string,
    languageCode: Language,
    update: LearnerLanguageStateUpdateInput
  ): Promise<LearnerLanguageStateEntity | null>;
}
