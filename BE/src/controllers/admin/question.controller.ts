import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminQuestionUseCases } from "../../application/use-cases/admin/question/AdminQuestionUseCases.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseImageAssetRepository } from "../../infrastructure/db/mongoose/repositories/MongooseImageAssetRepository.js";
import { MongoosePhraseImageLinkRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseImageLinkRepository.js";
import type { QuestionType, QuestionSubtype } from "../../domain/entities/Question.js";
import {
  isManuallySupportedQuestionSubtype,
  parseQuestionMatchingPairs,
  isValidQuestionSubtype,
  isValidQuestionType,
  parseQuestionOptions,
  parseQuestionReviewData,
  subtypeMatchesType,
  subtypeUsesMatching,
  subtypeRequiresReviewData,
  subtypeUsesChoiceOptions,
  subtypeUsesWordOrder
} from "../../interfaces/http/validators/question.validators.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";
import { buildMatchingInteractionData } from "../shared/questionMatching.js";

const questionUseCases = new AdminQuestionUseCases(
  new MongooseQuestionRepository(),
  new MongooseLessonRepository(),
  new MongoosePhraseRepository()
);
const phraseRepo = new MongoosePhraseRepository();
const imageAssetRepo = new MongooseImageAssetRepository();
const phraseImageLinkRepo = new MongoosePhraseImageLinkRepository();

function getSelectedTranslation(translations: string[], index: number) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  if (Number.isInteger(index) && index >= 0 && index < translations.length) {
    return String(translations[index] || "");
  }
  return String(translations[0] || "");
}

export async function createQuestion(req: Request, res: Response) {
  const {
    lessonId,
    phraseId,
    translationIndex,
    type,
    subtype,
    promptTemplate,
    options,
    correctIndex,
    explanation,
    reviewData,
    interactionData
  } = req.body ?? {};

  if (!lessonId || !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (!type || !isValidQuestionType(String(type))) {
    return res.status(400).json({ error: "invalid type" });
  }
  if (!subtype || !isValidQuestionSubtype(String(subtype))) {
    return res.status(400).json({ error: "invalid subtype" });
  }
  if (!isManuallySupportedQuestionSubtype(String(subtype))) {
    return res.status(400).json({ error: "This question subtype is not supported in the learner app yet." });
  }
  if (!subtypeMatchesType(String(type), String(subtype))) {
    return res.status(400).json({ error: "Question type and subtype do not match." });
  }
  if (!subtypeUsesMatching(String(subtype)) && (!phraseId || !mongoose.Types.ObjectId.isValid(String(phraseId)))) {
    return res.status(400).json({ error: "invalid phrase id" });
  }
  if (!promptTemplate || !String(promptTemplate).trim()) {
    return res.status(400).json({ error: "prompt template required" });
  }
  const parsedTranslationIndex = Number(translationIndex ?? 0);
  if (!Number.isInteger(parsedTranslationIndex) || parsedTranslationIndex < 0) {
    return res.status(400).json({ error: "invalid translation index" });
  }

  let parsedOptions = parseQuestionOptions(options);
  let answerIndex = Number(correctIndex);
  let parsedReviewData: ReturnType<typeof parseQuestionReviewData> = null;
  let parsedInteractionData: Awaited<ReturnType<typeof buildMatchingInteractionData>> | null = null;
  if (subtypeRequiresReviewData(String(subtype))) {
    parsedReviewData = parseQuestionReviewData(reviewData);
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
    }
  }

  if (subtypeUsesMatching(String(subtype))) {
    const parsedMatchingPairs = parseQuestionMatchingPairs(interactionData, String(subtype));
    if (!parsedMatchingPairs) {
      return res.status(400).json({ error: "This matching question requires at least two valid phrase pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: String(subtype),
      lessonId: String(lessonId),
      phrases: phraseRepo,
      phraseImageLinks: phraseImageLinkRepo,
      imageAssets: imageAssetRepo
    });
    if (parsedInteractionData === "phrase_not_found") {
      return res.status(404).json({ error: "phrase not found" });
    }
    if (parsedInteractionData === "invalid_translation_index") {
      return res.status(400).json({ error: "invalid translation index" });
    }
    if (parsedInteractionData === "matching_image_required") {
      return res.status(400).json({ error: "Each image matching pair must have a linked image." });
    }
    if (parsedInteractionData === "matching_pairs_required") {
      return res.status(400).json({ error: "This matching question requires at least two valid phrase pairs." });
    }
    parsedOptions = [];
    answerIndex = 0;
  } else if (subtypeUsesWordOrder(String(subtype))) {
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This word order question requires valid review data." });
    }
    parsedOptions = parsedReviewData.words;
    answerIndex = 0;
  } else if (subtypeUsesChoiceOptions(String(subtype))) {
    if (!parsedOptions) {
      return res.status(400).json({ error: "This question subtype requires answer options." });
    }
    if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex >= parsedOptions.length) {
      return res.status(400).json({ error: "invalid correct index" });
    }
  } else {
    return res.status(400).json({ error: "This question subtype is not supported in the learner app yet." });
  }

  const created = await questionUseCases.create({
    lessonId: String(lessonId),
    phraseId: parsedInteractionData ? parsedInteractionData.phraseId : String(phraseId),
    relatedPhraseIds: parsedInteractionData ? parsedInteractionData.relatedPhraseIds : [],
    translationIndex: parsedInteractionData ? parsedInteractionData.translationIndex : parsedTranslationIndex,
    type: String(type) as QuestionType,
    subtype: String(subtype) as QuestionSubtype,
    promptTemplate: String(promptTemplate).trim(),
    options: parsedOptions,
    correctIndex: answerIndex,
    reviewData: parsedReviewData || undefined,
    interactionData: parsedInteractionData ? parsedInteractionData.interactionData : undefined,
    explanation: explanation ? String(explanation).trim() : ""
  });
  if (created === "cannot_add_draft_to_published_lesson") {
    return res.status(400).json({ error: "cannot add draft to published lesson" });
  }
  if (created === "lesson_not_found") {
    return res.status(404).json({ error: "lesson not found" });
  }
  if (created === "phrase_not_found") {
    return res.status(404).json({ error: "phrase not found" });
  }
  if (created === "phrase_not_in_lesson") {
    return res.status(400).json({ error: "phrase not in lesson" });
  }
  if (created === "invalid_translation_index") {
    return res.status(400).json({ error: "invalid translation index" });
  }
  return res.status(201).json({ question: created });
}

export async function listQuestions(req: Request, res: Response) {
  const { lessonId, type, subtype, status } = req.query;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);

  if (lessonId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(lessonId))) {
      return res.status(400).json({ error: "invalid lesson id" });
    }
  }
  if (type !== undefined) {
    if (!isValidQuestionType(String(type))) {
      return res.status(400).json({ error: "invalid type" });
    }
  }
  if (subtype !== undefined) {
    if (!isValidQuestionSubtype(String(subtype))) {
      return res.status(400).json({ error: "invalid subtype" });
    }
  }
  if (status !== undefined) {
    if (!["draft", "finished", "published"].includes(String(status))) {
      return res.status(400).json({ error: "invalid status" });
    }
  }

  const questions = await questionUseCases.list({
    lessonId: lessonId !== undefined ? String(lessonId) : undefined,
    type: type !== undefined ? (String(type) as QuestionType) : undefined,
    subtype: subtype !== undefined ? (String(subtype) as QuestionSubtype) : undefined,
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
          translations: phraseMap.get(q.phraseId)?.translations || [],
          selectedTranslation: getSelectedTranslation(
            phraseMap.get(q.phraseId)?.translations || [],
            q.translationIndex
          ),
          selectedTranslationIndex: q.translationIndex,
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
          phrase?.selectedTranslation
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
    return res.status(400).json({ error: "invalid id" });
  }

  const question = await questionUseCases.getById(id);
  if (!question) {
    return res.status(404).json({ error: "question not found" });
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
            translations: phrase.translations,
            selectedTranslation: getSelectedTranslation(phrase.translations, question.translationIndex),
            selectedTranslationIndex: question.translationIndex,
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
    return res.status(400).json({ error: "invalid id" });
  }

  const { type, subtype, phraseId, translationIndex, promptTemplate, options, correctIndex, explanation, reviewData, interactionData } = req.body ?? {};
  const update: Record<string, unknown> = {};
  const currentQuestion = await questionUseCases.getById(id);
  if (!currentQuestion) {
    return res.status(404).json({ error: "question not found" });
  }
  const effectiveType = String(type || currentQuestion.type);
  const effectiveSubtype = String(subtype || currentQuestion.subtype);

  if (type !== undefined) {
    if (!isValidQuestionType(String(type))) {
      return res.status(400).json({ error: "invalid type" });
    }
    update.type = String(type) as QuestionType;
  }
  if (subtype !== undefined) {
    if (!isValidQuestionSubtype(String(subtype))) {
      return res.status(400).json({ error: "invalid subtype" });
    }
    if (!isManuallySupportedQuestionSubtype(String(subtype))) {
      return res.status(400).json({ error: "This question subtype is not supported in the learner app yet." });
    }
    update.subtype = String(subtype) as QuestionSubtype;
  }
  if (!subtypeMatchesType(effectiveType, effectiveSubtype)) {
    return res.status(400).json({ error: "Question type and subtype do not match." });
  }
  if (promptTemplate !== undefined) {
    if (!String(promptTemplate).trim()) {
      return res.status(400).json({ error: "prompt template required" });
    }
    update.promptTemplate = String(promptTemplate).trim();
  }
  let targetPhraseId = currentQuestion.phraseId;
  if (!subtypeUsesMatching(effectiveSubtype) && phraseId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(phraseId))) {
      return res.status(400).json({ error: "invalid phrase id" });
    }
    const phrase = await phraseRepo.findById(String(phraseId));
    if (!phrase) {
      return res.status(404).json({ error: "phrase not found" });
    }
    update.phraseId = phrase.id;
    targetPhraseId = phrase.id;
  }
  if (!subtypeUsesMatching(effectiveSubtype) && translationIndex !== undefined) {
    const parsedTranslationIndex = Number(translationIndex);
    if (!Number.isInteger(parsedTranslationIndex) || parsedTranslationIndex < 0) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    const phrase = await phraseRepo.findById(targetPhraseId);
    if (!phrase) {
      return res.status(404).json({ error: "phrase not found" });
    }
    if (parsedTranslationIndex >= phrase.translations.length) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    update.translationIndex = parsedTranslationIndex;
  }
  let parsedReviewData: ReturnType<typeof parseQuestionReviewData> | undefined;
  let parsedInteractionData: Awaited<ReturnType<typeof buildMatchingInteractionData>> | null = null;
  if (reviewData !== undefined) {
    parsedReviewData = parseQuestionReviewData(reviewData) ?? undefined;
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
    }
    update.reviewData = parsedReviewData;
  }
  if (subtypeRequiresReviewData(effectiveSubtype) && !parsedReviewData && !currentQuestion.reviewData?.sentence) {
    return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
  }

  if (subtypeUsesMatching(effectiveSubtype)) {
    const parsedMatchingPairs = parseQuestionMatchingPairs(interactionData, effectiveSubtype);
    if (!parsedMatchingPairs) {
      return res.status(400).json({ error: "This matching question requires at least two valid phrase pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: effectiveSubtype,
      lessonId: currentQuestion.lessonId,
      phrases: phraseRepo,
      phraseImageLinks: phraseImageLinkRepo,
      imageAssets: imageAssetRepo
    });
    if (parsedInteractionData === "phrase_not_found") {
      return res.status(404).json({ error: "phrase not found" });
    }
    if (parsedInteractionData === "invalid_translation_index") {
      return res.status(400).json({ error: "invalid translation index" });
    }
    if (parsedInteractionData === "matching_image_required") {
      return res.status(400).json({ error: "Each image matching pair must have a linked image." });
    }
    if (parsedInteractionData === "matching_pairs_required") {
      return res.status(400).json({ error: "This matching question requires at least two valid phrase pairs." });
    }
    update.phraseId = parsedInteractionData.phraseId;
    update.relatedPhraseIds = parsedInteractionData.relatedPhraseIds;
    update.translationIndex = parsedInteractionData.translationIndex;
    update.interactionData = parsedInteractionData.interactionData;
    update.options = [];
    update.correctIndex = 0;
    update.reviewData = undefined;
  } else if (subtypeUsesWordOrder(effectiveSubtype)) {
    const wordOrderReview = parsedReviewData || currentQuestion.reviewData;
    if (!wordOrderReview) {
      return res.status(400).json({ error: "This word order question requires valid review data." });
    }
    update.options = wordOrderReview.words;
    update.correctIndex = 0;
    update.relatedPhraseIds = [];
    update.interactionData = undefined;
  } else if (subtypeUsesChoiceOptions(effectiveSubtype)) {
    if (options !== undefined) {
      const parsedOptions = parseQuestionOptions(options);
      if (!parsedOptions) {
        return res.status(400).json({ error: "This question subtype requires answer options." });
      }
      update.options = parsedOptions;

      if (correctIndex !== undefined) {
        const idx = Number(correctIndex);
        if (Number.isNaN(idx) || idx < 0 || idx >= parsedOptions.length) {
          return res.status(400).json({ error: "invalid correct index" });
        }
        update.correctIndex = idx;
      }
    } else if (correctIndex !== undefined) {
      const existingOptions = Array.isArray(update.options) ? update.options : currentQuestion.options || [];
      const idx = Number(correctIndex);
      if (Number.isNaN(idx) || idx < 0 || idx >= existingOptions.length) {
        return res.status(400).json({ error: "invalid correct index" });
      }
      update.correctIndex = idx;
    }
    update.relatedPhraseIds = [];
    update.interactionData = undefined;
  } else {
    return res.status(400).json({ error: "This question subtype is not supported in the learner app yet." });
  }

  if (explanation !== undefined) {
    update.explanation = String(explanation).trim();
  }

  const question = await questionUseCases.update(id, update);
  if (!question) {
    return res.status(404).json({ error: "question not found" });
  }

  return res.status(200).json({ question });
}

export async function deleteQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const question = await questionUseCases.delete(id);
  if (!question) {
    return res.status(404).json({ error: "question not found" });
  }

  return res.status(200).json({ message: "question_deleted" });
}

export async function publishQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const result = await questionUseCases.publish(id);
  if (result === "question_not_found") {
    return res.status(404).json({ error: "question not found" });
  }
  if (result === "linked_phrase_must_be_published") {
    return res.status(400).json({ error: "linked phrase must be published" });
  }
  if (result === "question_not_finished") {
    return res.status(400).json({ error: "question not finished" });
  }
  return res.status(200).json({ question: result });
}

export async function sendBackToTutorQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const result = await questionUseCases.sendBackToTutor(id);
  if (result === "question_not_found") {
    return res.status(404).json({ error: "question not found" });
  }
  if (result === "question_must_be_finished") {
    return res.status(400).json({ error: "question must be finished" });
  }
  return res.status(200).json({ question: result });
}
