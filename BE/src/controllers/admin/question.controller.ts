import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminQuestionUseCases } from "../../application/use-cases/admin/question/AdminQuestionUseCases.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
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

const questionUseCases = new AdminQuestionUseCases(
  new MongooseQuestionRepository(),
  new MongooseLessonRepository(),
  new MongoosePhraseRepository()
);
const phraseRepo = new MongoosePhraseRepository();


export async function createQuestion(req: Request, res: Response) {
  const { lessonId, phraseId, type, promptTemplate, options, correctIndex, explanation, reviewData } = req.body ?? {};

  if (!lessonId || !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid_lesson_id" });
  }
  if (!type || !isValidQuestionType(String(type))) {
    return res.status(400).json({ error: "invalid_type" });
  }
  if (!phraseId || !mongoose.Types.ObjectId.isValid(String(phraseId))) {
    return res.status(400).json({ error: "invalid_phrase_id" });
  }
  if (!promptTemplate || !String(promptTemplate).trim()) {
    return res.status(400).json({ error: "prompt_template_required" });
  }

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
    if (!parsedOptions) {
      return res.status(400).json({ error: "invalid_options" });
    }
    if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex >= parsedOptions.length) {
      return res.status(400).json({ error: "invalid_correct_index" });
    }
  }

  const created = await questionUseCases.create({
    lessonId: String(lessonId),
    phraseId: String(phraseId),
    type: String(type) as "vocabulary" | "practice" | "listening" | "review",
    promptTemplate: String(promptTemplate).trim(),
    options: parsedOptions,
    correctIndex: answerIndex,
    reviewData: parsedReviewData || undefined,
    explanation: explanation ? String(explanation).trim() : ""
  });
  if (created === "lesson_not_found") {
    return res.status(404).json({ error: "lesson_not_found" });
  }
  if (created === "phrase_not_found") {
    return res.status(404).json({ error: "phrase_not_found" });
  }
  if (created === "phrase_not_in_lesson") {
    return res.status(400).json({ error: "phrase_not_in_lesson" });
  }
  return res.status(201).json({ question: created });
}

export async function listQuestions(req: Request, res: Response) {
  const { lessonId, type, status } = req.query;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (lessonId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(lessonId))) {
      return res.status(400).json({ error: "invalid_lesson_id" });
    }
  }
  if (type !== undefined) {
    if (!isValidQuestionType(String(type))) {
      return res.status(400).json({ error: "invalid_type" });
    }
  }
  if (status !== undefined) {
    if (!["draft", "finished", "published"].includes(String(status))) {
      return res.status(400).json({ error: "invalid_status" });
    }
  }

  const questions = await questionUseCases.list({
    lessonId: lessonId !== undefined ? String(lessonId) : undefined,
    type: type !== undefined ? (String(type) as "vocabulary" | "practice" | "listening" | "review") : undefined,
    status: status !== undefined ? (String(status) as "draft" | "finished" | "published") : undefined
  });
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

export async function getQuestionById(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const question = await questionUseCases.getById(id);
  if (!question) {
    return res.status(404).json({ error: "question_not_found" });
  }
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

export async function updateQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const { type, phraseId, promptTemplate, options, correctIndex, explanation, reviewData } = req.body ?? {};
  const update: Record<string, unknown> = {};
  const currentQuestion = await questionUseCases.getById(id);
  if (!currentQuestion) {
    return res.status(404).json({ error: "question_not_found" });
  }
  const effectiveType = String(type || currentQuestion.type);

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
    if (!phrase) {
      return res.status(404).json({ error: "phrase_not_found" });
    }
    update.phraseId = phrase.id;
  }
  if (effectiveType === "review") {
    if (type !== undefined && String(type) === "review" && reviewData === undefined && !currentQuestion.reviewData?.sentence) {
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
      if (Number.isNaN(idx) || idx < 0 || idx >= (currentQuestion.options || []).length) {
        return res.status(400).json({ error: "invalid_correct_index" });
      }
      update.correctIndex = idx;
    }
  }

  if (explanation !== undefined) {
    update.explanation = String(explanation).trim();
  }

  const question = await questionUseCases.update(id, update);
  if (!question) {
    return res.status(404).json({ error: "question_not_found" });
  }

  return res.status(200).json({ question });
}

export async function deleteQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const question = await questionUseCases.delete(id);
  if (!question) {
    return res.status(404).json({ error: "question_not_found" });
  }

  return res.status(200).json({ message: "question_deleted" });
}

export async function publishQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  const result = await questionUseCases.publish(id);
  if (result === "question_not_found") {
    return res.status(404).json({ error: "question_not_found" });
  }
  if (result === "linked_phrase_must_be_published") {
    return res.status(400).json({ error: "linked_phrase_must_be_published" });
  }
  if (result === "question_not_finished") {
    return res.status(400).json({ error: "question_not_finished" });
  }
  return res.status(200).json({ question: result });
}
