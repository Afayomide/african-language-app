import type { Response } from "express";
import { isValidId } from "../../utils/ids.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { AdminVoiceAudioReviewUseCases } from "../../application/use-cases/admin/voice-artist/AdminVoiceAudioReviewUseCases.js";
import { DrizzleWordRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleWordRepository.js";
import { DrizzleVoiceAudioSubmissionRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleVoiceAudioSubmissionRepository.js";
import { DrizzleExpressionRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleExpressionRepository.js";
import { DrizzleSentenceRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { DrizzleUserRepository } from "../../infrastructure/db/drizzle/repositories/DrizzleUserRepository.js";
import { isValidLessonLanguage } from "../../interfaces/http/validators/lesson.validators.js";
import { getSearchQuery, includesSearch, paginate, parsePaginationQuery } from "../../interfaces/http/utils/pagination.js";

const useCases = new AdminVoiceAudioReviewUseCases(
  new DrizzleVoiceAudioSubmissionRepository(),
  new DrizzleWordRepository(),
  new DrizzleExpressionRepository(),
  new DrizzleSentenceRepository(),
  new DrizzleUserRepository()
);

function firstTranslation(translations: string[]) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  return String(translations[0] || "");
}

export async function listVoiceAudioSubmissions(req: AuthRequest, res: Response) {
  const status = req.query.status ? String(req.query.status) : undefined;
  const voiceArtistUserId = req.query.voiceArtistUserId ? String(req.query.voiceArtistUserId) : undefined;
  const contentType = req.query.contentType ? String(req.query.contentType) : undefined;
  const contentId = req.query.contentId
    ? String(req.query.contentId)
    : req.query.expressionId
      ? String(req.query.expressionId)
      : undefined;
  const language = req.query.language ? String(req.query.language) : undefined;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (status && !["pending", "accepted", "rejected"].includes(status)) return res.status(400).json({ error: "invalid status" });
  if (voiceArtistUserId && !isValidId(voiceArtistUserId)) {
    return res.status(400).json({ error: "invalid voice artist user id" });
  }
  if (contentType && !["word", "expression", "sentence"].includes(contentType)) {
    return res.status(400).json({ error: "invalid content type" });
  }
  if (contentId && !isValidId(contentId)) {
    return res.status(400).json({ error: "invalid content id" });
  }
  if (language && !isValidLessonLanguage(language)) return res.status(400).json({ error: "invalid language" });

  const submissions = await useCases.list({
    status: status as "pending" | "accepted" | "rejected" | undefined,
    voiceArtistUserId,
    contentType: (contentType || (req.query.expressionId ? "expression" : undefined)) as "word" | "expression" | "sentence" | undefined,
    contentId,
    language: language as "yoruba" | "igbo" | "hausa" | "pidgin" | undefined
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
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "invalid id" });
  const submission = await useCases.accept(id, req.user.id);
  if (!submission) return res.status(404).json({ error: "submission not found" });
  return res.status(200).json({ submission });
}

export async function rejectVoiceAudioSubmission(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { id } = req.params;
  const reason = req.body?.reason ? String(req.body.reason).trim() : "";
  if (!isValidId(id)) return res.status(400).json({ error: "invalid id" });
  if (!reason) return res.status(400).json({ error: "reason required" });

  const submission = await useCases.reject(id, req.user.id, reason);
  if (!submission) return res.status(404).json({ error: "submission not found" });
  return res.status(200).json({ submission });
}
