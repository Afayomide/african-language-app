import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ExerciseQuestionSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    phraseId: { type: Schema.Types.ObjectId, ref: "Phrase", required: true, index: true },
    type: {
      type: String,
      enum: ["vocabulary", "practice", "listening", "review"],
      required: true,
      index: true
    },
    promptTemplate: { type: String, required: true, trim: true, default: "What is {phrase} in English?" },
    options: { type: [String], default: [] },
    correctIndex: { type: Number, default: 0, min: 0 },
    reviewData: {
      sentence: { type: String, default: "" },
      words: { type: [String], default: [] },
      correctOrder: { type: [Number], default: [] },
      meaning: { type: String, default: "" }
    },
    explanation: { type: String, default: "" },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Supports lesson/type scoped listing and learner exercise fetches.
ExerciseQuestionSchema.index({ lessonId: 1, status: 1, isDeleted: 1, createdAt: 1 });
ExerciseQuestionSchema.index({ lessonId: 1, type: 1, status: 1, isDeleted: 1, createdAt: 1 });
ExerciseQuestionSchema.index({ phraseId: 1, isDeleted: 1 });

export type ExerciseQuestionDocument = InferSchemaType<typeof ExerciseQuestionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ExerciseQuestionModel = mongoose.model("ExerciseQuestion", ExerciseQuestionSchema);

export default ExerciseQuestionModel;
