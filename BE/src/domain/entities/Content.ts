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
  /**
   * What this component means HERE, when the shared word row cannot say it.
   *
   * `textSnapshot` already stores the spelling per occurrence; this does the same for
   * meaning. Needed because a spelling can be two unrelated words: `sí` is "to/towards"
   * in `Mo ń lọ sí ọjà` but the negative existential in `Bàbá ò sí ní ilé`, and both
   * point at the one `sí` word row whose translations[0] is "to".
   *
   * Undefined means "use the word row's translation", which is every existing component.
   */
  gloss?: string;
  /**
   * Sentence components that are expressions only: what each of the expression's own words
   * means in THIS sentence, in the expression's component order. An empty slot falls back
   * to the expression component's `gloss`.
   */
  partGlosses?: string[];
};

export type ContentBaseEntity = {
  id: string;
  _id?: string;
  languageId?: string | null;
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
