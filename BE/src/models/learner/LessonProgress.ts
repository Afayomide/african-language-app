import mongoose, { Schema, type InferSchemaType } from "mongoose";

const StepProgressSchema = new Schema(
  {
    stepKey: { type: String, required: true },
    status: { type: String, enum: ["locked", "available", "completed"], default: "available" },
    score: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date }
  },
  { _id: false }
);

const LessonProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    status: { type: String, enum: ["not_started", "in_progress", "completed"], default: "not_started" },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    xpEarned: { type: Number, default: 0, min: 0 },
    stepProgress: { type: [StepProgressSchema], default: [] },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

LessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
LessonProgressSchema.index({ userId: 1, status: 1, updatedAt: -1 });
LessonProgressSchema.index({ lessonId: 1, status: 1, updatedAt: -1 });

export type LessonProgressDocument = InferSchemaType<typeof LessonProgressSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LessonProgressModel = mongoose.model("LessonProgress", LessonProgressSchema);

export default LessonProgressModel;
