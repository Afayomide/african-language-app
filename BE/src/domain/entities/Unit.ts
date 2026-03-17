import type { Language, Level, Status } from "./Lesson.js";

export type UnitAiRunLessonSummary = {
  lessonId: string;
  title: string;
  phrasesGenerated: number;
  repeatedPhrasesLinked: number;
  newPhrasesSelected: number;
  reviewPhrasesSelected: number;
  phrasesDroppedFromCandidates: number;
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

export type UnitEntity = {
  id: string;
  _id?: string;
  title: string;
  description: string;
  language: Language;
  level: Level;
  orderIndex: number;
  status: Status;
  createdBy: string;
  lastAiRun?: UnitAiRunSummary | null;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
