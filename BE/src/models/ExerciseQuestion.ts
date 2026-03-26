import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ExerciseQuestionSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    sourceType: { type: String, enum: ["word", "expression", "sentence"], default: null, index: true },
    sourceId: { type: Schema.Types.ObjectId, default: null, index: true },
    relatedSourceRefs: {
      type: [
        {
          type: { type: String, enum: ["word", "expression", "sentence"], required: true },
          id: { type: Schema.Types.ObjectId, required: true }
        }
      ],
      default: []
    },
    translationIndex: { type: Number, min: 0, default: 0 },
    type: {
      type: String,
      enum: ["multiple-choice", "fill-in-the-gap", "listening", "matching", "speaking"],
      required: true,
      index: true
    },
    subtype: {
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
      meaning: { type: String, default: "" },
      meaningSegments: {
        type: [
          {
            text: { type: String, required: true, trim: true },
            sourceWordIndexes: { type: [Number], default: [] },
            sourceComponentIndexes: { type: [Number], default: [] }
          }
        ],
        default: []
      }
    },
    interactionData: {
      matchingPairs: {
        type: [
          {
            pairId: { type: String, required: true, trim: true },
            contentType: { type: String, enum: ["word", "expression", "sentence"], default: null },
            contentId: { type: Schema.Types.ObjectId, default: null },
            contentText: { type: String, default: "" },
            translationIndex: { type: Number, required: true, min: 0 },
            translation: { type: String, required: true, trim: true },
            image: {
              imageAssetId: { type: Schema.Types.ObjectId, ref: "ImageAsset", default: null },
              url: { type: String, default: "" },
              thumbnailUrl: { type: String, default: "" },
              altText: { type: String, default: "" }
            }
          }
        ],
        default: []
      }
    },
    explanation: { type: String, default: "" },
    status: { type: String, enum: ["draft", "finished", "published"], default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ExerciseQuestionSchema.index({ lessonId: 1, status: 1, isDeleted: 1, createdAt: 1 });
ExerciseQuestionSchema.index({ lessonId: 1, type: 1, status: 1, isDeleted: 1, createdAt: 1 });
ExerciseQuestionSchema.index({ sourceType: 1, sourceId: 1, isDeleted: 1 });

export type ExerciseQuestionDocument = InferSchemaType<typeof ExerciseQuestionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ExerciseQuestionModel = mongoose.model("ExerciseQuestion", ExerciseQuestionSchema);

export default ExerciseQuestionModel;
