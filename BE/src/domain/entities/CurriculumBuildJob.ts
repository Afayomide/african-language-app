import type { Language, Level } from "./Lesson.js";

export const CURRICULUM_BUILD_JOB_STATUS_VALUES = [
  "queued",
  "running",
  "planned",
  "completed",
  "failed",
  "cancelled"
] as const;
export const CURRICULUM_BUILD_STEP_KEY_VALUES = ["architect", "generator", "critic", "refiner"] as const;
export const CURRICULUM_BUILD_STEP_STATUS_VALUES = ["pending", "running", "completed", "failed", "skipped"] as const;
export const CURRICULUM_BUILD_CHAPTER_PLAN_STATUS_VALUES = ["planned", "created"] as const;

export type CurriculumBuildJobStatus = (typeof CURRICULUM_BUILD_JOB_STATUS_VALUES)[number];
export type CurriculumBuildStepKey = (typeof CURRICULUM_BUILD_STEP_KEY_VALUES)[number];
export type CurriculumBuildStepStatus = (typeof CURRICULUM_BUILD_STEP_STATUS_VALUES)[number];
export type CurriculumBuildChapterPlanStatus = (typeof CURRICULUM_BUILD_CHAPTER_PLAN_STATUS_VALUES)[number];

export type CurriculumBuildJobStep = {
  key: CurriculumBuildStepKey;
  status: CurriculumBuildStepStatus;
  attempts: number;
  message?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export type CurriculumBuildJobChapterPlan = {
  title: string;
  description: string;
  orderIndex: number;
  status: CurriculumBuildChapterPlanStatus;
  chapterId?: string | null;
};

export type CurriculumBuildJobUnitPlan = {
  chapterId: string;
  chapterTitle: string;
  title: string;
  description: string;
  orderIndex: number;
  status: CurriculumBuildChapterPlanStatus;
  unitId?: string | null;
};

export type CurriculumBuildJobLessonPlan = {
  chapterId: string;
  chapterTitle: string;
  unitId: string;
  unitTitle: string;
  title: string;
  description: string;
  orderIndex: number;
  status: CurriculumBuildChapterPlanStatus;
  lessonId?: string | null;
};

export type CurriculumBuildJobArtifacts = {
  memorySummary: string;
  priorChapterTitles: string[];
  priorUnitTitles: string[];
  chapterPlan: CurriculumBuildJobChapterPlan[];
  unitPlan: CurriculumBuildJobUnitPlan[];
  lessonPlan: CurriculumBuildJobLessonPlan[];
  architectNotes: string[];
  criticSummary: string;
  criticIssues: string[];
  refinerSummary: string;
};

export type CurriculumBuildJobError = {
  stepKey?: CurriculumBuildStepKey | null;
  message: string;
  details?: Record<string, unknown> | null;
  createdAt: Date;
};

export type CurriculumBuildJobEntity = {
  id: string;
  _id?: string;
  languageId?: string | null;
  language: Language;
  level: Level;
  requestedChapterCount: number;
  topic: string;
  extraInstructions: string;
  cefrTarget: string;
  status: CurriculumBuildJobStatus;
  currentStepKey: CurriculumBuildStepKey;
  steps: CurriculumBuildJobStep[];
  artifacts: CurriculumBuildJobArtifacts;
  errors: CurriculumBuildJobError[];
  createdBy: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function createDefaultCurriculumBuildJobSteps(): CurriculumBuildJobStep[] {
  return CURRICULUM_BUILD_STEP_KEY_VALUES.map((key) => ({
    key,
    status: "pending",
    attempts: 0,
    message: ""
  }));
}

export function createEmptyCurriculumBuildJobArtifacts(): CurriculumBuildJobArtifacts {
  return {
    memorySummary: "",
    priorChapterTitles: [],
    priorUnitTitles: [],
    chapterPlan: [],
    unitPlan: [],
    architectNotes: [],
    lessonPlan: [],
    criticSummary: "",
    criticIssues: [],
    refinerSummary: ""
  };
}
