import mongoose, { Schema, type InferSchemaType } from "mongoose";

const WeeklyActivitySchema = new Schema(
  {
    date: { type: Date, required: true },
    minutes: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const LearnerProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    activeLanguageId: { type: Schema.Types.ObjectId, ref: "Language", default: null, index: true },
    name: { type: String, default: "" },
    displayName: { type: String, default: "" },
    username: { type: String, default: "", trim: true, lowercase: true },
    avatarUrl: { type: String, default: "" },
    proficientLanguage: { type: String, default: "" },
    countryOfOrigin: { type: String, default: "" },
    onboardingCompleted: { type: Boolean, default: false },
    currentLanguage: { type: String, enum: ["yoruba", "igbo", "hausa"], default: "yoruba" },
    dailyGoalMinutes: { type: Number, default: 10, min: 1, max: 120 },
    totalXp: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActiveDate: { type: Date },
    completedLessonsCount: { type: Number, default: 0, min: 0 },
    weeklyActivity: { type: [WeeklyActivitySchema], default: [] },
    achievements: { type: [String], default: [] }
  },
  { timestamps: true }
);

LearnerProfileSchema.index({ currentLanguage: 1, updatedAt: -1 });
LearnerProfileSchema.index({ currentStreak: -1, totalXp: -1 });
LearnerProfileSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $type: "string", $ne: "" }
    }
  }
);

export type LearnerProfileDocument = InferSchemaType<typeof LearnerProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LearnerProfileModel = mongoose.model("LearnerProfile", LearnerProfileSchema);

export default LearnerProfileModel;
