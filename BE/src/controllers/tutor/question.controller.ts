import type { Response } from "express";
import mongoose from "mongoose";
import type { AuthRequest } from "../../utils/authMiddleware.js";
import { TutorScopeService } from "../../application/services/TutorScopeService.js";
import { TutorQuestionUseCases } from "../../application/use-cases/tutor/question/TutorQuestionUseCases.js";
import { MongooseQuestionRepository } from "../../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { MongooseLessonRepository } from "../../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { MongoosePhraseRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseRepository.js";
import { MongooseTutorProfileRepository } from "../../infrastructure/db/mongoose/repositories/MongooseTutorProfileRepository.js";
import { MongooseImageAssetRepository } from "../../infrastructure/db/mongoose/repositories/MongooseImageAssetRepository.js";
import { MongoosePhraseImageLinkRepository } from "../../infrastructure/db/mongoose/repositories/MongoosePhraseImageLinkRepository.js";
import type { Language } from "../../domain/entities/Lesson.js";
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
  new MongoosePhraseRepository()
);
const phraseRepo = new MongoosePhraseRepository();
const tutorScope = new TutorScopeService(new MongooseTutorProfileRepository());
const imageAssetRepo = new MongooseImageAssetRepository();
const phraseImageLinkRepo = new MongoosePhraseImageLinkRepository();

function getSelectedTranslation(translations: string[], index: number) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  if (Number.isInteger(index) && index >= 0 && index < translations.length) {
    return String(translations[index] || "");
  }
  return String(translations[0] || "");
}

export async function createQuestion(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

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
  if (!subtypeUsesMatching(String(subtype)) && (!phraseId || !mongoose.Types.ObjectId.isValid(String(phraseId)))) {
    return res.status(400).json({ error: "invalid phrase id" });
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
  const targetPhrase = !subtypeUsesMatching(String(subtype)) ? await phraseRepo.findById(String(phraseId)) : null;
  if (!subtypeUsesMatching(String(subtype)) && !targetPhrase) {
    return res.status(404).json({ error: "phrase not found" });
  }
  if (targetPhrase && parsedTranslationIndex >= targetPhrase.translations.length) {
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
  } else if (String(subtype) === "fg-letter-order") {
    parsedReviewData = buildLetterOrderReviewData({
      phraseText: String(targetPhrase?.text || ""),
      meaning: getSelectedTranslation(targetPhrase?.translations || [], parsedTranslationIndex)
    });
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This spelling question requires a phrase with at least two letters." });
    }
    parsedOptions = parsedReviewData.words;
    answerIndex = 0;
  } else if (subtypeUsesOrderArrangement(String(subtype))) {
    parsedReviewData = buildWordOrderReviewData({
      phraseText: String(targetPhrase?.text || ""),
      meaning: getSelectedTranslation(targetPhrase?.translations || [], parsedTranslationIndex)
    });
    if (!parsedReviewData) {
      return res.status(400).json({ error: "This word order question requires a multi-word phrase. Use spelling order for single words." });
    }
    parsedOptions = parsedReviewData.words;
    answerIndex = 0;
  } else if (subtypeUsesChoiceOptions(String(subtype))) {
    if (!parsedOptions) return res.status(400).json({ error: "This question subtype requires answer options." });
    if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex >= parsedOptions.length) {
      return res.status(400).json({ error: "invalid correct index" });
    }
  } else {
    return res.status(400).json({ error: "This question subtype is not supported in the learner app yet." });
  }

  const created = await questionUseCases.create(
    {
      lessonId: String(lessonId),
      phraseId: parsedInteractionData ? parsedInteractionData.phraseId : String(targetPhrase?.id || phraseId),
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
    },
    tutorLanguage as Language
  );
  if (created === "lesson_not_found") return res.status(404).json({ error: "lesson not found" });
  if (created === "phrase_not_found") return res.status(404).json({ error: "phrase not found" });
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

  const { type, subtype, phraseId, translationIndex, promptTemplate, options, correctIndex, explanation, reviewData, interactionData } = req.body ?? {};
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
  let targetPhraseId = question.phraseId;
  if (!subtypeUsesMatching(effectiveSubtype) && phraseId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(phraseId))) {
      return res.status(400).json({ error: "invalid phrase id" });
    }
    const phrase = await phraseRepo.findById(String(phraseId));
    if (phrase && !phrase.lessonIds.includes(question.lessonId)) {
      return res.status(404).json({ error: "phrase not found" });
    }
    if (!phrase) return res.status(404).json({ error: "phrase not found" });
    update.phraseId = phrase.id;
    targetPhraseId = phrase.id;
  }
  if (!subtypeUsesMatching(effectiveSubtype) && translationIndex !== undefined) {
    const parsedTranslationIndex = Number(translationIndex);
    if (!Number.isInteger(parsedTranslationIndex) || parsedTranslationIndex < 0) {
      return res.status(400).json({ error: "invalid translation index" });
    }
    const phrase = await phraseRepo.findById(targetPhraseId);
    if (!phrase) return res.status(404).json({ error: "phrase not found" });
    if (parsedTranslationIndex >= phrase.translations.length) {
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
      return res.status(400).json({ error: "This matching question requires at least two valid phrase pairs." });
    }
    parsedInteractionData = await buildMatchingInteractionData({
      matchingPairs: parsedMatchingPairs,
      subtype: effectiveSubtype,
      lessonId: question.lessonId,
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
  } else if (effectiveSubtype === "fg-letter-order") {
    const targetPhrase = await phraseRepo.findById(targetPhraseId);
    if (!targetPhrase) {
      return res.status(404).json({ error: "phrase not found" });
    }
    const spellingReview = buildLetterOrderReviewData({
      phraseText: targetPhrase.text,
      meaning: getSelectedTranslation(targetPhrase.translations, Number(update.translationIndex ?? question.translationIndex))
    });
    if (!spellingReview) {
      return res.status(400).json({ error: "This spelling question requires a phrase with at least two letters." });
    }
    update.reviewData = spellingReview;
    update.options = spellingReview.words;
    update.correctIndex = 0;
    update.relatedPhraseIds = [];
    update.interactionData = undefined;
  } else if (subtypeUsesOrderArrangement(effectiveSubtype)) {
    const targetPhrase = await phraseRepo.findById(targetPhraseId);
    if (!targetPhrase) {
      return res.status(404).json({ error: "phrase not found" });
    }
    const wordOrderReview = buildWordOrderReviewData({
      phraseText: targetPhrase.text,
      meaning: getSelectedTranslation(
        targetPhrase.translations,
        Number(update.translationIndex ?? question.translationIndex)
      )
    });
    if (!wordOrderReview) {
      return res.status(400).json({ error: "This word order question requires a multi-word phrase. Use spelling order for single words." });
    }
    update.reviewData = wordOrderReview;
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
      const existingOptions = Array.isArray(update.options) ? update.options : question.options;
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

  if (explanation !== undefined) update.explanation = String(explanation).trim();

  const updated = await questionUseCases.updateInScope(
    id,
    tutorLanguage as Language,
    update
  );
  if (updated === "phrase_not_found") return res.status(404).json({ error: "phrase not found" });
  if (updated === "question_not_found" || !updated) return res.status(404).json({ error: "question not found" });
  return res.status(200).json({ question: updated });
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
