import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UnitAiRunLessonSummarySchema = new Schema(
  {
    lessonId: { type: String, required: true },
    title: { type: String, required: true },
    phrasesGenerated: { type: Number, required: true },
    repeatedPhrasesLinked: { type: Number, required: true },
    newPhrasesSelected: { type: Number, required: true },
    reviewPhrasesSelected: { type: Number, required: true },
    phrasesDroppedFromCandidates: { type: Number, required: true },
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

const UnitSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], required: true, index: true },
    orderIndex: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["draft", "finished", "published"], default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastAiRun: { type: UnitAiRunSummarySchema, default: null },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

UnitSchema.index({ language: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });

export type UnitDocument = InferSchemaType<typeof UnitSchema> & {
  _id: mongoose.Types.ObjectId;
};

const UnitModel = mongoose.model("Unit", UnitSchema);

export default UnitModel;
