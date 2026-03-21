import type { Request, Response } from "express";
import mongoose from "mongoose";
import { AdminQuestionUseCases } from "../../application/use-cases/admin/question/AdminQuestionUseCases.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import type { QuestionType, QuestionSubtype } from "../../domain/entities/Question.js";
import {
  isManuallySupportedQuestionSubtype,
  parseQuestionMatchingPairs,
  isValidQuestionSubtype,
  isValidQuestionType,
  parseQuestionOptions,
  parseQuestionReviewData,
  validateContextResponseQuestion,
  subtypeMatchesType,
  subtypeUsesMatching,
  subtypeRequiresReviewData,
  subtypeUsesChoiceOptions,
  subtypeUsesOrderArrangement
} from "../../interfaces/http/validators/question.validators.js";
import {
  getSearchQuery,
  includesSearch,
  paginate,
  parsePaginationQuery
} from "../../interfaces/http/utils/pagination.js";
import { buildMatchingInteractionData } from "../shared/questionMatching.js";
import { buildLetterOrderReviewData, buildWordOrderReviewData } from "../shared/spellingQuestion.js";

const questionUseCases = new AdminQuestionUseCases(
  new MongooseQuestionRepository(),
  new MongooseLessonRepository(),
  new MongooseExpressionRepository()
);
const expressionRepo = new MongooseExpressionRepository();

function buildQuestionSourcePayload(question: { sourceId?: string; translationIndex: number }, expression: { id: string; text: string; translations: string[]; status: string; audio?: { provider?: string; model?: string; voice?: string; locale?: string; format?: string; url?: string; s3Key?: string } } | null) {
  if (!expression) return question.sourceId || null;
  return {
    _id: expression.id,
    text: expression.text,
    translations: expression.translations,
    selectedTranslation: getSelectedTranslation(expression.translations, question.translationIndex),
    selectedTranslationIndex: question.translationIndex,
    status: expression.status,
    audio: expression.audio
      ? {
          audioUrl: String(expression.audio.url || ""),
          audioProvider: String(expression.audio.provider || ""),
          voice: String(expression.audio.voice || ""),
          locale: String(expression.audio.locale || "")
        }
      : undefined
  };
}

function getSelectedTranslation(translations: string[], index: number) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  if (Number.isInteger(index) && index >= 0 && index < translations.length) {
    return String(translations[index] || "");
  }
  return String(translations[0] || "");
}

function getContextResponseValidationMessage(code: ReturnType<typeof validateContextResponseQuestion>) {
  switch (code) {
    case "invalid_option_count":
      return "Context-response questions require between 2 and 4 options.";
    case "correct_option_must_match_source":
      return "For context-response questions, the correct option must exactly match the source expression text.";
    case "typo_only_distractors_not_allowed":
      return "Context-response distractors must be contextually different responses, not spelling or diacritic variants of the correct answer.";
    case "invalid_correct_index":
      return "invalid correct index";
    case "missing_source_text":
      return "source not found";
    default:
      return "invalid context-response question";
  }
}

export async function createQuestion(req: Request, res: Response) {
  const {
    lessonId,
    sourceId,
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
  if (!subtypeUsesMatching(String(subtype)) && (!sourceId || !mongoose.Types.ObjectId.isValid(String(sourceId)))) {
    return res.status(400).json({ error: "invalid source id" });
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
  const targetExpression = !subtypeUsesMatching(String(subtype)) ? await expressionRepo.findById(String(sourceId)) : null;
  if (!subtypeUsesMatching(String(subtype)) && !targetExpression) {
    return res.status(404).json({ error: "source not found" });
  }
  if (
    targetExpression &&
    (parsedTranslationIndex >= targetExpression.translations.length)
  ) {
    return res.status(400).json({ error: "invalid translation index" });
  }
  if (subtypeRequiresReviewData(String(subtype)) && !subtypeUsesOrderArrangement(String(subtype))) {
    parsedReviewData = parseQuestionReviewData(reviewData);
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
    }
  }

  if (subtypeUsesMatching(String(subtype))) {
    const parsedMatchingPairs = parseQuestionMatchingPairs(interactionData, String(subtype));
    if (!parsedMatchingPairs) {
      return res.status(400).json({ error: "This matching question requires at least two valid content pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: String(subtype),
      lessonId: String(lessonId),
      expressions: expressionRepo
    });
    if (parsedInteractionData === "content_not_found") {
      return res.status(404).json({ error: "source not found" });
    }
    if (parsedInteractionData === "invalid_translation_index") {
      return res.status(400).json({ error: "invalid translation index" });
    }
    if (parsedInteractionData === "matching_image_not_supported") {
      return res.status(400).json({ error: "Image matching is not wired in the new content model yet." });
    }
    if (parsedInteractionData === "matching_pairs_required") {
      return res.status(400).json({ error: "This matching question requires at least two valid content pairs." });
    }
    parsedOptions = [];
    answerIndex = 0;
  } else if (String(subtype) === "fg-letter-order") {
    parsedReviewData = buildLetterOrderReviewData({
      phraseText: String(targetExpression?.text || ""),
      meaning: getSelectedTranslation(targetExpression?.translations || [], parsedTranslationIndex)
    });
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This spelling question requires a content item with at least two letters." });
    }
    parsedOptions = parsedReviewData.words;
    answerIndex = 0;
  } else if (subtypeUsesOrderArrangement(String(subtype))) {
    parsedReviewData = buildWordOrderReviewData({
      phraseText: String(targetExpression?.text || ""),
      meaning: getSelectedTranslation(targetExpression?.translations || [], parsedTranslationIndex)
    });
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This word order question requires multi-word content. Use spelling order for single words." });
    }
    parsedOptions = parsedReviewData.words;
    answerIndex = 0;
  } else if (String(subtype) === "sp-pronunciation-compare") {
    parsedOptions = [];
    answerIndex = 0;
  } else if (subtypeUsesChoiceOptions(String(subtype))) {
    if (!parsedOptions) {
      return res.status(400).json({ error: "This question subtype requires answer options." });
    }
    if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex >= parsedOptions.length) {
      return res.status(400).json({ error: "invalid correct index" });
    }
    if (String(subtype) === "mc-select-context-response") {
      const validationError = validateContextResponseQuestion({
        sourceText: String(targetExpression?.text || ""),
        options: parsedOptions,
        correctIndex: answerIndex
      });
      if (validationError) {
        return res.status(400).json({ error: getContextResponseValidationMessage(validationError) });
      }
    }
  } else {
    return res.status(400).json({ error: "This question subtype is not supported in the learner app yet." });
  }

  const created = await questionUseCases.create({
    lessonId: String(lessonId),
    sourceType: "expression",
    sourceId: parsedInteractionData?.sourceId || String(targetExpression?.id || sourceId),
    relatedSourceRefs: parsedInteractionData?.relatedSourceRefs || [],
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
  if (created === "source_not_found") {
    return res.status(404).json({ error: "source not found" });
  }
  if (created === "source_not_in_lesson") {
    return res.status(400).json({ error: "source not in lesson" });
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
  const expressions = await expressionRepo.findByIds(
    questions.map((question) => question.sourceId).filter((id): id is string => Boolean(id))
  );
  const expressionMap = new Map(expressions.map((expression) => [expression.id, expression]));
  const data = questions.map((question) => {
    const expression = question.sourceId ? expressionMap.get(question.sourceId) || null : null;
    return {
      ...question,
      _id: question.id,
      source: buildQuestionSourcePayload(question, expression)
    };
  });
  const filtered = q
    ? data.filter((item) => {
        const source = typeof item.source === "string" ? null : item.source;
        return [
          item.type,
          item.status,
          item.promptTemplate,
          item.explanation,
          source?.text,
          source?.selectedTranslation
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
  const expression = question.sourceId ? await expressionRepo.findById(question.sourceId) : null;
  return res.status(200).json({
    question: {
      ...question,
      _id: question.id,
      source: buildQuestionSourcePayload(question, expression)
    }
  });
}

export async function updateQuestion(req: Request, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const { type, subtype, sourceId, translationIndex, promptTemplate, options, correctIndex, explanation, reviewData, interactionData } = req.body ?? {};
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
  let targetSourceId = currentQuestion.sourceId;
  if (!subtypeUsesMatching(effectiveSubtype) && sourceId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(sourceId))) {
      return res.status(400).json({ error: "invalid source id" });
    }
    const expression = await expressionRepo.findById(String(sourceId));
    if (!expression) {
      return res.status(404).json({ error: "source not found" });
    }
    update.sourceType = "expression";
    update.sourceId = expression.id;
    targetSourceId = expression.id;
  }
  if (!subtypeUsesMatching(effectiveSubtype) && translationIndex !== undefined) {
    if (!targetSourceId) {
      return res.status(400).json({ error: "source not found" });
    }
    const parsedTranslationIndex = Number(translationIndex);
    if (!Number.isInteger(parsedTranslationIndex) || parsedTranslationIndex < 0) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    const expression = await expressionRepo.findById(targetSourceId);
    if (!expression) {
      return res.status(404).json({ error: "source not found" });
    }
    if (parsedTranslationIndex >= expression.translations.length) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    update.translationIndex = parsedTranslationIndex;
  }
  let parsedReviewData: ReturnType<typeof parseQuestionReviewData> | undefined;
  let parsedInteractionData: Awaited<ReturnType<typeof buildMatchingInteractionData>> | null = null;
  if (reviewData !== undefined && !subtypeUsesOrderArrangement(effectiveSubtype)) {
    parsedReviewData = parseQuestionReviewData(reviewData) ?? undefined;
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
    }
    update.reviewData = parsedReviewData;
  }
  if (
    subtypeRequiresReviewData(effectiveSubtype) &&
    !subtypeUsesOrderArrangement(effectiveSubtype) &&
    !parsedReviewData &&
    !currentQuestion.reviewData?.sentence
  ) {
    return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
  }

  if (subtypeUsesMatching(effectiveSubtype)) {
    const parsedMatchingPairs = parseQuestionMatchingPairs(interactionData, effectiveSubtype);
    if (!parsedMatchingPairs) {
      return res.status(400).json({ error: "This matching question requires at least two valid content pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: effectiveSubtype,
      lessonId: currentQuestion.lessonId,
      expressions: expressionRepo
    });
    if (parsedInteractionData === "content_not_found") {
      return res.status(404).json({ error: "source not found" });
    }
    if (parsedInteractionData === "invalid_translation_index") {
      return res.status(400).json({ error: "invalid translation index" });
    }
    if (parsedInteractionData === "matching_image_not_supported") {
      return res.status(400).json({ error: "Image matching is not wired in the new content model yet." });
    }
    if (parsedInteractionData === "matching_pairs_required") {
      return res.status(400).json({ error: "This matching question requires at least two valid content pairs." });
    }
    update.sourceType = parsedInteractionData.sourceType;
    update.sourceId = parsedInteractionData.sourceId;
    update.relatedSourceRefs = parsedInteractionData.relatedSourceRefs;
    update.translationIndex = parsedInteractionData.translationIndex;
    update.interactionData = parsedInteractionData.interactionData;
    update.options = [];
    update.correctIndex = 0;
    update.reviewData = undefined;
  } else if (effectiveSubtype === "fg-letter-order") {
    if (!targetSourceId) {
      return res.status(400).json({ error: "source not found" });
    }
    const targetExpression = await expressionRepo.findById(targetSourceId);
    if (!targetExpression) {
      return res.status(404).json({ error: "source not found" });
    }
    const spellingReview = buildLetterOrderReviewData({
      phraseText: targetExpression.text,
      meaning: getSelectedTranslation(targetExpression.translations, Number(update.translationIndex ?? currentQuestion.translationIndex))
    });
    if (!spellingReview) {
      return res.status(400).json({ error: "This spelling question requires a content item with at least two letters." });
    }
    update.reviewData = spellingReview;
    update.options = spellingReview.words;
    update.correctIndex = 0;
    update.relatedSourceRefs = [];
    update.interactionData = undefined;
  } else if (subtypeUsesOrderArrangement(effectiveSubtype)) {
    if (!targetSourceId) {
      return res.status(400).json({ error: "source not found" });
    }
    const targetExpression = await expressionRepo.findById(targetSourceId);
    if (!targetExpression) {
      return res.status(404).json({ error: "source not found" });
    }
    const wordOrderReview = buildWordOrderReviewData({
      phraseText: targetExpression.text,
      meaning: getSelectedTranslation(
        targetExpression.translations,
        Number(update.translationIndex ?? currentQuestion.translationIndex)
      )
    });
    if (!wordOrderReview) {
      return res.status(400).json({ error: "This word order question requires multi-word content. Use spelling order for single words." });
    }
    update.reviewData = wordOrderReview;
    update.options = wordOrderReview.words;
    update.correctIndex = 0;
    update.relatedSourceRefs = [];
    update.interactionData = undefined;
  } else if (effectiveSubtype === "sp-pronunciation-compare") {
    update.options = [];
    update.correctIndex = 0;
    update.relatedSourceRefs = [];
    update.interactionData = undefined;
    update.reviewData = undefined;
  } else if (subtypeUsesChoiceOptions(effectiveSubtype)) {
    const currentSourceText = targetSourceId
      ? String((await expressionRepo.findById(targetSourceId))?.text || "")
      : "";
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
      if (effectiveSubtype === "mc-select-context-response") {
        const validationError = validateContextResponseQuestion({
          sourceText: currentSourceText,
          options: parsedOptions,
          correctIndex: Number(update.correctIndex ?? currentQuestion.correctIndex)
        });
        if (validationError) {
          return res.status(400).json({ error: getContextResponseValidationMessage(validationError) });
        }
      }
    } else if (correctIndex !== undefined) {
      const existingOptions = Array.isArray(update.options) ? update.options : currentQuestion.options || [];
      const idx = Number(correctIndex);
      if (Number.isNaN(idx) || idx < 0 || idx >= existingOptions.length) {
        return res.status(400).json({ error: "invalid correct index" });
      }
      update.correctIndex = idx;
      if (effectiveSubtype === "mc-select-context-response") {
        const validationError = validateContextResponseQuestion({
          sourceText: currentSourceText,
          options: existingOptions,
          correctIndex: idx
        });
        if (validationError) {
          return res.status(400).json({ error: getContextResponseValidationMessage(validationError) });
        }
      }
    } else if (effectiveSubtype === "mc-select-context-response") {
      const existingOptions = Array.isArray(update.options) ? update.options : currentQuestion.options || [];
      const validationError = validateContextResponseQuestion({
        sourceText: currentSourceText,
        options: existingOptions,
        correctIndex: Number(update.correctIndex ?? currentQuestion.correctIndex)
      });
      if (validationError) {
        return res.status(400).json({ error: getContextResponseValidationMessage(validationError) });
      }
    }
    update.relatedSourceRefs = [];
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
  if (result === "linked_source_must_be_published") {
    return res.status(400).json({ error: "linked source must be published" });
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
