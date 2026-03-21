import type { Language, Status } from "./Lesson.js";

export const CONTENT_TYPE_VALUES = ["word", "expression", "sentence"] as const;
export const CONTENT_COMPONENT_TYPE_VALUES = ["word", "expression"] as const;
export const CURRICULUM_ROLE_VALUES = ["introduce", "review", "practice"] as const;
export const CONTENT_AUDIO_REFERENCE_TYPE_VALUES = [
  "none",
  "ai_baseline",
  "human_reference",
  "learner_recording"
] as const;
export const CONTENT_AUDIO_WORKFLOW_STATUS_VALUES = [
  "missing",
  "baseline",
  "requested",
  "submitted",
  "accepted",
  "rejected"
] as const;
export const CONTENT_AUDIO_REVIEW_STATUS_VALUES = ["unreviewed", "pending", "accepted", "rejected"] as const;

export type ContentType = (typeof CONTENT_TYPE_VALUES)[number];
export type ContentComponentType = (typeof CONTENT_COMPONENT_TYPE_VALUES)[number];
export type CurriculumRole = (typeof CURRICULUM_ROLE_VALUES)[number];
export type ContentAudioReferenceType = (typeof CONTENT_AUDIO_REFERENCE_TYPE_VALUES)[number];
export type ContentAudioWorkflowStatus = (typeof CONTENT_AUDIO_WORKFLOW_STATUS_VALUES)[number];
export type ContentAudioReviewStatus = (typeof CONTENT_AUDIO_REVIEW_STATUS_VALUES)[number];

export type ContentExample = {
  original: string;
  translation: string;
};

export type ContentAiMeta = {
  generatedByAI: boolean;
  model: string;
  reviewedByAdmin: boolean;
};

export type AudioPitchPoint = {
  timeMs: number;
  hz: number;
  midi?: number;
  confidence?: number;
};

export type AudioSpectrogramBin = {
  hz: number;
  amplitude: number;
};

export type AudioSpectrogramFrame = {
  timeMs: number;
  bins: AudioSpectrogramBin[];
};

export type AudioAnalysis = {
  durationMs?: number;
  sampleRate?: number;
  channelCount?: number;
  peak?: number;
  rms?: number;
  waveformPeaks?: number[];
  pitchContour?: AudioPitchPoint[];
  spectrogram?: AudioSpectrogramFrame[];
};

export type ContentAudio = {
  provider: string;
  model: string;
  voice: string;
  locale: string;
  format: string;
  url: string;
  s3Key: string;
  referenceType?: ContentAudioReferenceType;
  workflowStatus?: ContentAudioWorkflowStatus;
  reviewStatus?: ContentAudioReviewStatus;
  analysis?: AudioAnalysis;
};

export type ContentComponentRef = {
  type: ContentComponentType;
  refId: string;
  orderIndex: number;
  textSnapshot?: string;
};

export type ContentBaseEntity = {
  id: string;
  _id?: string;
  language: Language;
  text: string;
  textNormalized: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  examples: ContentExample[];
  difficulty: number;
  aiMeta: ContentAiMeta;
  audio: ContentAudio;
  status: Status;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
