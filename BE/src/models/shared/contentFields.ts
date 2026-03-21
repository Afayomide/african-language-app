import { Schema } from "mongoose";

export const CONTENT_LANGUAGE_VALUES = ["yoruba", "igbo", "hausa"] as const;
export const CONTENT_STATUS_VALUES = ["draft", "finished", "published"] as const;
export const CONTENT_COMPONENT_TYPE_VALUES = ["word", "expression"] as const;
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

export const ContentExampleSchema = new Schema(
  {
    original: { type: String, default: "" },
    translation: { type: String, default: "" }
  },
  { _id: false }
);

export const ContentAiMetaSchema = new Schema(
  {
    generatedByAI: { type: Boolean, default: false },
    model: { type: String, default: "" },
    reviewedByAdmin: { type: Boolean, default: false }
  },
  { _id: false }
);

const AudioPitchPointSchema = new Schema(
  {
    timeMs: { type: Number, default: 0 },
    hz: { type: Number, default: 0 },
    midi: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 }
  },
  { _id: false }
);

const AudioSpectrogramBinSchema = new Schema(
  {
    hz: { type: Number, default: 0 },
    amplitude: { type: Number, default: 0 }
  },
  { _id: false }
);

const AudioSpectrogramFrameSchema = new Schema(
  {
    timeMs: { type: Number, default: 0 },
    bins: { type: [AudioSpectrogramBinSchema], default: [] }
  },
  { _id: false }
);

export const AudioAnalysisSchema = new Schema(
  {
    durationMs: { type: Number, default: 0 },
    sampleRate: { type: Number, default: 0 },
    channelCount: { type: Number, default: 0 },
    peak: { type: Number, default: 0 },
    rms: { type: Number, default: 0 },
    waveformPeaks: { type: [{ type: Number }], default: [] },
    pitchContour: { type: [AudioPitchPointSchema], default: [] },
    spectrogram: { type: [AudioSpectrogramFrameSchema], default: [] }
  },
  { _id: false }
);

export const ContentAudioSchema = new Schema(
  {
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    voice: { type: String, default: "" },
    locale: { type: String, default: "" },
    format: { type: String, default: "" },
    url: { type: String, default: "" },
    s3Key: { type: String, default: "" },
    referenceType: { type: String, enum: CONTENT_AUDIO_REFERENCE_TYPE_VALUES, default: "none" },
    workflowStatus: { type: String, enum: CONTENT_AUDIO_WORKFLOW_STATUS_VALUES, default: "missing" },
    reviewStatus: { type: String, enum: CONTENT_AUDIO_REVIEW_STATUS_VALUES, default: "unreviewed" },
    analysis: { type: AudioAnalysisSchema, default: undefined }
  },
  { _id: false }
);

export const ContentComponentSchema = new Schema(
  {
    type: { type: String, enum: CONTENT_COMPONENT_TYPE_VALUES, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    orderIndex: { type: Number, default: 0 },
    textSnapshot: { type: String, default: "" }
  },
  { _id: false }
);

export function buildBaseContentFields() {
  return {
    language: { type: String, enum: CONTENT_LANGUAGE_VALUES, required: true, index: true },
    text: { type: String, required: true, trim: true },
    textNormalized: { type: String, required: true, trim: true, index: true },
    translations: {
      type: [{ type: String, trim: true }],
      default: [],
      validate: {
        validator(value: string[]) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one translation is required"
      }
    },
    pronunciation: { type: String, default: "" },
    explanation: { type: String, default: "" },
    examples: { type: [ContentExampleSchema], default: [] },
    difficulty: { type: Number, min: 1, max: 5, default: 1 },
    aiMeta: { type: ContentAiMetaSchema, default: () => ({}) },
    audio: { type: ContentAudioSchema, default: () => ({}) },
    status: { type: String, enum: CONTENT_STATUS_VALUES, default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  };
}

export function normalizeContentFields(doc: {
  text?: string;
  textNormalized?: string;
  translations?: string[];
}) {
  const normalizedText = String(doc.text || "").trim();
  doc.text = normalizedText;
  doc.textNormalized = normalizedText.toLowerCase();
  doc.translations = Array.isArray(doc.translations)
    ? Array.from(new Set(doc.translations.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
}
