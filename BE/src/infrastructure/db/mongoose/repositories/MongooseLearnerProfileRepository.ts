import LearnerProfileModel from "../../../../models/learner/LearnerProfile.js";
import type { LearnerProfileEntity } from "../../../../domain/entities/LearnerProfile.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import { findLanguageIdByCode } from "./languageRef.js";

function toEntity(doc: {
  _id: { toString(): string };
  userId: { toString(): string };
  activeLanguageId?: { toString(): string } | null;
  name?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  proficientLanguage?: string;
  countryOfOrigin?: string;
  onboardingCompleted?: boolean;
  currentLanguage: Language;
  dailyGoalMinutes: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: Date | null;
  completedLessonsCount: number;
  weeklyActivity?: Array<{ date: Date; minutes: number }>;
  achievements?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}): LearnerProfileEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    activeLanguageId: doc.activeLanguageId ? doc.activeLanguageId.toString() : null,
    name: String(doc.name || doc.displayName || ""),
    username: String(doc.username || ""),
    avatarUrl: String(doc.avatarUrl || ""),
    proficientLanguage: String(doc.proficientLanguage || ""),
    countryOfOrigin: String(doc.countryOfOrigin || ""),
    onboardingCompleted: Boolean(doc.onboardingCompleted),
    currentLanguage: doc.currentLanguage,
    dailyGoalMinutes: doc.dailyGoalMinutes,
    totalXp: doc.totalXp ?? 0,
    currentStreak: doc.currentStreak ?? 0,
    longestStreak: doc.longestStreak ?? 0,
    lastActiveDate: doc.lastActiveDate || undefined,
    completedLessonsCount: doc.completedLessonsCount ?? 0,
    weeklyActivity: (doc.weeklyActivity || []).map((item) => ({
      date: new Date(item.date),
      minutes: Number(item.minutes) || 0
    })),
    achievements: (doc.achievements || []).map(String),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLearnerProfileRepository implements LearnerProfileRepository {
  async findByUserId(userId: string): Promise<LearnerProfileEntity | null> {
    const profile = await LearnerProfileModel.findOne({ userId }).lean();
    return profile ? toEntity(profile) : null;
  }

  async findByUsername(username: string): Promise<LearnerProfileEntity | null> {
    const profile = await LearnerProfileModel.findOne({ username }).lean();
    return profile ? toEntity(profile) : null;
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
    const created = await LearnerProfileModel.create({
      ...input,
      displayName: input.name,
      activeLanguageId: activeLanguageId || null
    });
    return toEntity(created);
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
    const activeLanguageId = update.currentLanguage ? await findLanguageIdByCode(update.currentLanguage) : undefined;
    const normalizedUpdate =
      update.name === undefined
        ? update
        : {
            ...update,
            displayName: update.name
          };
    const updated = await LearnerProfileModel.findOneAndUpdate(
      { userId },
      activeLanguageId === undefined
        ? normalizedUpdate
        : { ...normalizedUpdate, activeLanguageId: activeLanguageId || null },
      {
        new: true
      }
    );
    return updated ? toEntity(updated) : null;
  }

  async countWithHigherTotalXp(totalXp: number): Promise<number> {
    return LearnerProfileModel.countDocuments({ totalXp: { $gt: Math.max(0, Number(totalXp) || 0) } });
  }
}
