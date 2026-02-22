import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminVoiceAudioReviewUseCases } from "../../application/use-cases/admin/voice-artist/AdminVoiceAudioReviewUseCases.js";
import { MongooseVoiceAudioSubmissionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceAudioSubmissionRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const useCases = new AdminVoiceAudioReviewUseCases(
  new MongooseVoiceAudioSubmissionRepository(),
  new MongoosePhraseRepository(),
  new MongooseUserRepository()
);

export async function listVoiceAudioSubmissions(req: AuthRequest, res: Response) {
  const status = req.query.status ? String(req.query.status) : undefined;
  const voiceArtistUserId = req.query.voiceArtistUserId ? String(req.query.voiceArtistUserId) : undefined;
  const phraseId = req.query.phraseId ? String(req.query.phraseId) : undefined;
  const language = req.query.language ? String(req.query.language) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (status && !["pending", "accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }
  if (voiceArtistUserId && !mongoose.Types.ObjectId.isValid(voiceArtistUserId)) {
    return res.status(400).json({ error: "invalid_voice_artist_user_id" });
  }
  if (phraseId && !mongoose.Types.ObjectId.isValid(phraseId)) {
    return res.status(400).json({ error: "invalid_phrase_id" });
  }
  if (language && !isValidLessonLanguage(language)) {
    return res.status(400).json({ error: "invalid_language" });
  }

  const submissions = await useCases.list({
    status: status as "pending" | "accepted" | "rejected" | undefined,
    voiceArtistUserId,
    phraseId,
    language: language as "yoruba" | "igbo" | "hausa" | undefined
  });

  const filtered = q
    ? submissions.filter((submission) =>
        [
          submission.language,
          submission.status,
          submission.rejectionReason,
          submission.voiceArtist?.email,
          submission.phrase?.text,
          submission.phrase?.translation
        ].some((value) => includesSearch(value, q))
      )
    : submissions;
  const paginated = paginate(filtered, paginationInput);

  return res.status(200).json({
    total: filtered.length,
    submissions: paginated.items,
    pagination: paginated.pagination
  });
}

export async function acceptVoiceAudioSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const submission = await useCases.accept(id, req.user.id);
  if (!submission) {
    return res.status(404).json({ error: "submission_not_found" });
  }

  return res.status(200).json({ submission });
}

export async function rejectVoiceAudioSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  const reason = req.body?.reason ? String(req.body.reason).trim() : "";

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }
  if (!reason) {
    return res.status(400).json({ error: "reason_required" });
  }

  const submission = await useCases.reject(id, req.user.id, reason);
  if (!submission) {
    return res.status(404).json({ error: "submission_not_found" });
  }

  return res.status(200).json({ submission });
}
