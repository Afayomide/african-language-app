import crypto from "crypto";
import type { Response } from "express";
import mongoose from "mongoose";
import { VoiceArtistAudioUseCases } from "../../application/use-cases/voice/audio/VoiceArtistAudioUseCases.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseVoiceArtistProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceArtistProfileRepository.js";
import { MongooseVoiceAudioSubmissionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceAudioSubmissionRepository.js";
import { uploadAudio } from "../../services/storage/s3.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const useCases = new VoiceArtistAudioUseCases(
  new MongooseLessonRepository(),
  new MongoosePhraseRepository(),
  new MongooseVoiceArtistProfileRepository(),
  new MongooseVoiceAudioSubmissionRepository()
);

function parseAudioUpload(audioUpload: unknown) {
  if (typeof audioUpload !== "object" || audioUpload === null) return "invalid_audio_upload";

  const payload = audioUpload as { base64?: unknown; mimeType?: unknown };
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
    return { buffer, mimeType };
  } catch {
    return "invalid_audio_upload";
  }
}

async function buildManualAudioMeta(input: {
  phraseId: string;
  mimeType: string;
  buffer: Buffer;
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
  const key = `phrases/${input.phraseId}/submissions/${crypto.randomUUID()}.${format}`;
  const url = await uploadAudio(input.buffer, key, input.mimeType);

  return {
    provider: "manual_upload",
    model: "",
    voice: "",
    locale: "",
    format,
    url,
    s3Key: key
  };
}

export async function getQueue(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  const result = await useCases.listQueuePhrases(req.user.id);
  if (!result) {
    return res.status(403).json({ error: "voice_artist_profile_inactive_or_missing" });
  }

  const filtered = q
    ? result.queue.filter((item) =>
        [
          item.phrase.text,
          item.phrase.translation,
          item.phrase.pronunciation,
          item.phrase.explanation,
          item.phrase.status,
          item.latestSubmission?.status,
          item.latestSubmission?.rejectionReason
        ].some((value) => includesSearch(value, q))
      )
    : result.queue;
  const paginated = paginate(filtered, paginationInput);
  return res.status(200).json({
    total: filtered.length,
    queue: paginated.items,
    pagination: paginated.pagination
  });
}

export async function createSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_phrase_id" });
  }

  const parsed = parseAudioUpload(req.body?.audioUpload);
  if (parsed === "invalid_audio_upload") {
    return res.status(400).json({ error: "invalid_audio_upload" });
  }
  if (parsed === "audio_too_large") {
    return res.status(400).json({ error: "audio_too_large" });
  }

  const audio = await buildManualAudioMeta({
    phraseId: id,
    mimeType: parsed.mimeType,
    buffer: parsed.buffer
  });

  const submission = await useCases.createSubmission({
    userId: req.user.id,
    phraseId: id,
    audio
  });

  if (submission === "profile_inactive") {
    return res.status(403).json({ error: "voice_artist_profile_inactive_or_missing" });
  }
  if (submission === "phrase_not_found") {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  if (submission === "phrase_out_of_scope") {
    return res.status(403).json({ error: "phrase_out_of_scope" });
  }

  return res.status(201).json({ submission });
}

export async function listOwnSubmissions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (status && !["pending", "accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }

  const result = await useCases.listOwnSubmissions(
    req.user.id,
    status as "pending" | "accepted" | "rejected" | undefined
  );

  if (!result) {
    return res.status(403).json({ error: "voice_artist_profile_inactive_or_missing" });
  }

  const filtered = q
    ? result.submissions.filter((submission) =>
        [
          submission.status,
          submission.rejectionReason,
          submission.phrase?.text,
          submission.phrase?.translation
        ].some((value) => includesSearch(value, q))
      )
    : result.submissions;
  const paginated = paginate(filtered, paginationInput);

  return res.status(200).json({
    total: filtered.length,
    submissions: paginated.items,
    pagination: paginated.pagination
  });
}
