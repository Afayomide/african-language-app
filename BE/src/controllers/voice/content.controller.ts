import crypto from "crypto";
import type { Response } from "express";
import mongoose from "mongoose";
import { AudioAnalysisService } from "../../application/services/AudioAnalysisService.js";
import { VoiceArtistAudioUseCases } from "../../application/use-cases/voice/audio/VoiceArtistAudioUseCases.js";
import type { AudioAnalysis, AudioPitchPoint, AudioSpectrogramFrame, ContentType } from "../../domain/entities/Content.js";
import { MongooseChapterRepository } from "../../infrastructure/db/mongoose/repositories/MongooseChapterRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseLessonContentItemRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonContentItemRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseUnitRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUnitRepository.js";
import { MongooseVoiceArtistProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceArtistProfileRepository.js";
import { MongooseVoiceAudioSubmissionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceAudioSubmissionRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { uploadAudio } from "../../services/storage/s3.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { getSearchQuery, includesSearch, paginate, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const useCases = new VoiceArtistAudioUseCases(
  new MongooseLessonRepository(),
  new MongooseUnitRepository(),
  new MongooseChapterRepository(),
  new MongooseLessonContentItemRepository(),
  new MongooseWordRepository(),
  new MongooseExpressionRepository(),
  new MongooseSentenceRepository(),
  new MongooseVoiceArtistProfileRepository(),
  new MongooseVoiceAudioSubmissionRepository()
);
const audioAnalysisService = new AudioAnalysisService();

function pickTranslation(translations: string[]) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  return String(translations[0] || "");
}

function parseContentType(value: unknown): ContentType | null {
  if (value === "word" || value === "expression" || value === "sentence") return value;
  return null;
}

function normalizePitchContour(input: unknown): AudioPitchPoint[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 512).flatMap((point) => {
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

function normalizeSpectrogram(input: unknown): AudioSpectrogramFrame[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 128).flatMap((frame) => {
    if (typeof frame !== "object" || frame === null) return [];
    const candidate = frame as Record<string, unknown>;
    const bins = Array.isArray(candidate.bins)
      ? candidate.bins.slice(0, 96).flatMap((bin) => {
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

function normalizeAudioAnalysis(input: unknown): AudioAnalysis | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const candidate = input as Record<string, unknown>;
  return {
    durationMs: candidate.durationMs === undefined ? undefined : Number(candidate.durationMs || 0),
    sampleRate: candidate.sampleRate === undefined ? undefined : Number(candidate.sampleRate || 0),
    channelCount: candidate.channelCount === undefined ? undefined : Number(candidate.channelCount || 0),
    peak: candidate.peak === undefined ? undefined : Number(candidate.peak || 0),
    rms: candidate.rms === undefined ? undefined : Number(candidate.rms || 0),
    waveformPeaks: Array.isArray(candidate.waveformPeaks)
      ? candidate.waveformPeaks.slice(0, 256).map((value) => Number(value || 0))
      : [],
    pitchContour: normalizePitchContour(candidate.pitchContour),
    spectrogram: normalizeSpectrogram(candidate.spectrogram)
  };
}

function parseAudioUpload(audioUpload: unknown) {
  if (typeof audioUpload !== "object" || audioUpload === null) return "invalid_audio_upload";

  const payload = audioUpload as { base64?: unknown; mimeType?: unknown; analysis?: unknown };
  if (!payload.base64 || typeof payload.base64 !== "string") return "invalid_audio_upload";

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
    if (!buffer.length) return "invalid_audio_upload";
    if (buffer.length > 15 * 1024 * 1024) return "audio_too_large";
    return { buffer, mimeType, analysis: normalizeAudioAnalysis(payload.analysis) };
  } catch {
    return "invalid_audio_upload";
  }
}

async function buildManualAudioMeta(input: {
  contentType: ContentType;
  contentId: string;
  mimeType: string;
  buffer: Buffer;
  analysis?: AudioAnalysis;
}) {
  const extensionByMime: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac"
  };

  const format = extensionByMime[input.mimeType] || "mp3";
  const key = `content/${input.contentType}/${input.contentId}/submissions/${crypto.randomUUID()}.${format}`;
  const url = await uploadAudio(input.buffer, key, input.mimeType);
  let analysis = input.analysis;
  try {
    analysis = await audioAnalysisService.analyzeBuffer(input.buffer);
  } catch (error) {
    console.error("Voice submission analysis failed", error);
  }

  return {
    provider: "manual_upload",
    model: "",
    voice: "",
    locale: "",
    format,
    url,
    s3Key: key,
    referenceType: "human_reference" as const,
    workflowStatus: "submitted" as const,
    reviewStatus: "pending" as const,
    analysis
  };
}

export async function getQueue(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  const result = await useCases.listQueueContent(req.user.id);
  if (!result) return res.status(403).json({ error: "voice artist profile inactive or missing" });

  const filtered = q
    ? result.queue.filter((item) =>
        [
          item.contentType,
          item.content.text,
          pickTranslation(item.content.translations),
          item.content.pronunciation,
          item.content.explanation,
          item.content.status,
          item.latestSubmission?.status,
          item.latestSubmission?.rejectionReason
        ].some((value) => includesSearch(value, q))
      )
    : result.queue;
  const paginated = paginate(filtered, paginationInput);
  return res.status(200).json({ total: filtered.length, queue: paginated.items, pagination: paginated.pagination });
}

export async function createSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  const contentType = parseContentType(req.params.contentType) || "expression";
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid content id" });

  const parsed = parseAudioUpload(req.body?.audioUpload);
  if (parsed === "invalid_audio_upload") return res.status(400).json({ error: "invalid audio upload" });
  if (parsed === "audio_too_large") return res.status(400).json({ error: "audio too large" });

  const audio = await buildManualAudioMeta({
    contentType,
    contentId: id,
    mimeType: parsed.mimeType,
    buffer: parsed.buffer,
    analysis: parsed.analysis
  });
  if (!audio.analysis?.pitchContour?.length) {
    return res.status(400).json({ error: "audio analysis unavailable for this recording" });
  }
  const submission = await useCases.createSubmission({ userId: req.user.id, contentType, contentId: id, audio });

  if (submission === "profile_inactive") return res.status(403).json({ error: "voice artist profile inactive or missing" });
  if (submission === "content_not_found") return res.status(404).json({ error: "content not found" });
  if (submission === "content_out_of_scope") return res.status(403).json({ error: "content out of scope" });

  return res.status(201).json({ submission });
}

export async function listOwnSubmissions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (status && !["pending", "accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }

  const result = await useCases.listOwnSubmissions(req.user.id, status as "pending" | "accepted" | "rejected" | undefined);
  if (!result) return res.status(403).json({ error: "voice artist profile inactive or missing" });

  const filtered = q
    ? result.submissions.filter((submission) =>
        [
          submission.status,
          submission.rejectionReason,
          submission.contentType,
          submission.content?.text,
          submission.content ? pickTranslation(submission.content.translations) : ""
        ].some((value) => includesSearch(value, q))
      )
    : result.submissions;
  const paginated = paginate(filtered, paginationInput);

  return res.status(200).json({ total: filtered.length, submissions: paginated.items, pagination: paginated.pagination });
}
