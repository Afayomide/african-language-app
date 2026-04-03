import LearnerLanguageStateModel from "../../../../models/learner/LearnerLanguageState.js";
import type { LearnerLanguageStateEntity } from "../../../../domain/entities/LearnerLanguageState.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  LearnerLanguageStateCreateInput,
  LearnerLanguageStateRepository,
  LearnerLanguageStateUpdateInput
} from "../../../../domain/repositories/LearnerLanguageStateRepository.js";
import { findLanguageIdByCode } from "./languageRef.js";

function toEntity(doc: {
  _id: { toString(): string };
  userId: { toString(): string };
  languageId?: { toString(): string } | null;
  languageCode: Language;
  isEnrolled?: boolean;
  dailyGoalMinutes: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: Date | null;
  completedLessonsCount: number;
  weeklyActivity?: Array<{ date: Date; minutes: number }>;
  achievements?: string[];
  currentChapterId?: { toString(): string } | null;
  currentUnitId?: { toString(): string } | null;
  createdAt: Date;
  updatedAt: Date;
}): LearnerLanguageStateEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    languageId: doc.languageId ? String(doc.languageId) : null,
    languageCode: doc.languageCode,
    isEnrolled: Boolean(doc.isEnrolled ?? true),
    dailyGoalMinutes: doc.dailyGoalMinutes ?? 10,
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
    currentChapterId: doc.currentChapterId ? String(doc.currentChapterId) : null,
    currentUnitId: doc.currentUnitId ? String(doc.currentUnitId) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

async function enrichLanguageId(
  languageCode: Language,
  input: { languageId?: string | null } = {}
): Promise<string | null> {
  if (input.languageId !== undefined) return input.languageId || null;
  return findLanguageIdByCode(languageCode);
}

export class MongooseLearnerLanguageStateRepository implements LearnerLanguageStateRepository {
  async findByUserAndLanguage(userId: string, languageCode: Language): Promise<LearnerLanguageStateEntity | null> {
    const doc = await LearnerLanguageStateModel.findOne({ userId, languageCode }).lean();
    return doc ? toEntity(doc) : null;
  }

  async listByUser(userId: string): Promise<LearnerLanguageStateEntity[]> {
    const docs = await LearnerLanguageStateModel.find({ userId }).sort({ createdAt: 1 }).lean();
    return docs.map(toEntity);
  }

  async create(input: LearnerLanguageStateCreateInput): Promise<LearnerLanguageStateEntity> {
    const languageId = await enrichLanguageId(input.languageCode, input);
    const created = await LearnerLanguageStateModel.create({
      ...input,
      languageId
    });
    return toEntity(created);
  }

  async upsertByUserAndLanguage(
    userId: string,
    languageCode: Language,
    create: LearnerLanguageStateCreateInput,
    update: LearnerLanguageStateUpdateInput = {}
  ): Promise<LearnerLanguageStateEntity> {
    const languageId = await enrichLanguageId(languageCode, {
      languageId: update.languageId ?? create.languageId
    });
    const setOnInsert = {
      userId,
      languageCode,
      isEnrolled: create.isEnrolled ?? true,
      dailyGoalMinutes: create.dailyGoalMinutes,
      totalXp: create.totalXp ?? 0,
      currentStreak: create.currentStreak ?? 0,
      longestStreak: create.longestStreak ?? 0,
      lastActiveDate: create.lastActiveDate,
      completedLessonsCount: create.completedLessonsCount ?? 0,
      weeklyActivity: create.weeklyActivity ?? [],
      achievements: create.achievements ?? [],
      currentChapterId: create.currentChapterId ?? null,
      currentUnitId: create.currentUnitId ?? null
    };
    const set = {
      ...update,
      ...(languageId ? { languageId } : {})
    };
    const insertOnlyEntries = Object.entries(setOnInsert).filter(([key]) => !(key in set));
    const doc = await LearnerLanguageStateModel.findOneAndUpdate(
      { userId, languageCode },
      {
        $setOnInsert: Object.fromEntries(insertOnlyEntries),
        $set: set
      },
      { upsert: true, new: true }
    );
    return toEntity(doc!);
  }

  async updateByUserAndLanguage(
    userId: string,
    languageCode: Language,
    update: LearnerLanguageStateUpdateInput
  ): Promise<LearnerLanguageStateEntity | null> {
    const languageId = update.languageId !== undefined ? update.languageId : undefined;
    const doc = await LearnerLanguageStateModel.findOneAndUpdate(
      { userId, languageCode },
      {
        ...update,
        ...(languageId === undefined ? {} : { languageId: languageId || null })
      },
      { new: true }
    );
    return doc ? toEntity(doc) : null;
  }
}
