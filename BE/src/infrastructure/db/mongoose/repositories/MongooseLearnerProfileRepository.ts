import LearnerProfileModel from "../../../../models/learner/LearnerProfile.js";
import type { LearnerProfileEntity } from "../../../../domain/entities/LearnerProfile.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type { Language } from "../../../../domain/entities/Lesson.js";

function toEntity(doc: {
  _id: { toString(): string };
  userId: { toString(): string };
  displayName: string;
  currentLanguage: Language;
  dailyGoalMinutes: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: Date | null;
  completedLessonsCount: number;
  weeklyActivity?: Array<{ date: Date; minutes: number }>;
  achievements?: string[];
}): LearnerProfileEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    displayName: doc.displayName,
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
    achievements: (doc.achievements || []).map(String)
  };
}

export class MongooseLearnerProfileRepository implements LearnerProfileRepository {
  async findByUserId(userId: string): Promise<LearnerProfileEntity | null> {
    const profile = await LearnerProfileModel.findOne({ userId });
    return profile ? toEntity(profile) : null;
  }

  async create(input: {
    userId: string;
    displayName: string;
    currentLanguage: Language;
    dailyGoalMinutes: number;
  }): Promise<LearnerProfileEntity> {
    const created = await LearnerProfileModel.create(input);
    return toEntity(created);
  }

  async updateByUserId(
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
  ): Promise<LearnerProfileEntity | null> {
    const updated = await LearnerProfileModel.findOneAndUpdate({ userId }, update, {
      new: true
    });
    return updated ? toEntity(updated) : null;
  }
}
