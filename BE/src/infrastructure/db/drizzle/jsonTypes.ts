/**
 * Compile-time shapes for every jsonb column in the schema.
 *
 * A jsonb column is opaque to Postgres, so the ONLY place its shape is known is
 * here. Attaching these via `jsonb(...).$type<Shape>()` in schema.ts is the
 * "typed jsonb" we chose Drizzle-style over Prisma's loose `Json` type: reads of
 * `row.audio`, `row.reviewData`, etc. come back fully typed instead of `unknown`.
 *
 * Dates that lived as Mongo `Date` inside embedded documents serialize to ISO
 * strings inside jsonb, so they are typed as `string` here (top-level Date
 * columns stay real `timestamptz` columns and keep their Date type).
 */

import type {
  CurriculumBuildJobStep,
  CurriculumBuildJobArtifacts,
  CurriculumBuildJobError
} from "../../../domain/entities/CurriculumBuildJob.js";

export type ContentTypeValue = "word" | "expression" | "sentence";
export type UserRole = "admin" | "learner" | "tutor" | "voice_artist";

/* ------------------------------------------------------------------ */
/* Shared content payloads (words / expressions / sentences / proverbs) */
/* ------------------------------------------------------------------ */

export interface ContentAiMeta {
  generatedByAI: boolean;
  model: string;
  reviewedByAdmin: boolean;
}

export interface ContentExample {
  original: string;
  translation: string;
}

/** All fields optional: the column defaults to `{}` when a content item has no image. */
export interface ContentImage {
  imageAssetId?: string | null;
  url?: string;
  thumbnailUrl?: string;
  altText?: string;
}

export type AudioReferenceType = "none" | "ai_baseline" | "human_reference" | "learner_recording";
export type AudioWorkflowStatus =
  | "missing"
  | "baseline"
  | "requested"
  | "submitted"
  | "accepted"
  | "rejected";
export type AudioReviewStatus = "unreviewed" | "pending" | "accepted" | "rejected";

export interface AudioPitchPoint {
  timeMs: number;
  hz: number;
  midi?: number;
  confidence?: number;
}

export interface AudioSpectrogramBin {
  hz: number;
  amplitude: number;
}

export interface AudioSpectrogramFrame {
  timeMs: number;
  bins: AudioSpectrogramBin[];
}

/** Bulk render data — the classic keep-as-jsonb case (thousands of points/clip).
 *  Mirrors the optionality of AudioAnalysis in domain/entities/Content.ts. */
export interface AudioAnalysis {
  durationMs?: number;
  sampleRate?: number;
  channelCount?: number;
  peak?: number;
  rms?: number;
  waveformPeaks?: number[];
  pitchContour?: AudioPitchPoint[];
  spectrogram?: AudioSpectrogramFrame[];
}

export interface ContentAudio {
  provider: string;
  model: string;
  voice: string;
  locale: string;
  format: string;
  url: string;
  s3Key: string;
  referenceType?: AudioReferenceType;
  workflowStatus?: AudioWorkflowStatus;
  reviewStatus?: AudioReviewStatus;
  analysis?: AudioAnalysis;
}

export interface SentenceMeaningSegment {
  text: string;
  sourceWordIndexes: number[];
  sourceComponentIndexes: number[];
}

export interface LessonInlineProverb {
  text: string;
  translation: string;
  contextNote: string;
}

/* ------------------------------------------------------------------ */
/* Exercise questions                                                  */
/* ------------------------------------------------------------------ */

export type QuestionType =
  | "multiple-choice"
  | "fill-in-the-gap"
  | "listening"
  | "matching"
  | "speaking";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-context-response"
  | "mc-select-missing-word"
  | "fg-word-order"
  | "fg-letter-order"
  | "fg-gap-fill"
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  | "mt-match-image"
  | "mt-match-translation"
  | "ls-dictation"
  | "ls-tone-recognition"
  | "sp-pronunciation-compare";

export interface QuestionSourceRef {
  type: ContentTypeValue;
  id: string;
}

export interface QuestionReviewData {
  sentence: string;
  words: string[];
  correctOrder: number[];
  meaning: string;
  meaningSegments: SentenceMeaningSegment[];
}

export interface QuestionMatchingPair {
  pairId: string;
  contentType: ContentTypeValue | null;
  contentId: string | null;
  contentText: string;
  translationIndex: number;
  translation: string;
  image: ContentImage;
}

export interface QuestionInteractionData {
  matchingPairs: QuestionMatchingPair[];
}

/* ------------------------------------------------------------------ */
/* Language configuration                                              */
/* ------------------------------------------------------------------ */

export interface LanguageBranding {
  heroGreeting: string;
  heroSubtitle: string;
  proverbLabel: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  iconName: string;
}

export interface LanguageSpeechConfig {
  ttsLocale: string;
  sttLocale: string;
  ttsVoiceId: string;
}

export interface LanguageLearningConfig {
  scriptDirection: "ltr" | "rtl";
  usesToneMarks: boolean;
  usesDiacritics: boolean;
}

/* ------------------------------------------------------------------ */
/* Learner progress                                                    */
/* ------------------------------------------------------------------ */

export interface WeeklyActivityEntry {
  date: string;
  minutes: number;
}

export interface LessonStepProgress {
  stepKey: string;
  status: "locked" | "available" | "completed";
  score: number;
  completedAt?: string | null;
}

export interface LessonStageProgress {
  stageId: string;
  stageIndex: number;
  status: "not_started" | "in_progress" | "completed";
  completedAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* Curriculum build telemetry                                          */
/* ------------------------------------------------------------------ */

export type CurriculumJobSteps = CurriculumBuildJobStep[];
export type CurriculumJobArtifacts = CurriculumBuildJobArtifacts;
export type CurriculumJobErrors = CurriculumBuildJobError[];

/** Shared critic/refiner report shape stored on curriculum_build_artifacts. */
export interface CurriculumArtifactReport {
  ok?: boolean;
  fixed?: boolean;
  summary: string;
  issues?: string[];
  issueDetails?: Record<string, unknown>[];
  fixesApplied?: string[];
  unresolvedIssues?: string[];
}

/**
 * Unit AI run / preview-plan telemetry. These are large, internal, write-once
 * blobs read whole by the admin UI — kept loose for now; tighten from Unit.ts's
 * embedded sub-schemas later if the admin surface needs field-level types.
 */
export type UnitAiRunSummary = Record<string, unknown>;
export type UnitAiPreviewPlanSummary = Record<string, unknown>;
