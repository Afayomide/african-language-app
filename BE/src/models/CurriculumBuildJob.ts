import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  CURRICULUM_BUILD_CHAPTER_PLAN_STATUS_VALUES,
  CURRICULUM_BUILD_JOB_STATUS_VALUES,
  CURRICULUM_BUILD_STEP_KEY_VALUES,
  CURRICULUM_BUILD_STEP_STATUS_VALUES
} from "../domain/entities/CurriculumBuildJob.js";
import { LANGUAGE_VALUES, LEVEL_VALUES } from "../domain/entities/Lesson.js";

const CurriculumBuildJobStepSchema = new Schema(
  {
    key: { type: String, enum: [...CURRICULUM_BUILD_STEP_KEY_VALUES], required: true },
    status: { type: String, enum: [...CURRICULUM_BUILD_STEP_STATUS_VALUES], default: "pending", required: true },
    attempts: { type: Number, default: 0, min: 0 },
    message: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  },
  { _id: false }
);

const CurriculumBuildJobChapterPlanSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    orderIndex: { type: Number, required: true },
    status: { type: String, enum: [...CURRICULUM_BUILD_CHAPTER_PLAN_STATUS_VALUES], default: "planned", required: true },
    chapterId: { type: Schema.Types.ObjectId, ref: "Chapter", default: null }
  },
  { _id: false }
);

const CurriculumBuildJobUnitPlanSchema = new Schema(
  {
    chapterId: { type: Schema.Types.ObjectId, ref: "Chapter", required: true },
    chapterTitle: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    orderIndex: { type: Number, required: true },
    status: { type: String, enum: [...CURRICULUM_BUILD_CHAPTER_PLAN_STATUS_VALUES], default: "planned", required: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null }
  },
  { _id: false }
);

const CurriculumBuildJobLessonPlanSchema = new Schema(
  {
    chapterId: { type: Schema.Types.ObjectId, ref: "Chapter", required: true },
    chapterTitle: { type: String, required: true, trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    unitTitle: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    orderIndex: { type: Number, required: true },
    status: { type: String, enum: [...CURRICULUM_BUILD_CHAPTER_PLAN_STATUS_VALUES], default: "planned", required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", default: null }
  },
  { _id: false }
);

const CurriculumBuildJobErrorSchema = new Schema(
  {
    stepKey: { type: String, enum: [...CURRICULUM_BUILD_STEP_KEY_VALUES], default: null },
    message: { type: String, required: true },
    details: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: Date.now }
  },
  { _id: false }
);

const CurriculumBuildJobArtifactsSchema = new Schema(
  {
    memorySummary: { type: String, default: "" },
    priorChapterTitles: { type: [String], default: [] },
    priorUnitTitles: { type: [String], default: [] },
    chapterPlan: { type: [CurriculumBuildJobChapterPlanSchema], default: [] },
    unitPlan: { type: [CurriculumBuildJobUnitPlanSchema], default: [] },
    architectNotes: { type: [String], default: [] },
    lessonPlan: { type: [CurriculumBuildJobLessonPlanSchema], default: [] },
    criticSummary: { type: String, default: "" },
    criticIssues: { type: [String], default: [] },
    refinerSummary: { type: String, default: "" }
  },
  { _id: false }
);

const CurriculumBuildJobSchema = new Schema(
  {
    languageId: { type: Schema.Types.ObjectId, ref: "Language", default: null, index: true },
    language: { type: String, enum: [...LANGUAGE_VALUES], required: true, index: true },
    level: { type: String, enum: [...LEVEL_VALUES], required: true, index: true },
    requestedChapterCount: { type: Number, required: true, min: 1, max: 30 },
    topic: { type: String, default: "" },
    extraInstructions: { type: String, default: "" },
    cefrTarget: { type: String, default: "" },
    status: { type: String, enum: [...CURRICULUM_BUILD_JOB_STATUS_VALUES], default: "queued", index: true },
    currentStepKey: {
      type: String,
      enum: [...CURRICULUM_BUILD_STEP_KEY_VALUES],
      default: "architect",
      required: true,
      index: true
    },
    steps: { type: [CurriculumBuildJobStepSchema], default: [] },
    artifacts: { type: CurriculumBuildJobArtifactsSchema, default: () => ({}) },
    errors: { type: [CurriculumBuildJobErrorSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

CurriculumBuildJobSchema.index({ createdBy: 1, createdAt: -1 });
CurriculumBuildJobSchema.index({ status: 1, updatedAt: -1 });
CurriculumBuildJobSchema.index({ languageId: 1, level: 1, createdAt: -1 });
CurriculumBuildJobSchema.index({ language: 1, level: 1, createdAt: -1 });

export type CurriculumBuildJobDocument = InferSchemaType<typeof CurriculumBuildJobSchema> & {
  _id: mongoose.Types.ObjectId;
};

const CurriculumBuildJobModel = mongoose.model("CurriculumBuildJob", CurriculumBuildJobSchema);

export default CurriculumBuildJobModel;
