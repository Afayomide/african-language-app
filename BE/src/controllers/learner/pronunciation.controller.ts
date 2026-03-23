import type { Response } from "express";
import mongoose from "mongoose";
import { AudioAnalysisService } from "../../application/services/AudioAnalysisService.js";
import { LearnerPronunciationUseCases } from "../../application/use-cases/learner/pronunciation/LearnerPronunciationUseCases.js";
import type { ContentType } from "../../domain/entities/Content.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import { normalizeAudioAnalysis, parseAudioUpload } from "../../interfaces/http/utils/audioUpload.js";
import type { AuthRequest } from "../../utils/authMiddleware.js";

const useCases = new LearnerPronunciationUseCases(
  new MongooseWordRepository(),
  new MongooseExpressionRepository(),
  new MongooseSentenceRepository()
);
const audioAnalysis = new AudioAnalysisService();

function parseContentType(value: unknown): ContentType | null {
  if (value === "word" || value === "expression" || value === "sentence") return value;
  return null;
}

export async function comparePronunciation(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const contentType = parseContentType(req.params.contentType);
  const contentId = req.params.id;
  if (!contentType) {
    return res.status(400).json({ error: "invalid content type" });
  }
  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(400).json({ error: "invalid content id" });
  }

  const parsedAudioUpload = parseAudioUpload(req.body?.audioUpload);
  if (parsedAudioUpload === "invalid_audio_upload") {
    return res.status(400).json({ error: "invalid audio upload" });
  }
  if (parsedAudioUpload === "audio_too_large") {
    return res.status(400).json({ error: "audio too large" });
  }

  let studentAnalysis = normalizeAudioAnalysis(req.body?.audioAnalysis);
  if (parsedAudioUpload?.buffer) {
    try {
      studentAnalysis = await audioAnalysis.analyzeBuffer(parsedAudioUpload.buffer);
    } catch (error) {
      console.error("Learner pronunciation analysis failed", error);
      studentAnalysis = studentAnalysis || parsedAudioUpload.analysis;
    }
  } else if (!studentAnalysis && parsedAudioUpload?.analysis) {
    studentAnalysis = parsedAudioUpload.analysis;
  }

  if (!studentAnalysis?.pitchContour?.length) {
    return res.status(400).json({ error: "student audio or analysis with pitch contour is required" });
  }

  const result = await useCases.compare({
    contentType,
    contentId,
    studentAnalysis,
    studentAudioBuffer: parsedAudioUpload?.buffer || undefined
  });

  if (result === "content_not_found") {
    return res.status(404).json({ error: "content not found" });
  }
  if (result === "reference_audio_missing") {
    return res.status(409).json({ error: "accepted tutor reference audio is required before comparison" });
  }
  // DTW tone analysis is temporarily disabled.
  // if (result === "reference_analysis_missing") {
  //   return res.status(409).json({ error: "accepted tutor reference audio is missing pitch analysis" });
  // }
  // if (result === "student_analysis_missing") {
  //   return res.status(400).json({ error: "student audio or analysis with pitch contour is required" });
  // }
  if (result === "student_audio_missing") {
    return res.status(400).json({ error: "raw student audio is required for transcript validation" });
  }
  if (typeof result === "object" && "error" in result) {
    if (result.error === "transcript_service_unavailable") {
      return res.status(503).json({
        error: "transcript validation service unavailable",
        transcriptValidation: result.transcriptValidation
      });
    }

    if (result.error === "transcript_mismatch") {
      return res.status(422).json({
        error: "spoken content did not match the target phrase closely enough",
        transcriptValidation: result.transcriptValidation
      });
    }
  }

  return res.status(200).json(result);
}
