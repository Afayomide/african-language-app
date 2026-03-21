import mongoose, { Schema, type InferSchemaType } from "mongoose";

const LearnerContentPerformanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    contentType: { type: String, enum: ["word", "expression", "sentence"], required: true },
    contentId: { type: Schema.Types.ObjectId, required: true },
    exposureCount: { type: Number, default: 0, min: 0 },
    attemptCount: { type: Number, default: 0, min: 0 },
    correctCount: { type: Number, default: 0, min: 0 },
    wrongCount: { type: Number, default: 0, min: 0 },
    retryCount: { type: Number, default: 0, min: 0 },
    speakingFailureCount: { type: Number, default: 0, min: 0 },
    listeningFailureCount: { type: Number, default: 0, min: 0 },
    contextScenarioFailureCount: { type: Number, default: 0, min: 0 },
    lastLessonId: { type: Schema.Types.ObjectId, ref: "Lesson" },
    lastQuestionType: {
      type: String,
      enum: ["multiple-choice", "fill-in-the-gap", "listening", "matching", "speaking", null],
      default: null
    },
    lastQuestionSubtype: {
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
        "sp-pronunciation-compare",
        null
      ],
      default: null
    },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true }
  },
  { timestamps: true }
);

LearnerContentPerformanceSchema.index({ userId: 1, contentType: 1, contentId: 1 }, { unique: true });
LearnerContentPerformanceSchema.index({ userId: 1, language: 1, updatedAt: -1 });

export type LearnerContentPerformanceDocument = InferSchemaType<typeof LearnerContentPerformanceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LearnerContentPerformanceModel = mongoose.model("LearnerContentPerformance", LearnerContentPerformanceSchema);

export default LearnerContentPerformanceModel;
