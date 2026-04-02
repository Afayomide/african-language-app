import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorQuestionUseCases } from "../../application/use-cases/tutor/question/TutorQuestionUseCases.js";
import { MongooseExpressionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseExpressionRepository.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongooseSentenceRepository } from "../../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseWordRepository } from "../../infrastructure/db/mongoose/repositories/MongooseWordRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
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

const questionUseCases = new TutorQuestionUseCases(
  new MongooseQuestionRepository(),
  new MongooseLessonRepository(),
  new MongooseExpressionRepository(),
  new MongooseWordRepository()
);
const expressionRepo = new MongooseExpressionRepository();
const wordRepo = new MongooseWordRepository();
const sentenceRepo = new MongooseSentenceRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());

type QuestionSourceEntity = {
  id: string;
  text: string;
  translations: string[];
  status: string;
  audio?: {
    provider?: string;
    model?: string;
    voice?: string;
    locale?: string;
    format?: string;
    url?: string;
    s3Key?: string;
  };
};

function buildQuestionSourcePayload(
  question: { sourceId?: string; translationIndex: number },
  source: { id: string; text: string; translations: string[]; status: string; audio?: { provider?: string; model?: string; voice?: string; locale?: string; format?: string; url?: string; s3Key?: string } } | null
) {
  if (!source) return question.sourceId || null;
  return {
    _id: source.id,
    text: source.text,
    translations: source.translations,
    selectedTranslation: getSelectedTranslation(source.translations, question.translationIndex),
    selectedTranslationIndex: question.translationIndex,
    status: source.status,
    audio: source.audio
      ? {
          audioUrl: String(source.audio.url || ""),
          audioProvider: String(source.audio.provider || ""),
          voice: String(source.audio.voice || ""),
          locale: String(source.audio.locale || "")
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

async function findSourceByType(
  sourceType: "word" | "expression" | "sentence" | undefined,
  sourceId: string | undefined
): Promise<QuestionSourceEntity | null> {
  if (!sourceId) return null;
  if (sourceType === "word") {
    return (await wordRepo.findById(sourceId)) as QuestionSourceEntity | null;
  }
  if (sourceType === "sentence") {
    return (await sentenceRepo.findById(sourceId)) as QuestionSourceEntity | null;
  }
  return (await expressionRepo.findById(sourceId)) as QuestionSourceEntity | null;
}

async function serializeQuestionWithSource<
  T extends { id: string; sourceId?: string; sourceType?: "word" | "expression" | "sentence"; translationIndex: number }
>(question: T) {
  const source = await findSourceByType(question.sourceType, question.sourceId);
  return {
    ...question,
    _id: question.id,
    source: buildQuestionSourcePayload(question, source)
  };
}

export async function createQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

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
  if (!subtypeUsesMatching(String(subtype)) && (!sourceId || !mongoose.Types.ObjectId.isValid(String(sourceId)))) {
    return res.status(400).json({ error: "invalid source id" });
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
  if (!promptTemplate || !String(promptTemplate).trim()) {
    return res.status(400).json({ error: "prompt template required" });
  }
  const parsedTranslationIndex = Number(translationIndex ?? 0);
  if (!Number.isInteger(parsedTranslationIndex) || parsedTranslationIndex < 0) {
    return res.status(400).json({ error: "invalid translation index" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  let parsedOptions = parseQuestionOptions(options);
  let answerIndex = Number(correctIndex);
  let parsedReviewData: ReturnType<typeof parseQuestionReviewData> = null;
  let parsedInteractionData: Awaited<ReturnType<typeof buildMatchingInteractionData>> | null = null;
  const targetExpression = !subtypeUsesMatching(String(subtype)) ? await expressionRepo.findById(String(sourceId)) : null;
  if (!subtypeUsesMatching(String(subtype)) && !targetExpression) {
    return res.status(404).json({ error: "source not found" });
  }
  if (targetExpression && parsedTranslationIndex >= targetExpression.translations.length) {
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
      return res.status(400).json({ error: "This matching question requires at least four valid content pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: String(subtype),
      lessonId: String(lessonId),
      expressions: expressionRepo,
      words: wordRepo
    });
    if (parsedInteractionData === "content_not_found") {
      return res.status(404).json({ error: "source not found" });
    }
    if (parsedInteractionData === "invalid_translation_index") {
      return res.status(400).json({ error: "invalid translation index" });
    }
    if (parsedInteractionData === "matching_pairs_required") {
      return res.status(400).json({ error: "This matching question requires at least four valid content pairs." });
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
    if (!parsedOptions) return res.status(400).json({ error: "This question subtype requires answer options." });
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

  const created = await questionUseCases.create(
    {
      lessonId: String(lessonId),
      sourceType: parsedInteractionData?.sourceType || "expression",
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
    },
    tutorLanguage as Language
  );
  if (created === "lesson_not_found") return res.status(404).json({ error: "lesson not found" });
  if (created === "source_not_found") return res.status(404).json({ error: "source not found" });
  if (created === "source_not_in_lesson") return res.status(400).json({ error: "source not in lesson" });
  if (created === "invalid_translation_index") {
    return res.status(400).json({ error: "invalid translation index" });
  }

  return res.status(201).json({ question: created });
}

export async function listQuestions(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const { lessonId, type, subtype, status } = req.query;
  const paginationInput = parsePaginationQuery(req.query);
  const q = getSearchQuery(req.query);
  if (lessonId !== undefined && !mongoose.Types.ObjectId.isValid(String(lessonId))) {
    return res.status(400).json({ error: "invalid lesson id" });
  }
  if (type !== undefined && !isValidQuestionType(String(type))) {
    return res.status(400).json({ error: "invalid type" });
  }
  if (subtype !== undefined && !isValidQuestionSubtype(String(subtype))) {
    return res.status(400).json({ error: "invalid subtype" });
  }
  if (status !== undefined && !["draft", "finished", "published"].includes(String(status))) {
    return res.status(400).json({ error: "invalid status" });
  }

  const listed = await questionUseCases.list(
    {
      lessonId: lessonId !== undefined ? String(lessonId) : undefined,
      type: type !== undefined ? (String(type) as QuestionType) : undefined,
      subtype: subtype !== undefined ? (String(subtype) as QuestionSubtype) : undefined,
      status: status !== undefined ? (String(status) as "draft" | "finished" | "published") : undefined
    },
    tutorLanguage as Language
  );
  if (listed === "lesson_not_found") return res.status(404).json({ error: "lesson not found" });

  const questions = listed;
  const expressionIds = questions
    .filter((question) => question.sourceType === "expression" || !question.sourceType)
    .map((question) => question.sourceId)
    .filter((id): id is string => Boolean(id));
  const wordIds = questions
    .filter((question) => question.sourceType === "word")
    .map((question) => question.sourceId)
    .filter((id): id is string => Boolean(id));
  const sentenceIds = questions
    .filter((question) => question.sourceType === "sentence")
    .map((question) => question.sourceId)
    .filter((id): id is string => Boolean(id));
  const [expressions, words, sentences] = await Promise.all([
    expressionRepo.findByIds(expressionIds),
    wordRepo.findByIds(wordIds),
    sentenceRepo.findByIds(sentenceIds)
  ]);
  const expressionMap = new Map(expressions.map((expression) => [expression.id, expression]));
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const sentenceMap = new Map(sentences.map((sentence) => [sentence.id, sentence]));
  const data = questions.map((question) => {
    const source = question.sourceId
      ? question.sourceType === "word"
        ? wordMap.get(question.sourceId) || null
        : question.sourceType === "sentence"
          ? sentenceMap.get(question.sourceId) || null
          : expressionMap.get(question.sourceId) || null
      : null;
    return {
      ...question,
      _id: question.id,
      source: buildQuestionSourcePayload(question, source)
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

export async function getQuestionById(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const question = await questionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!question) return res.status(404).json({ error: "question not found" });
  return res.status(200).json({
    question: await serializeQuestionWithSource(question)
  });
}

export async function updateQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const question = await questionUseCases.getByIdInScope(id, tutorLanguage as Language);
  if (!question) return res.status(404).json({ error: "question not found" });

  const { type, subtype, sourceType, sourceId, translationIndex, promptTemplate, options, correctIndex, explanation, reviewData, interactionData } = req.body ?? {};
  const update: Record<string, unknown> = {};
  const effectiveType = String(type || question.type);
  const effectiveSubtype = String(subtype || question.subtype);

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
  let targetSourceId = question.sourceId;
  let targetSourceType = (String(sourceType || question.sourceType || "expression") as "word" | "expression" | "sentence");
  if (!subtypeUsesMatching(effectiveSubtype) && sourceId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(sourceId))) {
      return res.status(400).json({ error: "invalid source id" });
    }
    if (sourceType !== undefined && !["word", "expression", "sentence"].includes(String(sourceType))) {
      return res.status(400).json({ error: "invalid source type" });
    }
    const source = await findSourceByType(targetSourceType, String(sourceId));
    if (!source || ("language" in source && (source as { language?: string }).language !== tutorLanguage)) {
      return res.status(404).json({ error: "source not found" });
    }
    update.sourceType = targetSourceType;
    update.sourceId = source.id;
    targetSourceId = source.id;
  }
  if (!subtypeUsesMatching(effectiveSubtype) && translationIndex !== undefined) {
    if (!targetSourceId) return res.status(400).json({ error: "source not found" });
    const parsedTranslationIndex = Number(translationIndex);
    if (!Number.isInteger(parsedTranslationIndex) || parsedTranslationIndex < 0) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    const source = await findSourceByType(targetSourceType, targetSourceId);
    if (!source || ("language" in source && (source as { language?: string }).language !== tutorLanguage)) {
      return res.status(404).json({ error: "source not found" });
    }
    if (parsedTranslationIndex >= source.translations.length) {
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
    !question.reviewData?.sentence
  ) {
    return res.status(400).json({ error: "This question subtype requires valid sentence review data." });
  }
  if (subtypeUsesMatching(effectiveSubtype)) {
    const parsedMatchingPairs = parseQuestionMatchingPairs(interactionData, effectiveSubtype);
    if (!parsedMatchingPairs) {
      return res.status(400).json({ error: "This matching question requires at least four valid content pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: effectiveSubtype,
      lessonId: question.lessonId,
      expressions: expressionRepo,
      words: wordRepo
    });
    if (parsedInteractionData === "content_not_found") {
      return res.status(404).json({ error: "source not found" });
    }
    if (parsedInteractionData === "invalid_translation_index") {
      return res.status(400).json({ error: "invalid translation index" });
    }
    if (parsedInteractionData === "matching_pairs_required") {
      return res.status(400).json({ error: "This matching question requires at least four valid content pairs." });
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
    if (!targetSourceId) return res.status(400).json({ error: "source not found" });
    const targetSource = await findSourceByType(targetSourceType, targetSourceId);
    if (!targetSource) {
      return res.status(404).json({ error: "source not found" });
    }
    const spellingReview = buildLetterOrderReviewData({
      phraseText: targetSource.text,
      meaning: getSelectedTranslation(targetSource.translations, Number(update.translationIndex ?? question.translationIndex))
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
    if (!targetSourceId) return res.status(400).json({ error: "source not found" });
    const targetSource = await findSourceByType(targetSourceType, targetSourceId);
    if (!targetSource) {
      return res.status(404).json({ error: "source not found" });
    }
    const wordOrderReview = buildWordOrderReviewData({
      phraseText: targetSource.text,
      meaning: getSelectedTranslation(
        targetSource.translations,
        Number(update.translationIndex ?? question.translationIndex)
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
      ? String((await findSourceByType(targetSourceType, targetSourceId))?.text || "")
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
          correctIndex: Number(update.correctIndex ?? question.correctIndex)
        });
        if (validationError) {
          return res.status(400).json({ error: getContextResponseValidationMessage(validationError) });
        }
      }
    } else if (correctIndex !== undefined) {
      const existingOptions = Array.isArray(update.options) ? update.options : question.options;
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
      const existingOptions = Array.isArray(update.options) ? update.options : question.options;
      const validationError = validateContextResponseQuestion({
        sourceText: currentSourceText,
        options: existingOptions,
        correctIndex: Number(update.correctIndex ?? question.correctIndex)
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

  if (explanation !== undefined) update.explanation = String(explanation).trim();

  const updated = await questionUseCases.updateInScope(
    id,
    tutorLanguage as Language,
    update
  );
  if (updated === "source_not_found") return res.status(404).json({ error: "source not found" });
  if (updated === "source_not_in_lesson") return res.status(400).json({ error: "source not in lesson" });
  if (updated === "question_not_found" || !updated) return res.status(404).json({ error: "question not found" });
  return res.status(200).json({ question: await serializeQuestionWithSource(updated) });
}

export async function deleteQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const deleted = await questionUseCases.deleteInScope(id, tutorLanguage as Language);
  if (!deleted) return res.status(404).json({ error: "question not found" });
  return res.status(200).json({ message: "question_deleted" });
}

export async function finishQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const tutorLanguage = await tutorScope.getActiveLanguage(req.user.id);
  if (!tutorLanguage) return res.status(403).json({ error: "tutor language not configured" });

  const finished = await questionUseCases.finishInScope(id, tutorLanguage as Language);
  if (finished === "question_not_found") return res.status(404).json({ error: "question not found" });
  return res.status(200).json({ question: finished });
}
