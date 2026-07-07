import type { Language, Level, Status } from "./Lesson.js";

export type UnitKind = "core" | "review";
export type UnitReviewStyle = "none" | "star" | "gym";

export type UnitAiRunLessonSummary = {
  lessonId: string;
  title: string;
  contentGenerated: number;
  sentencesGenerated: number;
  existingContentLinked: number;
  newContentSelected: number;
  reviewContentSelected: number;
  contentDroppedFromCandidates: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
};

export type UnitAiRunSummary = {
  mode: "generate" | "refactor" | "regenerate";
  createdBy: string;
  createdAt: Date;
  requestedLessons: number;
  createdLessons: number;
  updatedLessons?: number;
  clearedLessons?: number;
  skippedLessons: Array<{ reason: string; topic?: string; title?: string }>;
  lessonGenerationErrors: Array<{ topic?: string; error: string }>;
  contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
  lessons: UnitAiRunLessonSummary[];
};

export type UnitAiPreviewPlanLesson = {
  title: string;
  description?: string;
  objectives: string[];
  conversationGoal: string;
  situations: string[];
  sentenceGoals: string[];
  focusSummary?: string;
  targetWords?: Array<{ text: string; translations?: string[] }>;
  targetExpressions?: Array<{ text: string; translations?: string[] }>;
  lessonMode?: "core" | "review";
  sourceCoreLessonIndexes?: number[];
  reviewSourceLessonIds?: string[];
  reviewAnchorSentenceIds?: string[];
};

export type UnitAiPreviewPlanSummary = {
  mode: "generate" | "regenerate";
  createdBy: string;
  createdAt: Date;
  requestedLessons: number;
  actualLessonCount: number;
  settings: {
    lessonCount: number;
    sentencesPerLesson: number;
    reviewContentPerLesson?: number;
    proverbsPerLesson: number;
    topics?: string[];
    extraInstructions?: string;
  };
  coreLessons: UnitAiPreviewPlanLesson[];
  lessonSequence: UnitAiPreviewPlanLesson[];
};

export type UnitEntity = {
  id: string;
  _id?: string;
  languageId?: string | null;
  chapterId?: string | null;
  title: string;
  description: string;
  language: Language;
  level: Level;
  kind: UnitKind;
  reviewStyle: UnitReviewStyle;
  reviewSourceUnitIds: string[];
  orderIndex: number;
  status: Status;
  createdBy: string;
  lastAiRun?: UnitAiRunSummary | null;
  lastAiPreviewPlan?: UnitAiPreviewPlanSummary | null;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
