import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { LANGUAGE_VALUES } from "../../domain/entities/Lesson.js";

const WeeklyActivitySchema = new Schema(
  {
    date: { type: Date, required: true },
    minutes: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const LearnerLanguageStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    languageId: { type: Schema.Types.ObjectId, ref: "Language", default: null, index: true },
    languageCode: { type: String, enum: [...LANGUAGE_VALUES], required: true, index: true },
    isEnrolled: { type: Boolean, default: true, index: true },
    dailyGoalMinutes: { type: Number, default: 10, min: 1, max: 120 },
    totalXp: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActiveDate: { type: Date, default: null },
    completedLessonsCount: { type: Number, default: 0, min: 0 },
    weeklyActivity: { type: [WeeklyActivitySchema], default: [] },
    achievements: { type: [String], default: [] },
    currentChapterId: { type: Schema.Types.ObjectId, ref: "Chapter", default: null },
    currentUnitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null }
  },
  { timestamps: true }
);

LearnerLanguageStateSchema.index({ userId: 1, languageCode: 1 }, { unique: true });
LearnerLanguageStateSchema.index({ userId: 1, languageId: 1 }, { unique: true, sparse: true });

export type LearnerLanguageStateDocument = InferSchemaType<typeof LearnerLanguageStateSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LearnerLanguageStateModel = mongoose.model("LearnerLanguageState", LearnerLanguageStateSchema);

export default LearnerLanguageStateModel;
