import type {
  AudioAnalysis,
  ContentAiMeta,
  ContentAudio,
  ContentExample
} from "../../../../domain/entities/Content.js";
import type { ContentImage } from "../jsonTypes.js";

/**
 * Row -> entity mappers shared by the word / expression / sentence repositories.
 *
 * These stay defensive (`String(x || "")`) for the same reason the Mongoose
 * versions were: jsonb columns default to `{}` / `[]`, so a column typed as
 * `ContentAudio` can legitimately hold an empty object at runtime. The static
 * type is a cast over the stored bytes, not a runtime guarantee.
 */

/** Replaces the Mongoose `pre("validate")` normalizeContentFields hook. */
export function normalizeContentText(value: string): { text: string; textNormalized: string } {
  const text = String(value || "").trim();
  return { text, textNormalized: text.toLowerCase() };
}

/**
 * Build a LIKE/ILIKE pattern for a user-supplied search term, escaping the
 * wildcards `%` and `_` so they are matched literally. This is the Postgres
 * counterpart of the escaped RegExp the Mongo list endpoints used.
 */
export function likePattern(term: string): string {
  return `%${String(term || "").replace(/[%_\\]/g, "\\$&")}%`;
}

export function normalizeTranslations(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function mapAudioAnalysis(value: any): AudioAnalysis | undefined {
  if (!value) return undefined;
  return {
    durationMs: value.durationMs === undefined ? undefined : Number(value.durationMs || 0),
    sampleRate: value.sampleRate === undefined ? undefined : Number(value.sampleRate || 0),
    channelCount: value.channelCount === undefined ? undefined : Number(value.channelCount || 0),
    peak: value.peak === undefined ? undefined : Number(value.peak || 0),
    rms: value.rms === undefined ? undefined : Number(value.rms || 0),
    waveformPeaks: Array.isArray(value.waveformPeaks)
      ? value.waveformPeaks.map((item: unknown) => Number(item || 0))
      : [],
    pitchContour: Array.isArray(value.pitchContour)
      ? value.pitchContour.map((point: any) => ({
          timeMs: Number(point?.timeMs || 0),
          hz: Number(point?.hz || 0),
          midi: point?.midi === undefined ? undefined : Number(point.midi || 0),
          confidence: point?.confidence === undefined ? undefined : Number(point.confidence || 0)
        }))
      : [],
    spectrogram: Array.isArray(value.spectrogram)
      ? value.spectrogram.map((frame: any) => ({
          timeMs: Number(frame?.timeMs || 0),
          bins: Array.isArray(frame?.bins)
            ? frame.bins.map((bin: any) => ({
                hz: Number(bin?.hz || 0),
                amplitude: Number(bin?.amplitude || 0)
              }))
            : []
        }))
      : []
  };
}

export function mapContentAudio(value: any): ContentAudio {
  return {
    provider: String(value?.provider || ""),
    model: String(value?.model || ""),
    voice: String(value?.voice || ""),
    locale: String(value?.locale || ""),
    format: String(value?.format || ""),
    url: String(value?.url || ""),
    s3Key: String(value?.s3Key || ""),
    referenceType: String(value?.referenceType || "none") as ContentAudio["referenceType"],
    workflowStatus: String(value?.workflowStatus || "missing") as ContentAudio["workflowStatus"],
    reviewStatus: String(value?.reviewStatus || "unreviewed") as ContentAudio["reviewStatus"],
    analysis: mapAudioAnalysis(value?.analysis)
  };
}

export function mapAiMeta(value: any): ContentAiMeta {
  return {
    generatedByAI: Boolean(value?.generatedByAI),
    model: String(value?.model || ""),
    reviewedByAdmin: Boolean(value?.reviewedByAdmin)
  };
}

export function mapExamples(value: any): ContentExample[] {
  if (!Array.isArray(value)) return [];
  return value.map((row: { original?: string; translation?: string }) => ({
    original: String(row?.original || ""),
    translation: String(row?.translation || "")
  }));
}

/** Entity-side image: null unless a url is actually present (matches Mongo behaviour). */
export function mapContentImage(value: any) {
  if (!value?.url) return null;
  return {
    imageAssetId: value.imageAssetId ? String(value.imageAssetId) : undefined,
    url: String(value.url || ""),
    thumbnailUrl: String(value.thumbnailUrl || ""),
    altText: String(value.altText || "")
  };
}

/** Storage-side image: always an object so the jsonb column never holds null. */
export function toStoredImage(value: unknown): ContentImage {
  const image = value as ContentImage | null | undefined;
  if (!image?.url) return {};
  return {
    imageAssetId: image.imageAssetId ?? null,
    url: String(image.url || ""),
    thumbnailUrl: String(image.thumbnailUrl || ""),
    altText: String(image.altText || "")
  };
}
