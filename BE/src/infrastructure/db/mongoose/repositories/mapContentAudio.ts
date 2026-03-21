import type { AudioAnalysis, ContentAudio } from "../../../../domain/entities/Content.js";

function mapAudioAnalysis(value: any): AudioAnalysis | undefined {
  if (!value) return undefined;
  return {
    durationMs: value.durationMs === undefined ? undefined : Number(value.durationMs || 0),
    sampleRate: value.sampleRate === undefined ? undefined : Number(value.sampleRate || 0),
    channelCount: value.channelCount === undefined ? undefined : Number(value.channelCount || 0),
    peak: value.peak === undefined ? undefined : Number(value.peak || 0),
    rms: value.rms === undefined ? undefined : Number(value.rms || 0),
    waveformPeaks: Array.isArray(value.waveformPeaks) ? value.waveformPeaks.map((item: unknown) => Number(item || 0)) : [],
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
