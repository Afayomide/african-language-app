import type { AudioAnalysis, AudioPitchPoint, AudioSpectrogramFrame } from "../../../domain/entities/Content.js";

function clampArray(values: unknown[], maxSize: number) {
  return values.slice(0, maxSize);
}

export function normalizePitchContour(input: unknown): AudioPitchPoint[] {
  if (!Array.isArray(input)) return [];
  return clampArray(input, 512).flatMap((point) => {
    if (typeof point !== "object" || point === null) return [];
    const candidate = point as Record<string, unknown>;
    return [
      {
        timeMs: Number(candidate.timeMs || 0),
        hz: Number(candidate.hz || 0),
        midi: candidate.midi === undefined ? undefined : Number(candidate.midi || 0),
        confidence: candidate.confidence === undefined ? undefined : Number(candidate.confidence || 0)
      }
    ];
  });
}

export function normalizeSpectrogram(input: unknown): AudioSpectrogramFrame[] {
  if (!Array.isArray(input)) return [];
  return clampArray(input, 128).flatMap((frame) => {
    if (typeof frame !== "object" || frame === null) return [];
    const candidate = frame as Record<string, unknown>;
    const bins = Array.isArray(candidate.bins)
      ? clampArray(candidate.bins, 96).flatMap((bin) => {
          if (typeof bin !== "object" || bin === null) return [];
          const binCandidate = bin as Record<string, unknown>;
          return [
            {
              hz: Number(binCandidate.hz || 0),
              amplitude: Number(binCandidate.amplitude || 0)
            }
          ];
        })
      : [];
    return [{ timeMs: Number(candidate.timeMs || 0), bins }];
  });
}

export function normalizeAudioAnalysis(input: unknown): AudioAnalysis | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const candidate = input as Record<string, unknown>;
  return {
    durationMs: candidate.durationMs === undefined ? undefined : Number(candidate.durationMs || 0),
    sampleRate: candidate.sampleRate === undefined ? undefined : Number(candidate.sampleRate || 0),
    channelCount: candidate.channelCount === undefined ? undefined : Number(candidate.channelCount || 0),
    peak: candidate.peak === undefined ? undefined : Number(candidate.peak || 0),
    rms: candidate.rms === undefined ? undefined : Number(candidate.rms || 0),
    waveformPeaks: Array.isArray(candidate.waveformPeaks)
      ? clampArray(candidate.waveformPeaks, 256).map((value) => Number(value || 0))
      : [],
    pitchContour: normalizePitchContour(candidate.pitchContour),
    spectrogram: normalizeSpectrogram(candidate.spectrogram)
  };
}

export function parseAudioUpload(audioUpload: unknown) {
  if (audioUpload === undefined) return null;
  if (typeof audioUpload !== "object" || audioUpload === null) return "invalid_audio_upload" as const;

  const payload = audioUpload as { base64?: unknown; mimeType?: unknown; analysis?: unknown };
  const analysis = normalizeAudioAnalysis(payload.analysis);
  if (!payload.base64 || typeof payload.base64 !== "string") {
    return analysis ? { buffer: null, mimeType: "", analysis } : ("invalid_audio_upload" as const);
  }

  const dataUrlMatch = payload.base64.match(/^data:([^;]+).*?base64,(.+)$/);
  const base64Data = dataUrlMatch ? dataUrlMatch[2] : payload.base64;
  const mimeTypeFromDataUrl = dataUrlMatch ? dataUrlMatch[1] : undefined;
  const mimeType =
    typeof payload.mimeType === "string" && payload.mimeType.startsWith("audio/")
      ? payload.mimeType
      : mimeTypeFromDataUrl && mimeTypeFromDataUrl.startsWith("audio/")
        ? mimeTypeFromDataUrl
        : "audio/mpeg";

  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return "invalid_audio_upload" as const;
    if (buffer.length > 15 * 1024 * 1024) return "audio_too_large" as const;
    return { buffer, mimeType, analysis };
  } catch {
    return "invalid_audio_upload" as const;
  }
}
