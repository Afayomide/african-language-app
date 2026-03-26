import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  CURRICULUM_BUILD_ARTIFACT_PHASE_VALUES,
  CURRICULUM_BUILD_ARTIFACT_SCOPE_VALUES,
  CURRICULUM_BUILD_ARTIFACT_STATUS_VALUES
} from "../domain/entities/CurriculumBuildArtifact.js";
import { CURRICULUM_BUILD_STEP_KEY_VALUES } from "../domain/entities/CurriculumBuildJob.js";

const CurriculumBuildArtifactReportSchema = new Schema(
  {
    ok: { type: Boolean, default: undefined },
    fixed: { type: Boolean, default: undefined },
    summary: { type: String, default: "" },
    issues: { type: [String], default: [] },
    issueDetails: { type: [Schema.Types.Mixed], default: [] },
    fixesApplied: { type: [String], default: [] },
    unresolvedIssues: { type: [String], default: [] }
  },
  { _id: false }
);

const CurriculumBuildArtifactSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "CurriculumBuildJob", required: true, index: true },
    stepKey: { type: String, enum: [...CURRICULUM_BUILD_STEP_KEY_VALUES], required: true, index: true },
    phaseKey: { type: String, enum: [...CURRICULUM_BUILD_ARTIFACT_PHASE_VALUES], required: true, index: true },
    scopeType: { type: String, enum: [...CURRICULUM_BUILD_ARTIFACT_SCOPE_VALUES], required: true, index: true },
    scopeId: { type: String, default: null, index: true },
    scopeTitle: { type: String, default: null },
    attempt: { type: Number, required: true, min: 1 },
    status: { type: String, enum: [...CURRICULUM_BUILD_ARTIFACT_STATUS_VALUES], required: true, index: true },
    summary: { type: String, default: "" },
    input: { type: Schema.Types.Mixed, default: null },
    output: { type: Schema.Types.Mixed, default: null },
    critic: { type: CurriculumBuildArtifactReportSchema, default: null },
    refiner: { type: CurriculumBuildArtifactReportSchema, default: null }
  },
  { timestamps: true }
);

CurriculumBuildArtifactSchema.index({ jobId: 1, createdAt: 1 });
CurriculumBuildArtifactSchema.index({ jobId: 1, phaseKey: 1, scopeId: 1, attempt: 1 });

export type CurriculumBuildArtifactDocument = InferSchemaType<typeof CurriculumBuildArtifactSchema> & {
  _id: mongoose.Types.ObjectId;
};

const CurriculumBuildArtifactModel = mongoose.model("CurriculumBuildArtifact", CurriculumBuildArtifactSchema);

export default CurriculumBuildArtifactModel;
