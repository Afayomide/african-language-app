import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { AdminVoiceAudioReviewUseCases } from "../../application/use-cases/admin/voice-artist/AdminVoiceAudioReviewUseCases.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseVoiceAudioSubmissionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseVoiceAudioSubmissionRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseUserRepository } from "../../infrastructure/db/mongoose/repositories/MongooseUserRepository.js";
import { getSearchQuery, includesSearch, paginate, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const submissionRepo = new MongooseVoiceAudioSubmissionRepository();
const useCases = new AdminVoiceAudioReviewUseCases(
  submissionRepo,
  new MongooseWordRepository(),
  new MongooseExpressionRepository(),
  new MongooseSentenceRepository(),
  new MongooseUserRepository()
);

function firstTranslation(translations: string[]) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  return String(translations[0] || "");
}

export async function listVoiceAudioSubmissions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const contentType = req.query.contentType ? String(req.query.contentType) : undefined;
  const contentId = req.query.contentId
    ? String(req.query.contentId)
    : req.query.expressionId
      ? String(req.query.expressionId)
      : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (status && !["pending", "accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  if (contentType && !["word", "expression", "sentence"].includes(contentType)) {
    return res.status(400).json({ error: "invalid content type" });
  }
  if (contentId && !mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(400).json({ error: "invalid content id" });
  }

  const submissions = await useCases.list({
    status: status as "pending" | "accepted" | "rejected" | undefined,
    contentType: (contentType || (req.query.expressionId ? "expression" : undefined)) as "word" | "expression" | "sentence" | undefined,
    contentId,
    language: tutorLanguage
  });

  const filtered = q
    ? submissions.filter((submission) =>
        [
          submission.language,
          submission.contentType,
          submission.status,
          submission.rejectionReason,
          submission.voiceArtist?.email,
          submission.content?.text,
          submission.content ? firstTranslation(submission.content.translations) : ""
        ].some((value) => includesSearch(value, q))
      )
    : submissions;
  const paginated = paginate(filtered, paginationInput);
  return res.status(200).json({ total: filtered.length, submissions: paginated.items, pagination: paginated.pagination });
}

export async function acceptVoiceAudioSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  const submission = await submissionRepo.findById(id);
  if (!submission || submission.language !== tutorLanguage) return res.status(404).json({ error: "submission not found" });

  const reviewed = await useCases.accept(id, req.user.id);
  if (!reviewed) return res.status(404).json({ error: "submission not found" });
  return res.status(200).json({ submission: reviewed });
}

export async function rejectVoiceAudioSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const { id } = req.params;
  const reason = req.body?.reason ? String(req.body.reason).trim() : "";
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  if (!reason) return res.status(400).json({ error: "reason required" });
  const submission = await submissionRepo.findById(id);
  if (!submission || submission.language !== tutorLanguage) return res.status(404).json({ error: "submission not found" });

  const reviewed = await useCases.reject(id, req.user.id, reason);
  if (!reviewed) return res.status(404).json({ error: "submission not found" });
  return res.status(200).json({ submission: reviewed });
}
