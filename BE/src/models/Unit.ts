import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { LANGUAGE_VALUES, LEVEL_VALUES, STATUS_VALUES } from "../domain/entities/Lesson.js";

const UnitAiRunLessonSummarySchema = new Schema(
  {
    lessonId: { type: String, required: true },
    title: { type: String, required: true },
    contentGenerated: { type: Number, required: true },
    sentencesGenerated: { type: Number, required: true },
    existingContentLinked: { type: Number, required: true },
    newContentSelected: { type: Number, required: true },
    reviewContentSelected: { type: Number, required: true },
    contentDroppedFromCandidates: { type: Number, required: true },
    proverbsGenerated: { type: Number, required: true },
    questionsGenerated: { type: Number, required: true },
    blocksGenerated: { type: Number, required: true }
  },
  { _id: false }
);

const UnitAiRunSummarySchema = new Schema(
  {
    mode: { type: String, enum: ["generate", "refactor", "regenerate"], required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    requestedLessons: { type: Number, required: true },
    createdLessons: { type: Number, required: true },
    updatedLessons: { type: Number },
    clearedLessons: { type: Number },
    skippedLessons: [
      {
        reason: { type: String, required: true },
        topic: { type: String },
        title: { type: String }
      }
    ],
    lessonGenerationErrors: [
      {
        topic: { type: String },
        error: { type: String, required: true }
      }
    ],
    contentErrors: [
      {
        lessonId: { type: String },
        title: { type: String },
        error: { type: String, required: true }
      }
    ],
    lessons: { type: [UnitAiRunLessonSummarySchema], default: [] }
  },
  { _id: false }
);

const UnitAiPreviewPlanLessonSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    objectives: { type: [String], default: [] },
    conversationGoal: { type: String, default: "" },
    situations: { type: [String], default: [] },
    sentenceGoals: { type: [String], default: [] },
    focusSummary: { type: String },
    targetWords: {
      type: [
        {
          text: { type: String, required: true },
          translations: { type: [String], default: [] }
        }
      ],
      default: []
    },
    targetExpressions: {
      type: [
        {
          text: { type: String, required: true },
          translations: { type: [String], default: [] }
        }
      ],
      default: []
    },
    lessonMode: { type: String, enum: ["core", "review"] },
    sourceCoreLessonIndexes: { type: [Number], default: [] },
    reviewSourceLessonIds: { type: [String], default: [] },
    reviewAnchorSentenceIds: { type: [String], default: [] }
  },
  { _id: false }
);

const UnitAiPreviewPlanSummarySchema = new Schema(
  {
    mode: { type: String, enum: ["generate", "regenerate"], required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    requestedLessons: { type: Number, required: true },
    actualLessonCount: { type: Number, required: true },
    settings: {
      lessonCount: { type: Number, required: true },
      sentencesPerLesson: { type: Number, required: true },
      reviewContentPerLesson: { type: Number },
      proverbsPerLesson: { type: Number, required: true },
      topics: { type: [String], default: [] },
      extraInstructions: { type: String }
    },
    coreLessons: { type: [UnitAiPreviewPlanLessonSchema], default: [] },
    lessonSequence: { type: [UnitAiPreviewPlanLessonSchema], default: [] }
  },
  { _id: false }
);

const UnitSchema = new Schema(
  {
    chapterId: { type: Schema.Types.ObjectId, ref: "Chapter", default: null, index: true },
    languageId: { type: Schema.Types.ObjectId, ref: "Language", default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    language: { type: String, enum: [...LANGUAGE_VALUES], required: true, index: true },
    level: { type: String, enum: [...LEVEL_VALUES], required: true, index: true },
    kind: { type: String, enum: ["core", "review"], default: "core", index: true },
    reviewStyle: { type: String, enum: ["none", "star", "gym"], default: "none" },
    reviewSourceUnitIds: { type: [Schema.Types.ObjectId], ref: "Unit", default: [] },
    orderIndex: { type: Number, default: 0, index: true },
    status: { type: String, enum: [...STATUS_VALUES], default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastAiRun: { type: UnitAiRunSummarySchema, default: null },
    lastAiPreviewPlan: { type: UnitAiPreviewPlanSummarySchema, default: null },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

UnitSchema.index({ chapterId: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });
UnitSchema.index({ language: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });
UnitSchema.index({ languageId: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });

export type UnitDocument = InferSchemaType<typeof UnitSchema> & {
  _id: mongoose.Types.ObjectId;
};

const UnitModel = mongoose.model("Unit", UnitSchema);

export default UnitModel;
