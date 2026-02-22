import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorQuestionUseCases } from "../../application/use-cases/tutor/question/TutorQuestionUseCases.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
import {
  isValidQuestionType,
  parseQuestionOptions,
  parseQuestionReviewData
} from "../../interfaces/http/validators/question.validators.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";

const questionUseCases = new TutorQuestionUseCases(
  new MongooseQuestionRepository(),
  new MongooseLessonRepository(),
  new MongoosePhraseRepository()
);
const phraseRepo = new MongoosePhraseRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

export async function createQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const { lessonId, phraseId, type, promptTemplate, options, correctIndex, explanation, reviewData } = req.body ?? {};
  if (!lessonId || !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (!phraseId || !mongoose.Types.ObjectId.isValid(String(phraseId))) {
    return res.status(400).json({ error: "invalid_phrase_id" });
  }
  if (!type || !isValidQuestionType(String(type))) {
    return res.status(400).json({ error: "invalid_type" });
  }
  if (!promptTemplate || !String(promptTemplate).trim()) {
    return res.status(400).json({ error: "prompt_template_required" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor_language_not_configured" });

  let parsedOptions = parseQuestionOptions(options);
  let answerIndex = Number(correctIndex);
  let parsedReviewData: ReturnType<typeof parseQuestionReviewData> = null;
  if (String(type) === "review") {
    parsedReviewData = parseQuestionReviewData(reviewData);
    if (!parsedReviewData) {
      return res.status(400).json({ error: "invalid_review_data" });
    }
    parsedOptions = parsedReviewData.words;
    answerIndex = 0;
  } else {
    if (!parsedOptions) return res.status(400).json({ error: "invalid_options" });
    if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex >= parsedOptions.length) {
      return res.status(400).json({ error: "invalid_correct_index" });
    }
  }

  const created = await questionUseCases.create(
    {
      lessonId: String(lessonId),
      phraseId: String(phraseId),
      type: String(type) as "vocabulary" | "practice" | "listening" | "review",
      promptTemplate: String(promptTemplate).trim(),
      options: parsedOptions,
      correctIndex: answerIndex,
      reviewData: parsedReviewData || undefined,
      explanation: explanation ? String(explanation).trim() : ""
    },
    tutorLanguage as Language
  );
  if (created === "lesson_not_found") return res.status(404).json({ error: "lesson_not_found" });
  if (created === "phrase_not_found") return res.status(404).json({ error: "phrase_not_found" });

  return res.status(201).json({ question: created });
}

export async function listQuestions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor_language_not_configured" });

  const { lessonId, type, status } = req.query;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (lessonId !== undefined && !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (type !== undefined && !isValidQuestionType(String(type))) {
    return res.status(400).json({ error: "invalid_type" });
  }
  if (status !== undefined && !["draft", "finished", "published"].includes(String(status))) {
    return res.status(400).json({ error: "invalid_status" });
  }

  const listed = await questionUseCases.list(
    {
      lessonId: lessonId !== undefined ? String(lessonId) : undefined,
      type: type !== undefined ? (String(type) as "vocabulary" | "practice" | "listening" | "review") : undefined,
      status: status !== undefined ? (String(status) as "draft" | "finished" | "published") : undefined
    },
    tutorLanguage as Language
  );
  if (listed === "lesson_not_found") return res.status(404).json({ error: "lesson_not_found" });

  const questions = listed;
  const phrases = await phraseRepo.findByIds(questions.map((q) => q.phraseId));
  const phraseMap = new Map(phrases.map((p) => [p.id, p]));
  const data = questions.map((q) => ({
    ...q,
    _id: q.id,
    phraseId: phraseMap.get(q.phraseId)
      ? {
          _id: phraseMap.get(q.phraseId)?.id,
          text: phraseMap.get(q.phraseId)?.text,
          translation: phraseMap.get(q.phraseId)?.translation,
          status: phraseMap.get(q.phraseId)?.status
        }
      : q.phraseId
  }));
  const filtered = q
    ? data.filter((item) => {
        const phrase = typeof item.phraseId === "string" ? null : item.phraseId;
        return [
          item.type,
          item.status,
          item.promptTemplate,
          item.explanation,
          phrase?.text,
          phrase?.translation
        ].some((value) => includesSearch(value, q));
      })
    : data;
  const paginated = paginate(filtered, paginationInput);
  return res.status(200).json({
    total: filtered.length,
    questions: paginated.items,
    pagination: paginated.pagination
  });
}

export async function getQuestionById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor_language_not_configured" });

  const question = await questionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!question) return res.status(404).json({ error: "question_not_found" });
  const phrase = await phraseRepo.findById(question.phraseId);
  return res.status(200).json({
    question: {
      ...question,
      _id: question.id,
      phraseId: phrase
        ? {
            _id: phrase.id,
            text: phrase.text,
            translation: phrase.translation,
            status: phrase.status,
            audio: phrase.audio
          }
        : question.phraseId
    }
  });
}

export async function updateQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor_language_not_configured" });

  const question = await questionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!question) return res.status(404).json({ error: "question_not_found" });

  const { type, phraseId, promptTemplate, options, correctIndex, explanation, reviewData } = req.body ?? {};
  const update: Record<string, unknown> = {};
  const effectiveType = String(type || question.type);

  if (type !== undefined) {
    if (!isValidQuestionType(String(type))) {
      return res.status(400).json({ error: "invalid_type" });
    }
    update.type = String(type);
  }
  if (promptTemplate !== undefined) {
    if (!String(promptTemplate).trim()) {
      return res.status(400).json({ error: "prompt_template_required" });
    }
    update.promptTemplate = String(promptTemplate).trim();
  }
  if (phraseId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(phraseId))) {
      return res.status(400).json({ error: "invalid_phrase_id" });
    }
    const phrase = await phraseRepo.findById(String(phraseId));
    if (phrase && !phrase.lessonIds.includes(question.lessonId)) {
      return res.status(404).json({ error: "phrase_not_found" });
    }
    if (!phrase) return res.status(404).json({ error: "phrase_not_found" });
    update.phraseId = phrase.id;
  }

  if (effectiveType === "review") {
    if (type !== undefined && String(type) === "review" && reviewData === undefined && !question.reviewData?.sentence) {
      return res.status(400).json({ error: "invalid_review_data" });
    }
    if (reviewData !== undefined) {
      const parsedReviewData = parseQuestionReviewData(reviewData);
      if (!parsedReviewData) {
        return res.status(400).json({ error: "invalid_review_data" });
      }
      update.reviewData = parsedReviewData;
      update.options = parsedReviewData.words;
      update.correctIndex = 0;
    }
  } else {
    if (options !== undefined) {
      const parsedOptions = parseQuestionOptions(options);
      if (!parsedOptions) {
        return res.status(400).json({ error: "invalid_options" });
      }
      update.options = parsedOptions;
      if (correctIndex !== undefined) {
        const idx = Number(correctIndex);
        if (Number.isNaN(idx) || idx < 0 || idx >= parsedOptions.length) {
          return res.status(400).json({ error: "invalid_correct_index" });
        }
        update.correctIndex = idx;
      }
    } else if (correctIndex !== undefined) {
      const idx = Number(correctIndex);
      if (Number.isNaN(idx) || idx < 0 || idx >= question.options.length) {
        return res.status(400).json({ error: "invalid_correct_index" });
      }
      update.correctIndex = idx;
    }
  }

  if (explanation !== undefined) update.explanation = String(explanation).trim();

  const updated = await questionUseCases.updateInScope(
    id,
    tutorLanguage as Language,
    update
  );
  if (updated === "phrase_not_found") return res.status(404).json({ error: "phrase_not_found" });
  if (updated === "question_not_found" || !updated) return res.status(404).json({ error: "question_not_found" });
  return res.status(200).json({ question: updated });
}

export async function deleteQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor_language_not_configured" });

  const deleted = await questionUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!deleted) return res.status(404).json({ error: "question_not_found" });
  return res.status(200).json({ message: "question_deleted" });
}

export async function finishQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor_language_not_configured" });

  const finished = await questionUseCases.finishInScope(id, tutorLanguage as Language);
  if (finished === "question_not_found") return res.status(404).json({ error: "question_not_found" });
  return res.status(200).json({ question: finished });
}
