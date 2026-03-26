import type { CurriculumBuildStepKey } from "./CurriculumBuildJob.js";

export const CURRICULUM_BUILD_ARTIFACT_PHASE_VALUES = [
  "architect_plan",
  "architect_checkpoint",
  "chapter_shells",
  "unit_plan",
  "unit_checkpoint",
  "unit_shells",
  "lesson_plan",
  "lesson_checkpoint",
  "lesson_shells",
  "content_plan",
  "content_generation",
  "content_checkpoint",
  "final_review"
] as const;
export const CURRICULUM_BUILD_ARTIFACT_STATUS_VALUES = [
  "draft",
  "accepted",
  "rejected",
  "applied",
  "failed"
] as const;
export const CURRICULUM_BUILD_ARTIFACT_SCOPE_VALUES = ["job", "chapter", "unit", "lesson"] as const;

export type CurriculumBuildArtifactPhase = (typeof CURRICULUM_BUILD_ARTIFACT_PHASE_VALUES)[number];
export type CurriculumBuildArtifactStatus = (typeof CURRICULUM_BUILD_ARTIFACT_STATUS_VALUES)[number];
export type CurriculumBuildArtifactScope = (typeof CURRICULUM_BUILD_ARTIFACT_SCOPE_VALUES)[number];

export type CurriculumBuildArtifactCriticReport = {
  ok: boolean;
  summary: string;
  issues: string[];
  issueDetails?: Record<string, unknown>[];
};

export type CurriculumBuildArtifactRefinerReport = {
  fixed: boolean;
  summary: string;
  fixesApplied: string[];
  unresolvedIssues: string[];
};

export type CurriculumBuildArtifactEntity = {
  id: string;
  _id?: string;
  jobId: string;
  stepKey: CurriculumBuildStepKey;
  phaseKey: CurriculumBuildArtifactPhase;
  scopeType: CurriculumBuildArtifactScope;
  scopeId?: string | null;
  scopeTitle?: string | null;
  attempt: number;
  status: CurriculumBuildArtifactStatus;
  summary: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  critic?: CurriculumBuildArtifactCriticReport | null;
  refiner?: CurriculumBuildArtifactRefinerReport | null;
  createdAt: Date;
  updatedAt: Date;
};
