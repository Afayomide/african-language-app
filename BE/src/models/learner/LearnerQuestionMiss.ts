import mongoose, { Schema, type InferSchemaType } from "mongoose";

const LearnerQuestionMissSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    questionId: { type: Schema.Types.ObjectId, ref: "ExerciseQuestion", required: true, index: true },
    questionType: {
      type: String,
      enum: ["multiple-choice", "fill-in-the-gap", "listening", "matching", "speaking"],
      required: true
    },
    questionSubtype: {
      type: String,
      enum: [
        "mc-select-translation",
        "mc-select-context-response",
        "mc-select-missing-word",
        "fg-word-order",
        "fg-letter-order",
        "fg-gap-fill",
        "ls-mc-select-translation",
        "ls-mc-select-missing-word",
        "ls-fg-word-order",
        "ls-fg-gap-fill",
        "mt-match-image",
        "mt-match-translation",
        "ls-dictation",
        "ls-tone-recognition",
        "sp-pronunciation-compare"
      ],
      required: true
    },
    sourceType: { type: String, enum: ["word", "expression", "sentence"], default: null },
    sourceId: { type: Schema.Types.ObjectId, default: null },
    missCount: { type: Number, default: 0, min: 0 },
    firstMissedAt: { type: Date, required: true },
    lastMissedAt: { type: Date, required: true }
  },
  { timestamps: true }
);

LearnerQuestionMissSchema.index({ userId: 1, questionId: 1 }, { unique: true });
LearnerQuestionMissSchema.index({ userId: 1, lessonId: 1, lastMissedAt: -1 });

export type LearnerQuestionMissDocument = InferSchemaType<typeof LearnerQuestionMissSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LearnerQuestionMissModel = mongoose.model("LearnerQuestionMiss", LearnerQuestionMissSchema);

export default LearnerQuestionMissModel;
