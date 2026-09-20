import { contentTextKey } from "../../../../services/content/contentTextKey.js";
import type { LessonBlock, LessonEntity, LessonStage } from "../../../../domain/entities/Lesson.js";
import type { ContentComponentRef, ContentType } from "../../../../domain/entities/Content.js";
import type { ExpressionEntity } from "../../../../domain/entities/Expression.js";
import type { ProverbEntity } from "../../../../domain/entities/Proverb.js";
import type { SentenceEntity } from "../../../../domain/entities/Sentence.js";
import type { WordEntity } from "../../../../domain/entities/Word.js";
import type { QuestionEntity, QuestionSubtype, QuestionType } from "../../../../domain/entities/Question.js";
import type { UnitAiPreviewPlanSummary, UnitEntity, UnitAiRunSummary } from "../../../../domain/entities/Unit.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { UnitContentItemRepository } from "../../../../domain/repositories/UnitContentItemRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import type { ChapterRepository } from "../../../../domain/repositories/ChapterRepository.js";
import type {
  LlmGeneratedSentenceMeaningSegment,
  LlmClient,
  LlmGeneratedSentence,
  LlmLessonRefactorOperation,
  LlmLessonRefactorPatch,
  LlmUnitPlanLesson,
  LlmUnitPlanTarget,
  LlmUnitRefactorPlan
} from "../../../../services/llm/types.js";
import { AiExpressionOrchestrator } from "../../../services/AiExpressionOrchestrator.js";
import { AiSentenceOrchestrator } from "../../../services/AiSentenceOrchestrator.js";
import { AiWordOrchestrator } from "../../../services/AiWordOrchestrator.js";
import { buildPedagogicalStages } from "../../../services/defaultLessonStages.js";
import { AdminLessonAiUseCases, buildInitialStages } from "./AdminLessonAiUseCases.js";
import {
  LESSON_GENERATION_LIMITS,
  MIN_SENTENCE_SOURCES_FLOOR,
  MIN_SENTENCE_SOURCES_PER_LESSON,
  clampNewTargetsPerLesson,
  clampReviewContentPerLesson,
  clampSentencesPerLesson,
  resolveSentencePlan
} from "../../../../config/lessonGeneration.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../../../services/llm/aiGenerationLogger.js";
import { appendAiPlanLog } from "../../../../services/llm/aiPlanFileLogger.js";
import { extractThemeAnchors } from "../../../../services/llm/unitTheme.js";
import { sanitizeGeneratedSentence } from "../../../services/AiSentenceOrchestrator.js";
import { buildLetterOrderReviewData } from "../../../../controllers/shared/spellingQuestion.js";
import { ContentCurriculumService } from "../../../services/ContentCurriculumService.js";
import { CurriculumMemoryService, type CurriculumMemoryResult } from "../../../services/CurriculumMemoryService.js";
import {
  computeReviewExerciseFloor,
  computeReviewSelectionCeiling,
  createLessonQuestionSelectionState,
  MIN_VIABLE_REVIEW_EXERCISES,
  recordLessonQuestionSelection,
  selectLessonQuestionPlan,
  type LessonQuestionSelectionState
} from "../../../services/lessonQuestionSelection.js";
import {
  buildAiContextScenarioQuestionDraft,
  contentSupportsContextScenario,
  type ContextScenarioQuestionDraft
} from "../../../services/contextScenarioQuestions.js";
import { LessonRefactorService } from "../../../services/LessonRefactorService.js";
import {
  isSentenceLikeExpressionText,
  splitExpressionIntoWordTokens
} from "../../../../services/content/expressionShape.js";

type QuestionDraft = {
  type: QuestionType;
  subtype: QuestionSubtype;
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  explanation: string;
};

type StageTaggedDraft = QuestionDraft & { stage: 1 | 2 | 3 };

type PendingLessonQuestionCreate = {
  stage: 1 | 2 | 3;
  sourceGroup: "target" | "sentence" | "lesson";
  sourceKey: string;
  questionType: QuestionType;
  questionSubtype: QuestionSubtype;
  createInput: {
    lessonId: string;
    sourceType: "word" | "expression" | "sentence";
    sourceId: string;
    relatedSourceRefs?: QuestionEntity["relatedSourceRefs"];
    translationIndex: number;
    type: QuestionType;
    subtype: QuestionSubtype;
    promptTemplate: string;
    options: string[];
    correctIndex: number;
    reviewData?: QuestionEntity["reviewData"];
    interactionData?: QuestionEntity["interactionData"];
    explanation: string;
    status: "draft";
  };
};

type ReviewMeaningSegment = {
  text: string;
  sourceWordIndexes: number[];
  sourceComponentIndexes: number[];
};

type TeachingContent = Pick<
  ExpressionEntity | SentenceEntity | WordEntity,
  "id" | "text" | "translations" | "explanation" | "difficulty" | "audio"
> & {
  components?: SentenceEntity["components"];
  meaningSegments?: ReviewMeaningSegment[];
};

export type GenerateUnitAiContentInput = {
  unitId: string;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  createdBy: string;
  lessonCount: number;
  sentencesPerLesson: number;
  reviewContentPerLesson?: number;
  proverbsPerLesson: number;
  topics?: string[];
  extraInstructions?: string;
  lessonGenerationInstruction?: string;
  planLoggingFlow?: "generate" | "regenerate";
};

export type UnitPlanSequenceLesson = LlmUnitPlanLesson & {
  lessonMode: "core" | "review";
  sourceCoreLessonIndexes?: number[];
};

type PlannedUnitLesson = LlmUnitPlanLesson & {
  lessonMode?: "core" | "review";
  reviewSourceLessonIds?: string[];
  reviewAnchorSentenceIds?: string[];
};

export type PreviewGenerateUnitPlanResult = {
  unitId: string;
  mode?: "generate" | "regenerate";
  createdBy?: string;
  createdAt?: Date;
  requestedLessons: number;
  actualLessonCount: number;
  coreLessons: LlmUnitPlanLesson[];
  lessonSequence: UnitPlanSequenceLesson[];
  settings?: UnitAiPreviewPlanSummary["settings"];
};

type LessonGenerationSummary = {
  lessonId: string;
  title: string;
  contentGenerated: number;
  sentencesGenerated: number;
  existingContentLinked: number;
  newContentSelected: number;
  reviewContentSelected: number;
  contentDroppedFromCandidates: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
};

// MIN_SENTENCE_SOURCES_PER_LESSON / MIN_SENTENCE_SOURCES_FLOOR now live in
// config/lessonGeneration.ts beside resolveSentencePlan, which decides both per lesson: when
// a lesson is asked for no sentences at all, the target and the floor are zero rather than 3
// and 2. A sentence-based lesson still borrows from the DB to reach the target and still
// throws below the floor.
const REVIEW_ANCHOR_SENTENCES_PER_LESSON = 5;
const REVIEW_VARIANT_SENTENCES_PER_LESSON = 3;

type ReviewGenerationContext = {
  sourceLessonIds: string[];
  sourceUnitIds: string[];
  knownWords: WordEntity[];
  knownExpressions: ExpressionEntity[];
  knownSentences: SentenceEntity[];
  sentenceSourceLessonIds: Map<string, string[]>;
  promotedWords: Array<{ item: WordEntity; exposureCount: number }>;
  promotedExpressions: Array<{ item: ExpressionEntity; exposureCount: number }>;
  introducedWordIds: Set<string>;
  introducedExpressionIds: Set<string>;
  wordExposureCounts: Map<string, number>;
  expressionExposureCounts: Map<string, number>;
};

type UnitPlanContext = {
  unit: UnitEntity;
  reviewContext: ReviewGenerationContext | null;
  reviewPlanningInventorySummary: string;
  chapterContextInstruction: string;
  reviewInstruction: string;
  existingLessonsInUnit: LessonEntity[];
  existingUnitExpressions: ExpressionEntity[];
  existingUnitProverbs: ProverbEntity[];
  curriculumMemory: CurriculumMemoryResult;
};

type UnitPlanValidationResult = {
  ok: boolean;
  reasons: string[];
  details: {
    duplicateTitles: string[];
    overlappingPairs: string[];
    invalidLessonIndexes: number[];
    invalidLessons: Array<{
      index: number;
      title: string;
      description: string;
      objectives: string[];
      conversationGoal: string;
      situations: string[];
      sentenceGoals: string[];
      focusSummary: string;
      reasons: string[];
      validationDetails: {
        titleThemeMatches: number;
        situationThemeMatches: number;
      };
    }>;
    actualLessonCount: number;
  };
};

type UnitRefactorValidationResult = {
  ok: boolean;
  reasons: string[];
  details: {
    duplicateLessonPatchIds: string[];
    invalidLessonIds: string[];
    invalidOperations: Array<{
      lessonId: string;
      lessonTitle?: string;
      operationIndex: number;
      operationType?: string;
      reason: string;
    }>;
    expectedNewLessons: number;
    actualNewLessons: number;
    invalidNewLessonIndexes: number[];
  };
};

export class AiPlanValidationError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "AiPlanValidationError";
    this.details = details;
  }
}

function normalizeOption(value: string) {
  return value.trim();
}

function makeUniqueOptions(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of values) {
    const value = normalizeOption(row);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function getContentKey(content: { kind: "word" | "expression" | "sentence"; id: string }) {
  return `${content.kind}:${content.id}`;
}

function pickTranslation(phrase: TeachingContent, translationIndex = 0) {
  if (!Array.isArray(phrase.translations) || phrase.translations.length === 0) return "";
  if (
    Number.isInteger(translationIndex) &&
    translationIndex >= 0 &&
    translationIndex < phrase.translations.length
  ) {
    return String(phrase.translations[translationIndex] || "").trim();
  }
  return String(phrase.translations[0] || "").trim();
}

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPhraseOrderReviewData(phrase: TeachingContent): NonNullable<QuestionEntity["reviewData"]> | null {
  const sentence = String(phrase.text || "").trim();
  const words = splitWords(sentence);
  if (words.length < 2) return null;
  return {
    sentence,
    words,
    correctOrder: words.map((_, index) => index),
    meaning: pickTranslation(phrase),
    meaningSegments: Array.isArray(phrase.meaningSegments) ? phrase.meaningSegments : undefined
  };
}

function buildQuestionMeaningSegmentsFromSentence(input: {
  sentenceComponents?: SentenceEntity["components"];
  meaningSegments?: LlmGeneratedSentenceMeaningSegment[];
}) {
  const components = Array.isArray(input.sentenceComponents)
    ? [...input.sentenceComponents].sort((left, right) => left.orderIndex - right.orderIndex)
    : [];
  const meaningSegments = Array.isArray(input.meaningSegments) ? input.meaningSegments : [];
  if (components.length === 0 || meaningSegments.length === 0) return undefined;

  const componentWordSpans = components.map((component) => {
    const tokenCount = Math.max(1, splitWords(component.textSnapshot || "").length);
    return tokenCount;
  });

  const wordIndexesByComponent = new Map<number, number[]>();
  let wordCursor = 0;
  componentWordSpans.forEach((tokenCount, componentIndex) => {
    const indexes = Array.from({ length: tokenCount }, (_, offset) => wordCursor + offset);
    wordIndexesByComponent.set(componentIndex, indexes);
    wordCursor += tokenCount;
  });

  const normalizedSegments = meaningSegments
    .map((segment) => {
      const sourceComponentIndexes = Array.isArray(segment.componentIndexes)
        ? Array.from(
            new Set(
              segment.componentIndexes
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0 && value < components.length)
            )
          )
        : [];
      const sourceWordIndexes = sourceComponentIndexes.flatMap(
        (componentIndex) => wordIndexesByComponent.get(componentIndex) || []
      );
      const text = String(segment.text || "").trim();
      if (!text || sourceWordIndexes.length === 0) return null;
      return {
        text,
        sourceWordIndexes,
        sourceComponentIndexes
      };
    })
    .filter(
      (
        segment
      ): segment is ReviewMeaningSegment => Boolean(segment)
    );

  return normalizedSegments.length > 0 ? normalizedSegments : undefined;
}

function normalizeEnglishMeaning(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canUseGeneratedMeaningSegmentsForSentence(input: {
  sentenceComponents?: SentenceEntity["components"];
  translations?: string[];
  meaningSegments?: LlmGeneratedSentenceMeaningSegment[];
}) {
  const components = Array.isArray(input.sentenceComponents)
    ? [...input.sentenceComponents].sort((left, right) => left.orderIndex - right.orderIndex)
    : [];
  const meaningSegments = Array.isArray(input.meaningSegments) ? input.meaningSegments : [];
  const translations = Array.isArray(input.translations) ? input.translations : [];
  if (components.length === 0 || meaningSegments.length === 0 || translations.length === 0) return false;

  const flattenedIndexes: number[] = [];
  const normalizedMeaningFromSegments = normalizeEnglishMeaning(
    meaningSegments
      .map((segment) => String(segment?.text || "").trim())
      .filter(Boolean)
      .join(" ")
  );

  for (const segment of meaningSegments) {
    const segmentText = String(segment?.text || "").trim();
    const componentIndexes = Array.isArray(segment?.componentIndexes)
      ? segment.componentIndexes.filter((value) => Number.isInteger(value))
      : [];
    if (!segmentText || componentIndexes.length === 0) return false;

    for (const componentIndex of componentIndexes) {
      if (componentIndex < 0 || componentIndex >= components.length) return false;
      flattenedIndexes.push(componentIndex);
    }
  }

  const matchesAnyTranslation = translations.some(
    (translation) => normalizeEnglishMeaning(translation) === normalizedMeaningFromSegments
  );
  if (!matchesAnyTranslation) return false;

  const sortedIndexes = [...flattenedIndexes].sort((left, right) => left - right);
  const expectedIndexes = components.map((_, index) => index);
  if (
    sortedIndexes.length !== expectedIndexes.length ||
    sortedIndexes.some((value, index) => value !== expectedIndexes[index])
  ) {
    return false;
  }
  return true;
}

function buildPhraseGapFillReviewData(phrase: TeachingContent): NonNullable<QuestionEntity["reviewData"]> | null {
  const translation = pickTranslation(phrase);
  const sentence = String(phrase.text || "").trim();
  const words = splitWords(sentence);
  if (words.length < 2) return null;

  return {
    sentence,
    words,
    correctOrder: words.map((_, index) => index),
    meaning: translation
  };
}

function buildGapFillQuestion(
  phrase: TeachingContent,
  lessonPhrases: TeachingContent[],
  languagePool: TeachingContent[],
  reviewData: NonNullable<QuestionEntity["reviewData"]>
) {
  const blankIndex = reviewData.words.length > 2 ? 1 : 0;
  const answer = reviewData.words[blankIndex];
  const promptSentence = reviewData.words
    .map((word, index) => (index === blankIndex ? "____" : word))
    .join(" ");

  const distractorPool = lessonPhrases
    .filter((item) => item.id !== phrase.id)
    .map((item) => splitWords(item.text)[0] || item.text)
    .concat(languagePool.filter((item) => item.id !== phrase.id).map((item) => splitWords(item.text)[0] || item.text));

  const uniqueDistractors = makeUniqueOptions(distractorPool).filter(
    (item) => item.toLowerCase() !== answer.toLowerCase()
  );
  // No padding. A thin corpus -- a language's first units, where the distractor pool is a
  // handful of words -- used to be filled out with "Option 3"/"Option 4", which reads as a
  // real choice and is never the answer. Three real options, or two, beat four with a fake.
  const options = shuffle(makeUniqueOptions([answer, ...uniqueDistractors.slice(0, 3)])).slice(0, 4);

  const correctIndex = options.findIndex((item) => item.toLowerCase() === answer.toLowerCase());
  return {
    promptSentence,
    options,
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  };
}

function shuffle(values: string[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

function buildMcOptions(
  phrase: TeachingContent,
  lessonPhrases: TeachingContent[],
  languagePool: TeachingContent[]
) {
  const currentTranslation = pickTranslation(phrase);
  const distractorPool = lessonPhrases
    .filter((item) => item.id !== phrase.id)
    .map((item) => pickTranslation(item))
    .concat(languagePool.filter((item) => item.id !== phrase.id).map((item) => pickTranslation(item)));

  const uniqueDistractors = makeUniqueOptions(distractorPool).filter(
    (item) => item.toLowerCase() !== currentTranslation.toLowerCase()
  );
  const selectedDistractors = uniqueDistractors.slice(0, 3);
  const shuffled = shuffle(makeUniqueOptions([currentTranslation, ...selectedDistractors]));
  const correctIndex = shuffled.findIndex((item) => item.toLowerCase() === currentTranslation.toLowerCase());
  return {
    options: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  };
}

function buildMissingWordOptions(
  phrase: TeachingContent,
  lessonPhrases: TeachingContent[],
  languagePool: TeachingContent[]
) {
  const phraseWord = String(phrase.text || "").trim().split(/\s+/).filter(Boolean)[0] || phrase.text;
  const distractorWords = lessonPhrases
    .filter((item) => item.id !== phrase.id)
    .map((item) => String(item.text || "").trim().split(/\s+/).filter(Boolean)[0] || item.text)
    .concat(
      languagePool
        .filter((item) => item.id !== phrase.id)
        .map((item) => String(item.text || "").trim().split(/\s+/).filter(Boolean)[0] || item.text)
    );
  const uniqueDistractors = makeUniqueOptions(distractorWords).filter(
    (item) => item.toLowerCase() !== String(phraseWord).toLowerCase()
  );
  const selectedDistractors = uniqueDistractors.slice(0, 3);
  // See buildGapFillOptions: never pad the list out with placeholder words.
  const options = shuffle(makeUniqueOptions([String(phraseWord), ...selectedDistractors])).slice(0, 4);
  const correctIndex = options.findIndex((item) => item.toLowerCase() === String(phraseWord).toLowerCase());
  return { options, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
}

function buildQuestionDrafts(
  phrase: TeachingContent,
  lessonPhrases: TeachingContent[],
  languagePool: TeachingContent[],
  alreadyIntroduced = false
): StageTaggedDraft[] {
  const mc = buildMcOptions(phrase, lessonPhrases, languagePool);
  const phraseOrderReviewData = buildPhraseOrderReviewData(phrase);
  const phraseGapFillReviewData = buildPhraseGapFillReviewData(phrase);
  const spellingReviewData = buildLetterOrderReviewData({
    phraseText: phrase.text,
    meaning: pickTranslation(phrase)
  });
  const heardWordMc = buildMissingWordOptions(phrase, lessonPhrases, languagePool);
  const gapFill = phraseGapFillReviewData
    ? buildGapFillQuestion(phrase, lessonPhrases, languagePool, phraseGapFillReviewData)
    : null;
  const drafts: StageTaggedDraft[] = [];

  if (!alreadyIntroduced) {
    drafts.push(
      {
        stage: 1,
        type: "multiple-choice",
        subtype: "mc-select-translation",
        promptTemplate: "What is {phrase} in English?",
        options: mc.options,
        correctIndex: mc.correctIndex,
        explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
      },
      {
        stage: 1,
        type: "listening",
        subtype: "ls-mc-select-translation",
        promptTemplate: "Listen to {phrase} and choose the meaning.",
        options: mc.options,
        correctIndex: mc.correctIndex,
        explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
      }
    );

    if (phraseOrderReviewData) {
      drafts.push({
        stage: 1,
        type: "fill-in-the-gap",
        subtype: "fg-word-order",
        promptTemplate: "Arrange the words to mean: {meaning}",
        options: phraseOrderReviewData.words,
        correctIndex: 0,
        reviewData: phraseOrderReviewData,
        explanation: `Correct order: ${phraseOrderReviewData.words.join(" ")}`
      });
    } else if (spellingReviewData) {
      drafts.push({
        stage: 1,
        type: "fill-in-the-gap",
        subtype: "fg-letter-order",
        promptTemplate: "Arrange the letters to spell the phrase for: {meaning}",
        options: spellingReviewData.words,
        correctIndex: 0,
        reviewData: spellingReviewData,
        explanation: phrase.explanation || `Correct spelling: ${spellingReviewData.sentence}`
      });
    }

  }

  if (gapFill && phraseGapFillReviewData) {
    drafts.push(
      {
        stage: 2,
        type: "multiple-choice",
        subtype: "mc-select-missing-word",
        promptTemplate: "Select the missing word: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...phraseGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `The correct word is ${phraseGapFillReviewData.sentence}.`
      },
      {
        stage: 2,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...phraseGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `Correct completion: ${phraseGapFillReviewData.sentence}.`
      }
    );
  } else {
    drafts.push({
      stage: 2,
      type: "listening",
      subtype: "ls-mc-select-translation",
      promptTemplate: "Listen and choose the meaning of {phrase}.",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
    });
  }

  drafts.push({
    stage: 2,
    type: "speaking",
    subtype: "sp-pronunciation-compare",
    promptTemplate: "Say {phrase} aloud. Match the tutor's tone and pronunciation.",
    options: [],
    correctIndex: 0,
    explanation: phrase.explanation || `Say ${phrase.text} aloud and match the tutor reference.`
  });

  if (spellingReviewData && phraseOrderReviewData) {
    drafts.push({
      stage: 2,
      type: "fill-in-the-gap",
      subtype: "fg-letter-order",
      promptTemplate: "Arrange the letters to spell the phrase for: {meaning}",
      options: spellingReviewData.words,
      correctIndex: 0,
      reviewData: spellingReviewData,
      explanation: phrase.explanation || `Correct spelling: ${spellingReviewData.sentence}`
    });
  }

  drafts.push({
    stage: 3,
    type: "listening",
    subtype: "ls-mc-select-translation",
    promptTemplate: "Listen and choose the correct translation for {phrase}.",
    options: mc.options,
    correctIndex: mc.correctIndex,
    explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
  });

  if (phraseOrderReviewData) {
    drafts.push({
      stage: 3,
      type: "listening",
      subtype: "ls-fg-word-order",
      promptTemplate: "Listen and arrange the words to match: {meaning}",
      options: phraseOrderReviewData.words,
      correctIndex: 0,
      reviewData: phraseOrderReviewData,
      explanation: `Correct order: ${phraseOrderReviewData.words.join(" ")}`
    });
  }

  if (gapFill && phraseGapFillReviewData) {
    drafts.push(
      {
        stage: 3,
        type: "listening",
        subtype: "ls-mc-select-missing-word",
        promptTemplate: "Listen and choose the missing word: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...phraseGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `The correct word completes ${phraseGapFillReviewData.sentence}.`
      },
      {
        stage: 3,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...phraseGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `Correct completion: ${phraseGapFillReviewData.sentence}.`
      }
    );
  } else {
    drafts.push({
      stage: 3,
      type: "listening",
      subtype: "ls-mc-select-translation",
      promptTemplate: "Listen and choose the correct translation for {phrase}.",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
    });
  }

  return drafts;
}

function buildSentenceQuestionDrafts(
  sentence: TeachingContent,
  sentencePool: TeachingContent[],
  languagePool: TeachingContent[],
  options?: { reviewMode?: boolean }
): StageTaggedDraft[] {
  const mc = buildMcOptions(sentence, sentencePool, languagePool);
  const sentenceOrderReviewData = buildPhraseOrderReviewData(sentence);
  const sentenceGapFillReviewData = buildPhraseGapFillReviewData(sentence);
  const sentenceGapFill = sentenceGapFillReviewData
    ? buildGapFillQuestion(sentence, sentencePool, languagePool, sentenceGapFillReviewData)
    : null;
  const englishTranslation = pickTranslation(sentence);
  const englishTranslationWords = splitWords(englishTranslation);
  const reviewMode = options?.reviewMode === true;

  if (reviewMode) {
    const reviewDrafts: StageTaggedDraft[] = [];

    if (englishTranslationWords.length > 1) {
      reviewDrafts.push({
        stage: 1,
        type: "fill-in-the-gap",
        subtype: "fg-word-order",
        promptTemplate: "Build the English meaning of this sentence.",
        options: englishTranslationWords,
        correctIndex: 0,
        reviewData: {
          sentence: sentence.text,
          words: englishTranslationWords,
          correctOrder: englishTranslationWords.map((_, index) => index),
          meaning: englishTranslation
        },
        explanation: sentence.explanation || `Correct translation: ${englishTranslation}`
      });
    }

    if (sentenceGapFill && sentenceGapFillReviewData) {
      reviewDrafts.push({
        stage: 1,
        type: "multiple-choice",
        subtype: "mc-select-missing-word",
        promptTemplate: "Select the missing word: {sentence}",
        options: sentenceGapFill.options,
        correctIndex: sentenceGapFill.correctIndex,
        reviewData: { ...sentenceGapFillReviewData, sentence: sentenceGapFill.promptSentence },
        explanation: sentence.explanation || `The correct word completes ${sentenceGapFillReviewData.sentence}.`
      });
      reviewDrafts.push({
        stage: 2,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: sentenceGapFill.options,
        correctIndex: sentenceGapFill.correctIndex,
        reviewData: { ...sentenceGapFillReviewData, sentence: sentenceGapFill.promptSentence },
        explanation: sentence.explanation || `Correct completion: ${sentenceGapFillReviewData.sentence}.`
      });
      reviewDrafts.push({
        stage: 3,
        type: "listening",
        subtype: "ls-mc-select-missing-word",
        promptTemplate: "Listen and choose the missing word: {sentence}",
        options: sentenceGapFill.options,
        correctIndex: sentenceGapFill.correctIndex,
        reviewData: { ...sentenceGapFillReviewData, sentence: sentenceGapFill.promptSentence },
        explanation: sentence.explanation || `The correct word completes ${sentenceGapFillReviewData.sentence}.`
      });
      reviewDrafts.push({
        stage: 3,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: sentenceGapFill.options,
        correctIndex: sentenceGapFill.correctIndex,
        reviewData: { ...sentenceGapFillReviewData, sentence: sentenceGapFill.promptSentence },
        explanation: sentence.explanation || `Correct completion: ${sentenceGapFillReviewData.sentence}.`
      });
    }

    if (sentenceOrderReviewData) {
      reviewDrafts.push({
        stage: 2,
        type: "fill-in-the-gap",
        subtype: "fg-word-order",
        promptTemplate: "Arrange the words to mean: {meaning}",
        options: sentenceOrderReviewData.words,
        correctIndex: 0,
        reviewData: sentenceOrderReviewData,
        explanation: `Correct order: ${sentenceOrderReviewData.words.join(" ")}`
      });
      reviewDrafts.push({
        stage: 3,
        type: "fill-in-the-gap",
        subtype: "fg-word-order",
        promptTemplate: "Arrange the words to mean: {meaning}",
        options: sentenceOrderReviewData.words,
        correctIndex: 0,
        reviewData: sentenceOrderReviewData,
        explanation: `Correct order: ${sentenceOrderReviewData.words.join(" ")}`
      });
    }

    reviewDrafts.push({
      stage: 3,
      type: "speaking",
      subtype: "sp-pronunciation-compare",
      promptTemplate: "Say this sentence aloud. Match the tutor's tone and rhythm.",
      options: [],
      correctIndex: 0,
      explanation: sentence.explanation || `Say ${sentence.text} aloud and match the tutor reference.`
    });

    return reviewDrafts;
  }

  const drafts: StageTaggedDraft[] = [
    ...(englishTranslationWords.length > 1
      ? [{
          stage: 1 as const,
          type: "fill-in-the-gap" as const,
          subtype: "fg-word-order" as const,
          promptTemplate: "Build the English meaning of this sentence.",
          options: englishTranslationWords,
          correctIndex: 0,
          reviewData: {
            sentence: sentence.text,
            words: englishTranslationWords,
            correctOrder: englishTranslationWords.map((_, index) => index),
            meaning: englishTranslation
          },
          explanation: sentence.explanation || `Correct translation: ${englishTranslation}`
        }]
      : []),
    {
      stage: 2,
      type: "multiple-choice",
      subtype: "mc-select-translation",
      promptTemplate: "What does this sentence mean in English?",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: sentence.explanation || `The correct meaning is ${pickTranslation(sentence)}.`
    },
    {
      stage: 2,
      type: "listening",
      subtype: "ls-mc-select-translation",
      promptTemplate: "Listen and choose the correct translation for {phrase}.",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: sentence.explanation || `The correct meaning is ${pickTranslation(sentence)}.`
    },
    {
      stage: 3,
      type: "multiple-choice",
      subtype: "mc-select-translation",
      promptTemplate: "What does this sentence mean in English?",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: sentence.explanation || `The correct meaning is ${pickTranslation(sentence)}.`
    },
    {
      stage: 3,
      type: "listening",
      subtype: "ls-mc-select-translation",
      promptTemplate: "Listen and choose the correct translation for {phrase}.",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: sentence.explanation || `The correct meaning is ${pickTranslation(sentence)}.`
    },
    {
      stage: 3,
      type: "speaking",
      subtype: "sp-pronunciation-compare",
      promptTemplate: "Say this sentence aloud. Match the tutor's tone and rhythm.",
      options: [],
      correctIndex: 0,
      explanation: sentence.explanation || `Say ${sentence.text} aloud and match the tutor reference.`
    }
  ];

  if (sentenceOrderReviewData) {
    drafts.push({
      stage: 2,
      type: "fill-in-the-gap",
      subtype: "fg-word-order",
      promptTemplate: "Arrange the words to mean: {meaning}",
      options: sentenceOrderReviewData.words,
      correctIndex: 0,
      reviewData: sentenceOrderReviewData,
      explanation: `Correct order: ${sentenceOrderReviewData.words.join(" ")}`
    });
    drafts.push({
      stage: 3,
      type: "fill-in-the-gap",
      subtype: "fg-word-order",
      promptTemplate: "Arrange the words to mean: {meaning}",
      options: sentenceOrderReviewData.words,
      correctIndex: 0,
      reviewData: sentenceOrderReviewData,
      explanation: `Correct order: ${sentenceOrderReviewData.words.join(" ")}`
    });
  }

  return drafts;
}

function filterDraftsForLesson(
  lesson: Pick<LessonEntity, "kind">,
  sourceKind: "word" | "expression" | "sentence",
  drafts: StageTaggedDraft[]
) {
  if (lesson.kind !== "review") return drafts;
  if (sourceKind === "sentence") return drafts;
  return drafts.filter((draft) => draft.subtype !== "mc-select-translation");
}

function normalizeMatchingWordPartOfSpeech(value: string) {
  return normalize(value).split(/[^a-z]+/).filter(Boolean)[0] || "";
}

function getMatchingWordPosBucket(word: WordEntity) {
  const normalizedPos = normalizeMatchingWordPartOfSpeech(word.partOfSpeech);
  if (normalizedPos === "noun" || normalizedPos === "pronoun") return 0;
  if (!normalizedPos || normalizedPos === "unknown") return 1;
  return 2;
}

function buildMatchingImageSnapshot(word: WordEntity, translation: string) {
  if (word.image?.url) {
    return {
      imageAssetId: String(word.image.imageAssetId || ""),
      url: String(word.image.url || ""),
      thumbnailUrl: String(word.image.thumbnailUrl || ""),
      altText: String(word.image.altText || translation || word.text || "Image match")
    };
  }
  return null;
}

function hashMatchingSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type MatchingWordCandidate = {
  word: WordEntity;
  translation: string;
  source: "lesson" | "language";
  score: number;
};

function buildMatchingWordCandidates(input: {
  lessonWords: WordEntity[];
  languageWords: WordEntity[];
  preferImages?: boolean;
}) {
  const lessonIds = new Set(input.lessonWords.map((item) => item.id));
  const seenTexts = new Set<string>();
  const seenPairs = new Set<string>();
  const dedupeAndRank = (word: WordEntity, source: "lesson" | "language"): MatchingWordCandidate | null => {
    if (source === "language" && word.status !== "published") return null;
    const text = String(word.text || "").trim();
    const translation = pickTranslation(word);
    const normalizedText = normalize(text);
    const normalizedTranslation = normalize(translation);
    if (!word.id || !normalizedText || !normalizedTranslation) return null;
    const pairKey = `${normalizedText}:${normalizedTranslation}`;
    if (seenTexts.has(normalizedText) || seenPairs.has(pairKey)) return null;
    const posBucket = getMatchingWordPosBucket(word);
    const imagePenalty = input.preferImages && !word.image?.url ? 1 : 0;
    const sourcePenalty = source === "lesson" ? 0 : 10;
    seenTexts.add(normalizedText);
    seenPairs.add(pairKey);
    return {
      word,
      translation,
      source,
      score: sourcePenalty + posBucket * 3 + imagePenalty
    };
  };

  const lessonCandidates = input.lessonWords
    .map((word) => dedupeAndRank(word, "lesson"))
    .filter((item): item is MatchingWordCandidate => Boolean(item))
    .sort((left, right) => left.score - right.score || left.word.difficulty - right.word.difficulty || left.word.text.localeCompare(right.word.text));

  const languageCandidates = input.languageWords
    .filter((word) => !lessonIds.has(word.id))
    .map((word) => dedupeAndRank(word, "language"))
    .filter((item): item is MatchingWordCandidate => Boolean(item))
    .sort((left, right) => left.score - right.score || left.word.difficulty - right.word.difficulty || left.word.text.localeCompare(right.word.text));

  return { lessonCandidates, languageCandidates };
}

function selectMatchingWords(input: {
  lessonWords: WordEntity[];
  languageWords: WordEntity[];
  maxPairs: number;
  preferImages?: boolean;
}) {
  const { lessonCandidates, languageCandidates } = buildMatchingWordCandidates(input);
  const selected: MatchingWordCandidate[] = [];
  const lessonTargetCount = languageCandidates.length > 0 ? Math.min(3, lessonCandidates.length) : Math.min(input.maxPairs, lessonCandidates.length);

  selected.push(...lessonCandidates.slice(0, lessonTargetCount));

  if (selected.length < input.maxPairs && languageCandidates.length > 0) {
    const languageNeed = Math.max(1, input.maxPairs - selected.length);
    selected.push(...languageCandidates.slice(0, languageNeed));
  }

  const remainingLanguageCandidates = languageCandidates.filter(
    (candidate) => !selected.some((item) => item.word.id === candidate.word.id)
  );
  if (selected.length < input.maxPairs) {
    for (const candidate of [...lessonCandidates.slice(lessonTargetCount), ...remainingLanguageCandidates]) {
      if (selected.some((item) => item.word.id === candidate.word.id)) continue;
      selected.push(candidate);
      if (selected.length >= input.maxPairs) break;
    }
  }

  return selected.slice(0, input.maxPairs);
}

function buildWordMatchingQuestionDraft(input: {
  lessonId: string;
  subtype: "mt-match-image" | "mt-match-translation";
  lessonWords: WordEntity[];
  languageWords: WordEntity[];
}) {
  const matchingPairs: NonNullable<QuestionEntity["interactionData"]>["matchingPairs"] = [];
  const usedContentIds = new Set<string>();
  const usedTranslations = new Set<string>();
  const preferImages = input.subtype === "mt-match-image";
  const selectedWords = selectMatchingWords({
    lessonWords: input.lessonWords,
    languageWords: input.languageWords,
    maxPairs: 4,
    preferImages
  });

  for (const item of selectedWords) {
    const translation = item.translation;
    const translationKey = normalize(translation);
    if (!item.word.id || !translationKey || usedContentIds.has(item.word.id) || usedTranslations.has(translationKey)) {
      continue;
    }

    matchingPairs.push({
      pairId: `word-${item.word.id}-${matchingPairs.length + 1}`,
      contentType: "word",
      contentId: item.word.id,
      contentText: item.word.text,
      translationIndex: 0,
      translation,
      image: preferImages ? buildMatchingImageSnapshot(item.word, translation) : null
    });
    usedContentIds.add(item.word.id);
    usedTranslations.add(translationKey);

    if (matchingPairs.length >= 4) break;
  }

  if (matchingPairs.length < 4) return null;
  const primaryPair = matchingPairs[0];
  if (!primaryPair.contentId || !primaryPair.contentType) return null;
  const relatedSourceRefs = matchingPairs
    .flatMap((pair) => (pair.contentId && pair.contentType ? [{ type: pair.contentType, id: pair.contentId }] : []));
  if (relatedSourceRefs.length < 4) return null;

  return {
    lessonId: input.lessonId,
    sourceType: primaryPair.contentType,
    sourceId: primaryPair.contentId,
    relatedSourceRefs,
    translationIndex: primaryPair.translationIndex,
    type: "matching" as const,
    subtype: input.subtype,
    promptTemplate:
      input.subtype === "mt-match-image"
        ? "Match each word to the correct image."
        : "Match each word to the correct translation.",
    options: [],
    correctIndex: 0,
    interactionData: { matchingPairs },
    explanation:
      input.subtype === "mt-match-image"
        ? "Match each word to the correct picture."
        : "Match each word to its English meaning.",
    status: "draft" as const
  };
}

function buildExistingLessonSummary(lessons: LessonEntity[]) {
  return lessons
    .slice(0, 12)
    .map((lesson, index) => {
      const topics = Array.isArray(lesson.topics) && lesson.topics.length > 0 ? lesson.topics.join(", ") : "none";
      const stageTitles = Array.isArray(lesson.stages)
        ? lesson.stages
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((stage) => stage.title)
            .filter(Boolean)
            .join(" | ")
        : "";
      return `${index + 1}. ${lesson.title} — ${lesson.description || "No description"} — topics: ${topics}${
        stageTitles ? ` — stages: ${stageTitles}` : ""
      }`;
    })
    .join("\n");
}

function cloneStage(stage: LessonStage): LessonStage {
  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    orderIndex: stage.orderIndex,
    blocks: [...stage.blocks]
  };
}

function buildDefaultRefactorStages(lessonId: string): LessonStage[] {
  return buildPedagogicalStages((index) => `${lessonId}-stage-${index + 1}`);
}

function normalize(value: string) {
  return String(value || "").trim().toLowerCase();
}

// splitExpressionIntoWordTokens / isSentenceLikeExpressionText / MAX_FIXED_EXPRESSION_WORDS
// now live in services/content/expressionShape.ts so this file and
// SentenceDraftPersistenceService cannot drift apart on what counts as a real expression.

function splitExpressionIntoNormalizedWordTokens(value: string) {
  return splitExpressionIntoWordTokens(value).map((item) => normalize(item)).filter(Boolean);
}

// A genuine fixed expression is a short reusable chunk: a greeting, idiom, or set phrase.
// Weaker local models sometimes mark a whole generated SENTENCE as a fixed expression
// component, which then gets persisted as an expression and pollutes the expression
// inventory (e.g. "Mo fẹ́ rà, owó mi ni." or "Ọkùnrin kan ń bọ̀."). Detect the
// sentence-shaped ones so we can decline to store them as expressions. The signals are
// tuned to reject full sentences while keeping legitimately short set phrases such as
// "Eló ni?" (trailing "?" is fine) and "Rárá, mi ò" (a short two-chunk phrase).

/**
 * An "explanation" that is the item itself or one of its own translations echoed back teaches
 * nothing while reading on screen as a real teaching note, and the canned fallback the player
 * shows in its place is no worse. Reject those, and anything too short to be a sentence.
 */
function isUsableTeachingExplanation(explanation: string, text: string, translations: string[]) {
  const trimmed = String(explanation || "").trim();
  if (trimmed.length < 12) return false;
  if (trimmed.toLowerCase() === String(text || "").trim().toLowerCase()) return false;
  return !translations.some((item) => String(item || "").trim().toLowerCase() === trimmed.toLowerCase());
}

function normalizePlanItems(values: unknown) {
  return Array.isArray(values) ? values.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function parsePlanTargetLine(value: string): LlmUnitPlanTarget | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [textPart, translationsPart] = raw.split(/\s*=\s*/, 2);
  const text = String(textPart || "").trim();
  if (!text) return null;
  const translations = translationsPart
    ? translationsPart
        .split(/\s*[|/]\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return { text, translations };
}

function normalizePlanTargets(values: unknown): LlmUnitPlanTarget[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: LlmUnitPlanTarget[] = [];

  for (const value of values) {
    const target =
      typeof value === "string"
        ? parsePlanTargetLine(value)
        : value && typeof value === "object"
          ? {
              text: String((value as { text?: unknown }).text || "").trim(),
              translations: normalizePlanItems((value as { translations?: unknown }).translations)
            }
          : null;
    if (!target?.text) continue;
    const key = normalize(target.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      text: target.text,
      translations: Array.isArray(target.translations)
        ? target.translations.map((item) => String(item || "").trim()).filter(Boolean)
        : []
    });
  }

  return result;
}

function summarizeReviewInventoryEntries<T extends { text: string; translations: string[] }>(
  items: T[],
  limit: number
) {
  return Array.from(
    new Map(
      items
        .map((item) => [normalize(item.text), item] as const)
        .filter(([key]) => Boolean(key))
    ).values()
  )
    .slice(0, limit)
    .map((item) => `${item.text} = ${item.translations.slice(0, 2).join(" / ")}`)
    .join(" | ");
}

function summarizeReviewSentenceExamples(sentences: SentenceEntity[], limit: number) {
  return Array.from(
    new Map(
      sentences
        .map((sentence) => [normalize(sentence.text), sentence] as const)
        .filter(([key]) => Boolean(key))
    ).values()
  )
    .slice(0, limit)
    .map((sentence) => {
      const translation = String(sentence.translations?.[0] || "").trim();
      return translation ? `${sentence.text} => ${translation}` : sentence.text;
    })
    .join(" | ");
}

/**
 * Route each plan target to the field its token count demands.
 *
 * The prompt asks for single-token items in targetWords and multi-word phrases in
 * targetExpressions, and the models ignore it often enough to matter: a phrase parked in
 * targetWords is later looked up as a word, so it never matches the expression inventory
 * and the lesson silently loses its real target. Token count is not a matter of opinion,
 * so it is settled here rather than asked for again.
 */
/** Allowed-inventory entries deduped by text, first occurrence winning. */
function dedupeAllowedByText(items: Array<{ text: string; translations: string[] }>) {
  return Array.from(new Map(items.map((item) => [normalize(item.text), item] as const)).values());
}

function routePlanTargetsByShape(
  words: LlmUnitPlanTarget[],
  expressions: LlmUnitPlanTarget[]
): { targetWords: LlmUnitPlanTarget[]; targetExpressions: LlmUnitPlanTarget[] } {
  const isMultiWord = (target: LlmUnitPlanTarget) =>
    splitExpressionIntoWordTokens(target.text).length > 1;
  const dedupe = (items: LlmUnitPlanTarget[]) =>
    Array.from(new Map(items.map((item) => [normalize(item.text), item] as const)).values());

  return {
    targetWords: dedupe([...words.filter((t) => !isMultiWord(t)), ...expressions.filter((t) => !isMultiWord(t))]),
    targetExpressions: dedupe([...expressions.filter(isMultiWord), ...words.filter(isMultiWord)])
  };
}

function normalizeUnitPlanLesson(lesson: LlmUnitPlanLesson): LlmUnitPlanLesson {
  const routed = routePlanTargetsByShape(
    normalizePlanTargets((lesson as { targetWords?: unknown }).targetWords),
    normalizePlanTargets((lesson as { targetExpressions?: unknown }).targetExpressions)
  );
  return {
    title: String(lesson.title || "").trim(),
    description: String(lesson.description || "").trim() || undefined,
    objectives: normalizePlanItems(lesson.objectives),
    conversationGoal: String(lesson.conversationGoal || "").trim(),
    situations: normalizePlanItems(lesson.situations),
    sentenceGoals: normalizePlanItems(lesson.sentenceGoals),
    focusSummary: String(lesson.focusSummary || "").trim() || undefined,
    targetWords: routed.targetWords,
    targetExpressions: routed.targetExpressions,
    // Absent stays absent: the lesson then follows the unit's setting, as every plan written
    // before this field did. Only an explicit number overrides it.
    sentences: normalizeLessonSentenceCount(lesson.sentences)
  };
}

/** A per-lesson sentence count from a plan: a whole number 0..MAX, or undefined for "as the unit". */
function normalizeLessonSentenceCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!Number.isFinite(Number(value))) return undefined;
  return clampSentencesPerLesson(Number(value));
}

function tokenizeReviewPlanKeywords(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          normalize(value)
            .replace(/[^a-z0-9\s-]/g, " ")
            .split(/\s+/)
            .map((item) => item.trim())
            .filter((item) => item.length >= 3)
        )
    )
  );
}

function buildReviewSentenceSearchText(sentence: SentenceEntity) {
  return normalize(
    [
      sentence.text,
      ...(Array.isArray(sentence.translations) ? sentence.translations : []),
      sentence.literalTranslation,
      sentence.usageNotes,
      sentence.explanation,
      ...(Array.isArray(sentence.components) ? sentence.components.map((item) => item.textSnapshot || "") : [])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function selectReviewAnchorSentencesForLesson(input: {
  lesson: LlmUnitPlanLesson;
  knownSentences: SentenceEntity[];
  sentenceUsageCounts: Map<string, number>;
  maxAnchors?: number;
}) {
  const normalizedLesson = normalizeUnitPlanLesson(input.lesson);
  const keywords = tokenizeReviewPlanKeywords([
    normalizedLesson.title,
    normalizedLesson.description || "",
    normalizedLesson.focusSummary || "",
    normalizedLesson.conversationGoal,
    ...normalizedLesson.objectives,
    ...normalizedLesson.situations,
    ...normalizedLesson.sentenceGoals
  ]);

  const ranked = input.knownSentences
    .map((sentence) => {
      const haystack = buildReviewSentenceSearchText(sentence);
      const keywordMatches = keywords.filter((keyword) => haystack.includes(keyword)).length;
      const translation = String(sentence.translations?.[0] || "").trim();
      const translationWordCount = splitWords(translation).length;
      return {
        sentence,
        keywordMatches,
        usageCount: input.sentenceUsageCounts.get(sentence.id) || 0,
        translationWordCount
      };
    })
    .sort((left, right) => {
      if (right.keywordMatches !== left.keywordMatches) return right.keywordMatches - left.keywordMatches;
      if (left.usageCount !== right.usageCount) return left.usageCount - right.usageCount;
      if (right.translationWordCount !== left.translationWordCount) return right.translationWordCount - left.translationWordCount;
      return left.sentence.text.localeCompare(right.sentence.text);
    });

  const targetAnchorCount = Math.max(4, Math.min(input.maxAnchors || REVIEW_ANCHOR_SENTENCES_PER_LESSON, ranked.length));
  const preferred = ranked.filter((item) => item.keywordMatches > 0);
  const fallback = ranked.filter((item) => item.keywordMatches === 0);
  return [...preferred, ...fallback].slice(0, targetAnchorCount).map((item) => item.sentence);
}

function buildAutoInsertedReviewLessonSequence(
  planLessons: LlmUnitPlanLesson[],
  options?: { autoInsertReviewLessons?: boolean }
): UnitPlanSequenceLesson[] {
  const autoInsertReviewLessons = options?.autoInsertReviewLessons !== false;
  const sequence: UnitPlanSequenceLesson[] = [];
  const recentCoreLessons: Array<{ index: number; plan: LlmUnitPlanLesson }> = [];

  const buildReviewPlan = (coreLessons: Array<{ index: number; plan: LlmUnitPlanLesson }>): UnitPlanSequenceLesson | null => {
    if (coreLessons.length < 2) return null;
    const first = coreLessons[0];
    const second = coreLessons[1];
    const titleA = String(first.plan.title || "").trim();
    const titleB = String(second.plan.title || "").trim();
    const focusA = String(first.plan.focusSummary || "").trim();
    const focusB = String(second.plan.focusSummary || "").trim();

    return {
      title: `Review: ${titleA} + ${titleB}`,
      description: `Review and apply the key words, expressions, and sentence patterns from ${titleA} and ${titleB}.`,
      objectives: [
        `Review the main targets from ${titleA}.`,
        `Review the main targets from ${titleB}.`,
        "Use known content in fresh sentence exercises without introducing arbitrary new targets."
      ],
      conversationGoal: `Review and reuse the practical language from ${titleA} and ${titleB} in new situations.`,
      situations: [
        `A short review conversation that combines ${titleA} and ${titleB}.`,
        "Fresh practice using already seen language in slightly different real-life situations."
      ],
      sentenceGoals: [
        ...normalizePlanItems(first.plan.sentenceGoals).slice(0, 1),
        ...normalizePlanItems(second.plan.sentenceGoals).slice(0, 1),
        "Use familiar language in a new review sentence."
      ],
      focusSummary: [focusA, focusB].filter(Boolean).join(" + ") || `Review of ${titleA} and ${titleB}`,
      lessonMode: "review",
      sourceCoreLessonIndexes: coreLessons.map((item) => item.index)
    };
  };

  for (const [index, rawLesson] of planLessons.entries()) {
    const lesson = normalizeUnitPlanLesson(rawLesson);
    sequence.push({
      ...lesson,
      lessonMode: "core",
      sourceCoreLessonIndexes: [index]
    });
    if (!autoInsertReviewLessons) continue;
    recentCoreLessons.push({ index, plan: lesson });

    if (recentCoreLessons.length === 2) {
      const reviewLesson = buildReviewPlan(recentCoreLessons);
      if (reviewLesson) {
        sequence.push(reviewLesson);
      }
      recentCoreLessons.length = 0;
    }
  }

  return sequence;
}

const WEAK_STANDALONE_WORDS_BY_LANGUAGE: Record<LessonEntity["language"], Set<string>> = {
  yoruba: new Set(["a", "ẹ", "e", "o", "ó", "ni"]),
  igbo: new Set(["m", "i", "ị", "o", "ka", "na"]),
  hausa: new Set(["na", "ce", "ta", "ya", "su", "mu"]),
  pidgin: new Set(["de", "na", "go", "don", "no", "you", "me", "am"])
};

const WEAK_TRANSLATION_HINTS = new Set([
  "a",
  "an",
  "the",
  "i",
  "we",
  "you",
  "he",
  "she",
  "they",
  "it",
  "my",
  "your",
  "his",
  "her",
  "our",
  "their",
  "mine",
  "yours",
  "hers",
  "ours",
  "theirs",
  "am",
  "is",
  "are",
  "marker",
  "particle"
]);

const FUNCTION_WORD_FOCUS_HINTS = [
  "pronoun",
  "pronouns",
  "subject pronoun",
  "subject pronouns",
  "particle",
  "particles",
  "grammar",
  "function word",
  "function words"
];

function lessonExplicitlyTargetsFunctionWords(planTexts: string[]) {
  const joined = normalize(planTexts.join(" "));
  return FUNCTION_WORD_FOCUS_HINTS.some((hint) => joined.includes(hint));
}

function tokenizeNormalizedText(value: string) {
  return normalize(value)
    .replace(/[.,:;'"()!?&/\-[\]{}]+/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function planContainsLexicalTerm(planTokens: Set<string>, term: string) {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm || WEAK_TRANSLATION_HINTS.has(normalizedTerm)) return false;
  if (planTokens.has(normalizedTerm)) return true;
  return planTokens.has(`${normalizedTerm}s`) ||
    planTokens.has(`${normalizedTerm}ed`) ||
    planTokens.has(`${normalizedTerm}ing`);
}

function translationTargetTerms(translations: string[]) {
  const terms = new Set<string>();
  for (const translation of translations) {
    const normalized = normalize(translation);
    if (!normalized) continue;
    terms.add(normalized);
    if (normalized.startsWith("to ")) terms.add(normalized.slice(3).trim());
    for (const token of tokenizeNormalizedText(normalized)) {
      if (token.length >= 2) terms.add(token);
    }
  }
  return Array.from(terms);
}

function lessonExplicitlyTargetsShortLexicalWord(input: {
  word: WordEntity;
  planTexts: string[];
}) {
  const normalizedText = normalize(input.word.text);
  if (normalizedText.length !== 2) return false;
  const planTokens = new Set(tokenizeNormalizedText(input.planTexts.join(" ")));
  if (planTokens.size === 0) return false;
  return translationTargetTerms(input.word.translations || []).some((term) =>
    planContainsLexicalTerm(planTokens, term)
  );
}

function shouldTeachStandaloneWord(input: {
  language: LessonEntity["language"];
  word: WordEntity;
  planTexts: string[];
}) {
  const normalizedText = normalize(input.word.text);
  if (!normalizedText) return false;

  const weakWords = WEAK_STANDALONE_WORDS_BY_LANGUAGE[input.language] || new Set<string>();
  const translationHints = (input.word.translations || []).map((item) => normalize(item)).filter(Boolean);
  const looksWeakByTranslation = translationHints.some((item) => WEAK_TRANSLATION_HINTS.has(item));
  const explicitlyTargetsShortLexicalWord = lessonExplicitlyTargetsShortLexicalWord({
    word: input.word,
    planTexts: input.planTexts
  });
  const looksWeakByShape = normalizedText.length <= 2 && !explicitlyTargetsShortLexicalWord;
  const isWeakStandalone =
    weakWords.has(normalizedText) ||
    looksWeakByTranslation ||
    looksWeakByShape;

  if (!isWeakStandalone) return true;
  return lessonExplicitlyTargetsFunctionWords(input.planTexts);
}

function sentenceDraftUsesLockedTarget(
  draft: LlmGeneratedSentence,
  lockedTargets: {
    words: Set<string>;
    expressions: Set<string>;
  }
) {
  const componentKeys = draft.components.map((component) => normalize(component.text)).filter(Boolean);
  const componentKeySet = new Set(componentKeys);
  const normalizedSentence = normalize(draft.text);

  const usesLockedWord = draft.components.some((component) => {
    const normalizedText = normalize(component.text);
    return component.type === "word" && lockedTargets.words.has(normalizedText);
  });
  if (usesLockedWord) return true;

  for (const expression of lockedTargets.expressions) {
    if (normalizedSentence.includes(expression)) return true;
    const expressionTokens = splitExpressionIntoNormalizedWordTokens(expression);
    if (expressionTokens.length > 0 && expressionTokens.every((token) => componentKeySet.has(token))) {
      return true;
    }
  }

  return false;
}

function looksEnglishLikeText(value: string) {
  const trimmed = normalizeEnglishValidationText(value).trim();
  return Boolean(trimmed) && /^[A-Za-z0-9\s.,:;'"()!?&/+-]+$/.test(trimmed);
}

function normalizeEnglishValidationText(value: string) {
  return String(value || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[–—]/g, "-");
}

function stripQuotedTargetLanguageTerms(value: string) {
  // The trailing lookahead must allow end-of-string as well as punctuation. Writing `$`
  // inside the character class matches a literal dollar sign, which left a quoted term at
  // the very end of a field unstripped and failed it on its diacritics.
  return normalizeEnglishValidationText(value)
    .replace(/(^|[\s(])'[^'\n]+'(?=$|[\s).,:;!?/-])/g, "$1TERM")
    .replace(/(^|[\s(])\"[^\"\n]+\"(?=$|[\s).,:;!?/-])/g, "$1TERM");
}

function looksEnglishLikeMetadataText(value: string) {
  const trimmed = stripQuotedTargetLanguageTerms(value).trim();
  return Boolean(trimmed) && /^[A-Za-z0-9\s.,:;'"()!?&/+-]+$/.test(trimmed);
}

// Weaker local models write sentenceGoals as a gloss pair -- "<target sentence> (<English
// meaning>)" -- roughly half the time no matter how the rule is phrased, and a unit needs
// every goal clean at once, so regenerating the whole plan effectively never converges.
// The English meaning is already sitting in the parentheses, so recover it instead of
// spending another attempt. Only applied to goals that fail validation, so an already-valid
// goal can never be altered.
function repairSentenceGoal(value: string) {
  const trimmed = normalizeEnglishValidationText(value).trim().replace(/^['"]+|['"]+$/g, "").trim();
  if (!trimmed || looksEnglishLikeText(trimmed)) return trimmed;

  const parentheticals = [...trimmed.matchAll(/\(([^()]+)\)/g)].map((match) => match[1].trim());
  for (let index = parentheticals.length - 1; index >= 0; index -= 1) {
    const candidate = parentheticals[index].replace(/^['"]+|['"]+$/g, "").trim();
    if (candidate.length >= 8 && candidate.includes(" ") && looksEnglishLikeText(candidate)) {
      return candidate;
    }
  }

  return trimmed;
}

// The prompt asks for target-language forms in English metadata to be wrapped in ASCII
// quotes, but models reach for parentheses just as readily -- "Greet the vendor (Ẹ káàárọ̀)".
// Both are legitimate marking, so rewrite the parenthesised form into the quoted form the
// validator already understands. English asides such as "(politely)" are left alone.
function markParentheticalTargetTerms(value: string) {
  return normalizeEnglishValidationText(value).replace(/\(([^()]+)\)/g, (match, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed || looksEnglishLikeText(trimmed)) return match;
    return `'${trimmed}'`;
  });
}

// The mirror image of markParentheticalTargetTerms: the model writes the target-language
// form bare and puts the ENGLISH gloss in the parentheses -- "using the yìí (this) modifier"
// or "Introduce Níbo ni (Where is)". The bare term is still identifiable because it carries
// non-ASCII letters, so quote it the way the prompt asks for. Chunks that are already quoted
// are left alone, and pure-ASCII words are never touched.
function quoteBareTargetTerms(value: string) {
  return normalizeEnglishValidationText(value).replace(/[^\s]+/g, (chunk) => {
    const lead = chunk.match(/^[("']*/)?.[0] || "";
    const tail = chunk.match(/[)"'.,:;!?]*$/)?.[0] || "";
    const core = chunk.slice(lead.length, chunk.length - tail.length);
    if (!core) return chunk;
    // Already delimited, or plain ASCII -> nothing to do.
    if (lead.includes("'") || lead.includes("\"") || tail.includes("'") || tail.includes("\"")) return chunk;
    if (!/[^ -]/.test(core)) return chunk;
    return `${lead}'${core}'${tail}`;
  });
}

function repairMetadataText(value: string) {
  const trimmed = normalizeEnglishValidationText(value).trim();
  if (!trimmed || looksEnglishLikeMetadataText(trimmed)) return trimmed;
  const marked = markParentheticalTargetTerms(trimmed).trim();
  if (looksEnglishLikeMetadataText(marked)) return marked;
  return quoteBareTargetTerms(marked).trim();
}

function repairUnitPlanLessons(lessons: LlmUnitPlanLesson[]): LlmUnitPlanLesson[] {
  return lessons.map((lesson) => {
    const source = lesson as {
      title?: unknown;
      description?: unknown;
      focusSummary?: unknown;
      objectives?: unknown;
      sentenceGoals?: unknown;
      situations?: unknown;
      conversationGoal?: unknown;
    };
    const repaired: Record<string, unknown> = {};

    if (Array.isArray(source.sentenceGoals)) {
      repaired.sentenceGoals = source.sentenceGoals.map((goal) => repairSentenceGoal(String(goal || "")));
    }
    if (Array.isArray(source.objectives)) {
      repaired.objectives = source.objectives.map((item) => repairMetadataText(String(item || "")));
    }
    if (Array.isArray(source.situations)) {
      repaired.situations = source.situations.map((item) => repairMetadataText(String(item || "")));
    }
    if (typeof source.conversationGoal === "string") {
      repaired.conversationGoal = repairMetadataText(source.conversationGoal);
    }
    // title/description/focusSummary are validated with the same English-like rule, so they
    // need the same repair. Leaving description out is why "description not English-like"
    // survived every retry while the other fields were being fixed.
    if (typeof source.title === "string") {
      repaired.title = repairMetadataText(source.title);
    }
    if (typeof source.description === "string") {
      repaired.description = repairMetadataText(source.description);
    }
    if (typeof source.focusSummary === "string") {
      repaired.focusSummary = repairMetadataText(source.focusSummary);
    }

    return { ...lesson, ...repaired };
  });
}

function normalizeThemeToken(value: string) {
  let token = normalizeEnglishValidationText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!token) return "";
  if (token.endsWith("ied") && token.length > 5) token = `${token.slice(0, -3)}y`;
  else if (token.endsWith("ing") && token.length > 5) token = token.slice(0, -3);
  else if (token.endsWith("ed") && token.length > 4) token = token.slice(0, -2);

  if (token.endsWith("es") && token.length > 4) token = token.slice(0, -2);
  else if (token.endsWith("s") && token.length > 4) token = token.slice(0, -1);

  return token;
}

function extractThemeTerms(values: string[]) {
  const terms = new Set<string>();
  for (const value of values) {
    const tokens = normalizeEnglishValidationText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/-/g, " ")
      .split(/\s+/)
      .map((item) => normalizeThemeToken(item))
      .filter(Boolean);
    for (const token of tokens) terms.add(token);
  }
  return terms;
}

function countThemeMatches(values: string[], anchors: string[]) {
  if (anchors.length === 0) return 0;
  const haystackTerms = extractThemeTerms(values);
  let count = 0;
  for (const anchor of anchors) {
    const anchorTerms = Array.from(extractThemeTerms([anchor]));
    if (anchorTerms.some((term) => haystackTerms.has(term))) count += 1;
  }
  return count;
}

function buildUnitPlanRetryInstruction(input: {
  validation: UnitPlanValidationResult;
  themeAnchors: string[];
}) {
  const lines = [
    buildRetryInstruction(input.validation.reasons),
    "Keep title, description, objectives, conversationGoal, situations, and focusSummary in English.",
    "If you mention target-language forms in English metadata, keep the surrounding sentence English and wrap the target-language form in simple ASCII quotes.",
    "sentenceGoals must be English meaning statements only. Do not include target-language text, gloss pairs, or parenthesized target-language examples in sentenceGoals.",
    "Use plain ASCII apostrophes and punctuation in English metadata.",
    // Naming only the outstanding failures makes weaker models narrow onto those fields and
    // return the untouched ones empty, which trades one failure reason for two new ones.
    "Return every field for every lesson, including the ones that were already correct. Do not leave conversationGoal, situations, sentenceGoals, focusSummary, objectives, or description empty on any lesson.",
    "Fix only what is listed below. Keep everything else from the previous attempt unchanged."
  ];

  if (input.themeAnchors.length > 0) {
    lines.push(`Make every lesson clearly align with the unit theme using words tied to these anchors: ${input.themeAnchors.join(", ")}.`);
  }

  for (const lesson of input.validation.details.invalidLessons.slice(0, 3)) {
    lines.push(`Lesson ${lesson.index + 1} "${lesson.title}": fix ${lesson.reasons.join(", ")}.`);
  }

  return lines.join(" ");
}

function validateUnitPlanLessons(
  lessons: LlmUnitPlanLesson[],
  input: {
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    lessonCount: number;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    themeAnchors?: string[];
    /**
     * The unit's sentence count, used for any lesson that does not set its own. A lesson that
     * will generate no sentences needs no sentence goal, because there is no sentence for a
     * goal to describe; every other lesson still needs at least one.
     */
    defaultSentencesPerLesson?: number;
  }
): UnitPlanValidationResult {
  const reasons: string[] = [];
  const titleCounts = new Map<string, number>();
  const duplicateTitles: string[] = [];
  const invalidLessonIndexes: number[] = [];
  const invalidLessons: UnitPlanValidationResult["details"]["invalidLessons"] = [];
  const overlappingPairs: string[] = [];

  if (lessons.length !== input.lessonCount) {
    reasons.push("invalid lesson plan count");
  }

  lessons.forEach((lesson, index) => {
    const titleKey = normalize(lesson.title);
    const conversationGoal = String((lesson as { conversationGoal?: unknown }).conversationGoal || "").trim();
    const situations = normalizePlanItems((lesson as { situations?: unknown }).situations);
    const sentenceGoals = normalizePlanItems((lesson as { sentenceGoals?: unknown }).sentenceGoals);
    const objectives = Array.isArray(lesson.objectives) ? lesson.objectives.map((item) => String(item || "").trim()) : [];
    const focusSummary = String(lesson.focusSummary || "").trim();
    const customReasons: string[] = [];
    const themeAnchors = input.themeAnchors || [];

    if (titleKey) {
      titleCounts.set(titleKey, (titleCounts.get(titleKey) || 0) + 1);
    }

    if (!looksEnglishLikeMetadataText(String(lesson.title || ""))) {
      customReasons.push("title not English-like");
    }
    if (!looksEnglishLikeMetadataText(String(lesson.description || ""))) {
      customReasons.push("description not English-like");
    }
    if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) {
      customReasons.push("missing objectives");
    }
    if (objectives.some((item) => !looksEnglishLikeMetadataText(String(item || "")))) {
      customReasons.push("objective not English-like");
    }
    if (!looksEnglishLikeMetadataText(conversationGoal) || conversationGoal.length < 8) {
      customReasons.push("invalid conversation goal");
    }
    if (situations.length < 2 || situations.length > 4) {
      customReasons.push("invalid situations count");
    }
    if (situations.some((item) => !looksEnglishLikeMetadataText(item) || item.length < 6)) {
      customReasons.push("situations must be English-like");
    }
    // Floor is 1, not 2. A lesson whose whole content is one greeting has exactly one meaning
    // to reach, and the old floor of 2 left it unsatisfiable: every goal it could add to reach
    // two was either a repeat or a fragment the length rule below then rejected.
    const lessonSentences = Number(lesson.sentences ?? input.defaultSentencesPerLesson ?? 1);
    const minSentenceGoals = Number.isFinite(lessonSentences) && lessonSentences <= 0 ? 0 : 1;
    if (sentenceGoals.length < minSentenceGoals || sentenceGoals.length > 5) {
      customReasons.push("invalid sentence goal count");
    }
    // Length and English-likeness are reported separately. Folded together they told the model
    // that "Morning" was not English, so it stripped target-language text that was never there
    // and deleted the short goals instead of lengthening them, trading this reason for the
    // count reason above and never converging.
    if (sentenceGoals.some((item) => !looksEnglishLikeText(item))) {
      customReasons.push("sentence goals must be English-like");
    }
    // Two characters, not four: a lesson's goal can legitimately be a single short word when
    // that word is the whole lesson target. The floor exists only to reject a stray fragment,
    // not to have an opinion about how much English a goal should be.
    if (sentenceGoals.some((item) => item.length < 2)) {
      customReasons.push("sentence goal too short, write the full English meaning");
    }
    const metadataThemeMatches = countThemeMatches(
      [String(lesson.title || ""), String(lesson.description || ""), focusSummary, ...objectives],
      themeAnchors
    );
    const conversationThemeMatches = countThemeMatches([conversationGoal, ...situations, ...sentenceGoals], themeAnchors);

    if (themeAnchors.length > 0 && metadataThemeMatches === 0 && conversationThemeMatches === 0) {
      customReasons.push("title and description not aligned with unit theme");
    }

    const reasons = Array.from(new Set(customReasons));
    if (reasons.length > 0) {
      invalidLessonIndexes.push(index);
      invalidLessons.push({
        index,
        title: String(lesson.title || "").trim(),
        description: String(lesson.description || "").trim(),
        objectives,
        conversationGoal,
        situations,
        sentenceGoals,
        focusSummary,
        reasons,
        validationDetails: {
          titleThemeMatches: metadataThemeMatches,
          situationThemeMatches: conversationThemeMatches
        }
      });
    }
  });

  for (const [title, count] of titleCounts.entries()) {
    if (count > 1) duplicateTitles.push(title);
  }
  if (duplicateTitles.length > 0) reasons.push("duplicate lesson titles in unit plan");

  for (let left = 0; left < lessons.length; left += 1) {
    const leftSeedSet = new Set(
      [
        String((lessons[left] as { conversationGoal?: unknown }).conversationGoal || ""),
        ...normalizePlanItems((lessons[left] as { situations?: unknown }).situations),
        ...normalizePlanItems((lessons[left] as { sentenceGoals?: unknown }).sentenceGoals)
      ]
        .map(normalize)
        .filter(Boolean)
    );
    for (let right = left + 1; right < lessons.length; right += 1) {
      const rightSeedSet = new Set(
        [
          String((lessons[right] as { conversationGoal?: unknown }).conversationGoal || ""),
          ...normalizePlanItems((lessons[right] as { situations?: unknown }).situations),
          ...normalizePlanItems((lessons[right] as { sentenceGoals?: unknown }).sentenceGoals)
        ]
          .map(normalize)
          .filter(Boolean)
      );
      const intersection = Array.from(leftSeedSet).filter((item) => rightSeedSet.has(item));
      const smallestSetSize = Math.min(leftSeedSet.size, rightSeedSet.size);
      if (smallestSetSize >= 3 && intersection.length >= smallestSetSize - 1) {
        overlappingPairs.push(`${left + 1}-${right + 1}`);
      }
    }
  }
  if (overlappingPairs.length > 0) reasons.push("unit plan lessons overlap too much");
  if (invalidLessonIndexes.length > 0) reasons.push("unit plan contains invalid lesson slices");

  return {
    ok: reasons.length === 0,
    reasons,
    details: {
      duplicateTitles,
      overlappingPairs,
      invalidLessonIndexes,
      invalidLessons,
      actualLessonCount: lessons.length
    }
  };
}

function isValidRefactorOperation(operation: LlmLessonRefactorOperation) {
  switch (operation.type) {
    case "add_text_block":
      return Number.isInteger(operation.stageIndex) &&
        operation.stageIndex >= 0 &&
        operation.stageIndex <= 2 &&
        String(operation.content || "").trim().length > 0;
    case "move_block":
      return Number.isInteger(operation.fromStageIndex) &&
        operation.fromStageIndex >= 0 &&
        operation.fromStageIndex <= 2 &&
        Number.isInteger(operation.toStageIndex) &&
        operation.toStageIndex >= 0 &&
        operation.toStageIndex <= 2 &&
        Number.isInteger(operation.fromBlockIndex) &&
        operation.fromBlockIndex >= 0 &&
        (operation.toBlockIndex === undefined || (Number.isInteger(operation.toBlockIndex) && operation.toBlockIndex >= 0));
    case "remove_block":
      return Number.isInteger(operation.stageIndex) &&
        operation.stageIndex >= 0 &&
        operation.stageIndex <= 2 &&
        Number.isInteger(operation.blockIndex) &&
        operation.blockIndex >= 0;
    case "add_word_bundle":
      return String(operation.wordText || "").trim().length > 0;
    case "add_expression_bundle":
      return String(operation.expressionText || "").trim().length > 0;
    case "add_sentence_bundle":
      return String(operation.sentenceText || "").trim().length > 0 &&
        Array.isArray(operation.translations) &&
        operation.translations.some((item) => String(item || "").trim().length > 0) &&
        Array.isArray(operation.components) &&
        operation.components.length > 0;
    case "replace_word_bundle":
      return String(operation.oldWordText || "").trim().length > 0 &&
        String(operation.newWordText || "").trim().length > 0;
    case "replace_expression_bundle":
      return String(operation.oldExpressionText || "").trim().length > 0 &&
        String(operation.newExpressionText || "").trim().length > 0;
    case "replace_sentence_bundle":
      return String(operation.oldSentenceText || "").trim().length > 0 &&
        String(operation.newSentenceText || "").trim().length > 0 &&
        Array.isArray(operation.translations) &&
        operation.translations.some((item) => String(item || "").trim().length > 0) &&
        Array.isArray(operation.components) &&
        operation.components.length > 0;
    case "remove_word_bundle":
      return String(operation.wordText || "").trim().length > 0;
    case "remove_expression_bundle":
      return String(operation.expressionText || "").trim().length > 0;
    case "remove_sentence_bundle":
      return String(operation.sentenceText || "").trim().length > 0;
    case "add_match_translation_block":
      return Number.isInteger(operation.stageIndex) &&
        operation.stageIndex >= 1 &&
        operation.stageIndex <= 2 &&
        (
          operation.expressionTexts === undefined ||
          (
            Array.isArray(operation.expressionTexts) &&
            operation.expressionTexts.every((item) => String(item || "").trim().length > 0)
          )
        );
    default:
      return false;
  }
}

const REVIEW_REFACTOR_BLOCKED_OPERATION_TYPES = new Set<LlmLessonRefactorOperation["type"]>([
  "add_text_block",
  "add_word_bundle",
  "add_expression_bundle",
  "add_sentence_bundle",
  "replace_word_bundle",
  "replace_expression_bundle",
  "replace_sentence_bundle",
  "add_match_translation_block"
]);

/**
 * Fold several patches for the same lesson into one.
 *
 * The plan format allows one patch per lesson, and validation rejects the whole plan when a
 * lesson appears twice. But a model given an EMPTY lesson has a lot to add, and reliably splits
 * that work across two patch objects -- three attempts at "The Command" failed this way with
 * every operation individually valid and nothing else wrong. Rejecting a plan whose only fault
 * is how it was grouped wastes the generation and, for an empty lesson, blocks the one path
 * that fixes it without regenerating the whole unit.
 *
 * Operations are concatenated in the order given. They address stages and blocks by index, so
 * order carries meaning and must not be sorted or deduplicated.
 */
function mergeDuplicateLessonPatches(plan: LlmUnitRefactorPlan): LlmUnitRefactorPlan {
  const patches = Array.isArray(plan.lessonPatches) ? plan.lessonPatches : [];
  if (patches.length < 2) return plan;

  const byLesson = new Map<string, LlmUnitRefactorPlan["lessonPatches"][number]>();
  let merged = false;
  for (const patch of patches) {
    const lessonId = String(patch.lessonId || "").trim();
    const existing = byLesson.get(lessonId);
    if (!existing) {
      byLesson.set(lessonId, patch);
      continue;
    }
    merged = true;
    byLesson.set(lessonId, {
      ...existing,
      operations: [
        ...(Array.isArray(existing.operations) ? existing.operations : []),
        ...(Array.isArray(patch.operations) ? patch.operations : [])
      ]
    });
  }

  if (!merged) return plan;
  const lessonPatches = [...byLesson.values()];
  console.info("[AI_PLAN_MERGE] folded duplicate lesson patches", {
    before: patches.length,
    after: lessonPatches.length
  });
  return { ...plan, lessonPatches };
}

function sanitizeReviewUnitRefactorPlan(input: {
  plan: LlmUnitRefactorPlan;
  reviewLessonIds: Set<string>;
  existingLessons: LessonEntity[];
}): LlmUnitRefactorPlan {
  if (input.reviewLessonIds.size === 0) return input.plan;
  const lessonById = new Map(input.existingLessons.map((lesson) => [lesson.id, lesson] as const));

  const lessonPatches = Array.isArray(input.plan.lessonPatches)
    ? input.plan.lessonPatches.map((patch) => {
        const lessonId = String(patch.lessonId || "").trim();
        if (!input.reviewLessonIds.has(lessonId)) return patch;

        const originalOperations = Array.isArray(patch.operations) ? patch.operations : [];
        const lesson = lessonById.get(lessonId);
        const stages = (lesson?.stages || []).slice().sort((left, right) => left.orderIndex - right.orderIndex);
        const operations = originalOperations.filter((operation) => {
          if (REVIEW_REFACTOR_BLOCKED_OPERATION_TYPES.has(operation.type)) return false;
          if (operation.type === "move_block") {
            const sourceBlock = stages[operation.fromStageIndex]?.blocks?.[operation.fromBlockIndex];
            return sourceBlock?.type === "question";
          }
          return true;
        });

        return operations.length === originalOperations.length ? patch : { ...patch, operations };
      })
    : [];

  return {
    ...input.plan,
    lessonPatches
  };
}

function validateUnitRefactorPlan(input: {
  plan: LlmUnitRefactorPlan;
  existingLessons: LessonEntity[];
  expectedLessonCount: number;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  unitTitle?: string;
  unitDescription?: string;
  topic?: string;
  curriculumInstruction?: string;
  themeAnchors?: string[];
}): UnitRefactorValidationResult {
  const reasons: string[] = [];
  const lessonIdSet = new Set(input.existingLessons.map((lesson) => lesson.id));
  const patchCounts = new Map<string, number>();
  const duplicateLessonPatchIds: string[] = [];
  const invalidLessonIds: string[] = [];
  const invalidOperations: UnitRefactorValidationResult["details"]["invalidOperations"] = [];
  const invalidNewLessonIndexes: number[] = [];

  for (const patch of Array.isArray(input.plan.lessonPatches) ? input.plan.lessonPatches : []) {
    const lessonId = String(patch.lessonId || "").trim();
    if (!lessonIdSet.has(lessonId)) {
      invalidLessonIds.push(lessonId || "<empty>");
      continue;
    }
    patchCounts.set(lessonId, (patchCounts.get(lessonId) || 0) + 1);
    const operations = Array.isArray(patch.operations) ? patch.operations : [];
    operations.forEach((operation, operationIndex) => {
      if (!isValidRefactorOperation(operation)) {
        invalidOperations.push({
          lessonId,
          lessonTitle: patch.lessonTitle,
          operationIndex,
          operationType: (operation as { type?: string })?.type,
          reason: "invalid operation payload"
        });
      }
    });
  }

  for (const [lessonId, count] of patchCounts.entries()) {
    if (count > 1) duplicateLessonPatchIds.push(lessonId);
  }

  const expectedNewLessons = Math.max(0, input.expectedLessonCount - input.existingLessons.length);
  const newLessons = Array.isArray(input.plan.newLessons) ? input.plan.newLessons : [];
  if (newLessons.length !== expectedNewLessons) {
    reasons.push("invalid new lesson count in refactor plan");
  }

  newLessons.forEach((lesson, index) => {
    const validation = validateUnitPlanLessons([lesson], {
      language: input.language,
      level: input.level,
      lessonCount: 1,
      unitTitle: input.unitTitle,
      unitDescription: input.unitDescription,
      topic: input.topic,
      curriculumInstruction: input.curriculumInstruction,
      themeAnchors: input.themeAnchors
    });
    if (!validation.ok) invalidNewLessonIndexes.push(index);
  });

  if (duplicateLessonPatchIds.length > 0) reasons.push("duplicate lesson patches in refactor plan");
  if (invalidLessonIds.length > 0) reasons.push("refactor plan targets unknown lessons");
  if (invalidOperations.length > 0) reasons.push("refactor plan contains invalid operations");
  if (invalidNewLessonIndexes.length > 0) reasons.push("refactor plan contains invalid new lessons");

  return {
    ok: reasons.length === 0,
    reasons,
    details: {
      duplicateLessonPatchIds,
      invalidLessonIds,
      invalidOperations,
      expectedNewLessons,
      actualNewLessons: newLessons.length,
      invalidNewLessonIndexes
    }
  };
}


export class AdminUnitAiContentUseCases {
  private readonly wordOrchestrator: AiWordOrchestrator;
  private readonly expressionOrchestrator: AiExpressionOrchestrator;
  private readonly sentenceOrchestrator: AiSentenceOrchestrator;
  private readonly lessonAi: AdminLessonAiUseCases;
  private readonly llm: LlmClient;
  private readonly contentCurriculum: ContentCurriculumService;
  private readonly curriculumMemory: CurriculumMemoryService;
  private readonly lessonRefactors: LessonRefactorService;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly chapters: ChapterRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly unitContentItems: UnitContentItemRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository,
    private readonly units: UnitRepository,
    llm: LlmClient
  ) {
    this.llm = llm;
    this.wordOrchestrator = new AiWordOrchestrator(this.words, llm);
    this.expressionOrchestrator = new AiExpressionOrchestrator(this.expressions, llm);
    this.sentenceOrchestrator = new AiSentenceOrchestrator(this.sentences, this.words, this.expressions, llm);
    this.lessonAi = new AdminLessonAiUseCases(
      this.lessons,
      this.lessonContentItems,
      this.expressions,
      this.proverbs,
      this.units,
      llm
    );
    this.contentCurriculum = new ContentCurriculumService(
      this.lessons,
      this.units,
      this.lessonContentItems,
      this.unitContentItems,
      this.chapters
    );
    this.curriculumMemory = new CurriculumMemoryService(
      this.chapters,
      this.units,
      this.lessons,
      this.lessonContentItems,
      this.words,
      this.expressions,
      this.sentences,
      this.proverbs
    );
    this.lessonRefactors = new LessonRefactorService(
      this.lessons,
      this.words,
      this.expressions,
      this.sentences,
      this.lessonContentItems,
      this.questions,
      this.contentCurriculum,
      llm
    );
  }

  private async saveLatestAiRun(unitId: string, summary: UnitAiRunSummary) {
    await this.units.updateLastAiRun(unitId, { lastAiRun: summary });
  }

  private async saveLatestAiPreviewPlan(unitId: string, summary: UnitAiPreviewPlanSummary) {
    await this.units.updateLastAiPreviewPlan(unitId, { lastAiPreviewPlan: summary });
  }

  private async buildExistingLessonsSnapshot(lessons: LessonEntity[]) {
    const parts: string[] = [];

    for (const lesson of lessons) {
      const lessonItems = await this.lessonContentItems.list({ lessonId: lesson.id });
      const lessonWords = await this.words.findByIds(
        Array.from(new Set(lessonItems.filter((item) => item.contentType === "word").map((item) => item.contentId)))
      );
      const lessonExpressions = await this.expressions.findByIds(
        Array.from(new Set(lessonItems.filter((item) => item.contentType === "expression").map((item) => item.contentId)))
      );
      const lessonSentences = await this.sentences.findByIds(
        Array.from(new Set(lessonItems.filter((item) => item.contentType === "sentence").map((item) => item.contentId)))
      );
      const wordMap = new Map(lessonWords.map((item) => [item.id, item]));
      const expressionMap = new Map(lessonExpressions.map((item) => [item.id, item]));
      const sentenceMap = new Map(lessonSentences.map((item) => [item.id, item]));
      const lessonQuestions = await this.questions.list({ lessonId: lesson.id });
      const questionMap = new Map(lessonQuestions.map((item) => [item.id, item]));
      const proverbMap = new Map((await this.proverbs.findByLessonId(lesson.id)).map((item) => [item.id, item]));
      const stageLines = (lesson.stages || [])
        .slice()
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((stage) => {
          const blockLines = (stage.blocks || []).map((block, blockIndex) => {
            if (block.type === "text") return `    [${blockIndex}] text: ${block.content}`;
            if (block.type === "content") {
              const refId = String(block.refId || "");
              const content =
                block.contentType === "word"
                  ? wordMap.get(refId)
                  : block.contentType === "sentence"
                    ? sentenceMap.get(refId)
                    : expressionMap.get(refId);
              return `    [${blockIndex}] ${block.contentType}: ${content?.text || block.refId}${content ? ` => ${pickTranslation(content, block.translationIndex ?? 0)}` : ""}`;
            }
            if (block.type === "question") {
              const question = questionMap.get(String(block.refId || ""));
              const sourceContent =
                question?.sourceType === "word" && question.sourceId
                  ? wordMap.get(question.sourceId)
                  : question?.sourceType === "sentence" && question.sourceId
                    ? sentenceMap.get(question.sourceId)
                    : question?.sourceType === "expression" && question.sourceId
                      ? expressionMap.get(question.sourceId)
                      : null;
              return `    [${blockIndex}] question: ${question?.subtype || "unknown"}${
                sourceContent ? ` for ${sourceContent.text}` : ""
              }`;
            }
            if (block.type === "proverb") {
              const proverb = proverbMap.get(String(block.refId || ""));
              return `    [${blockIndex}] proverb: ${proverb?.text || block.refId}`;
            }
            return `    [${blockIndex}] unsupported block`;
          });
          return [
            `  Stage ${stage.orderIndex} - ${stage.title}`,
            `  Description: ${stage.description}`,
            ...blockLines
          ].join("\n");
        })
        .join("\n");
      const wordLines = lessonWords
        .map((word) => `  - ${word.text} => ${pickTranslation(word)} [word]`)
        .join("\n");
      const expressionLines = lessonExpressions
        .map((expression) => `  - ${expression.text} => ${pickTranslation(expression)} [expression]`)
        .join("\n");
      const sentenceLines = lessonSentences
        .map((sentence) => `  - ${sentence.text} => ${pickTranslation(sentence)} [sentence]`)
        .join("\n");

      parts.push(
        [
          `LessonId: ${lesson.id}`,
          `Title: ${lesson.title}`,
          `Description: ${lesson.description}`,
          wordLines ? `Words:\n${wordLines}` : "Words: none",
          expressionLines ? `Expressions:\n${expressionLines}` : "Expressions: none",
          sentenceLines ? `Sentences:\n${sentenceLines}` : "Sentences: none",
          stageLines ? `Stages:\n${stageLines}` : "Stages: none"
        ].join("\n")
      );
    }

    return parts.join("\n\n");
  }

  private async listLessonExpressions(lessonId: string) {
    const lessonItems = await this.lessonContentItems.list({ lessonId, contentType: "expression" });
    const expressionIds = Array.from(new Set(lessonItems.map((item) => item.contentId).filter(Boolean)));
    if (expressionIds.length === 0) return [];
    const expressions = await this.expressions.findByIds(expressionIds);
    const byId = new Map(expressions.map((item) => [item.id, item]));
    return expressionIds.map((id) => byId.get(id)).filter((item): item is ExpressionEntity => Boolean(item));
  }

  private async listLessonWords(lessonId: string) {
    const lessonItems = await this.lessonContentItems.list({ lessonId, contentType: "word" });
    const wordIds = Array.from(new Set(lessonItems.map((item) => item.contentId).filter(Boolean)));
    if (wordIds.length === 0) return [];
    const words = await this.words.findByIds(wordIds);
    const byId = new Map(words.map((item) => [item.id, item]));
    return wordIds.map((id) => byId.get(id)).filter((item): item is WordEntity => Boolean(item));
  }

  private async listLessonSentences(lessonId: string) {
    const lessonItems = await this.lessonContentItems.list({ lessonId, contentType: "sentence" });
    const sentenceIds = Array.from(new Set(lessonItems.map((item) => item.contentId).filter(Boolean)));
    if (sentenceIds.length === 0) return [];
    const sentences = await this.sentences.findByIds(sentenceIds);
    const byId = new Map(sentences.map((item) => [item.id, item]));
    return sentenceIds.map((id) => byId.get(id)).filter((item): item is SentenceEntity => Boolean(item));
  }

  private async buildGeneratedReviewScenarioDrafts(input: {
    lesson: LessonEntity;
    conversationGoal?: string;
    focusedLessonContent: Array<WordEntity | ExpressionEntity>;
    questionOptionPool: Array<WordEntity | ExpressionEntity>;
  }) {
    const scenarioCandidates = input.focusedLessonContent.filter((item) => contentSupportsContextScenario(item));
    if (scenarioCandidates.length === 0) {
      return [] as Array<{
        stage: 2 | 3;
        source: WordEntity | ExpressionEntity;
        draft: ContextScenarioQuestionDraft;
      }>;
    }

    const selectedCandidates = scenarioCandidates.slice(0, 2);
    const drafts: Array<{
      stage: 2 | 3;
      source: WordEntity | ExpressionEntity;
      draft: ContextScenarioQuestionDraft;
    }> = [];

    for (const [index, source] of selectedCandidates.entries()) {
      const draft = await buildAiContextScenarioQuestionDraft({
        llm: this.llm,
        language: input.lesson.language,
        level: input.lesson.level,
        lessonTitle: input.lesson.title,
        lessonDescription: input.lesson.description,
        conversationGoal: input.conversationGoal,
        contentType: source.kind,
        content: source,
        lessonPool: input.focusedLessonContent,
        languagePool: input.questionOptionPool
      });
      if (!draft) continue;
      drafts.push({
        stage: index === 0 ? 2 : 3,
        source,
        draft
      });
    }

    return drafts;
  }

  private async resolveReviewSourceUnits(unit: UnitEntity) {
    if (Array.isArray(unit.reviewSourceUnitIds) && unit.reviewSourceUnitIds.length > 0) {
      const unitsInScope = unit.chapterId
        ? await this.units.listByChapterId(unit.chapterId)
        : await this.units.listByLanguage(unit.language, unit.languageId || null);
      const requestedIds = new Set(unit.reviewSourceUnitIds);
      return unitsInScope.filter((candidate) => requestedIds.has(candidate.id) && candidate.id !== unit.id);
    }

    const unitsInScope = unit.chapterId
      ? await this.units.listByChapterId(unit.chapterId)
      : await this.units.listByLanguage(unit.language, unit.languageId || null);
    return unitsInScope
      .filter((candidate) => candidate.id !== unit.id && candidate.kind === "core" && candidate.orderIndex < unit.orderIndex)
      .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime());
  }

  private async buildReviewGenerationContextFromLessons(sourceLessons: LessonEntity[]): Promise<ReviewGenerationContext> {
    if (sourceLessons.length === 0) {
      return {
        sourceLessonIds: [],
        sourceUnitIds: [],
        knownWords: [],
        knownExpressions: [],
        knownSentences: [],
        sentenceSourceLessonIds: new Map(),
        promotedWords: [],
        promotedExpressions: [],
        introducedWordIds: new Set(),
        introducedExpressionIds: new Set(),
        wordExposureCounts: new Map(),
        expressionExposureCounts: new Map()
      };
    }

    const sourceLessonIds = sourceLessons.map((lesson) => lesson.id);
    const sourceUnitIds = Array.from(new Set(sourceLessons.map((lesson) => lesson.unitId)));
    const allSourceLessonItems = (await Promise.all(sourceLessonIds.map((lessonId) => this.lessonContentItems.list({ lessonId })))).flat();
    const explicitWordIds = Array.from(
      new Set(allSourceLessonItems.filter((item) => item.contentType === "word").map((item) => item.contentId))
    );
    const explicitExpressionIds = Array.from(
      new Set(allSourceLessonItems.filter((item) => item.contentType === "expression").map((item) => item.contentId))
    );
    const introducedWordIds = new Set(
      allSourceLessonItems
        .filter((item) => item.contentType === "word" && item.role === "introduce")
        .map((item) => item.contentId)
    );
    const introducedExpressionIds = new Set(
      allSourceLessonItems
        .filter((item) => item.contentType === "expression" && item.role === "introduce")
        .map((item) => item.contentId)
    );
    const knownWords = explicitWordIds.length > 0 ? await this.words.findByIds(explicitWordIds) : [];
    const knownExpressions = explicitExpressionIds.length > 0 ? await this.expressions.findByIds(explicitExpressionIds) : [];

    const sourceSentencesByLesson = await Promise.all(
      sourceLessonIds.map(async (lessonId) => {
        const sentenceItems = await this.lessonContentItems.list({ lessonId, contentType: "sentence" });
        const sentenceIds = Array.from(new Set(sentenceItems.map((item) => item.contentId).filter(Boolean)));
        const sentences = sentenceIds.length > 0 ? await this.sentences.findByIds(sentenceIds) : [];
        return { lessonId, sentences };
      })
    );
    const sourceSentences = sourceSentencesByLesson.flatMap((entry) => entry.sentences);

    const wordExposureCounts = new Map<string, number>();
    const expressionExposureCounts = new Map<string, number>();
    const sentenceComponentWordIds = new Set<string>();
    const sentenceComponentExpressionIds = new Set<string>();
    for (const sentence of sourceSentences) {
      const seenInSentence = new Set<string>();
      for (const component of sentence.components || []) {
        const key = `${component.type}:${component.refId}`;
        if (!component.refId || seenInSentence.has(key)) continue;
        seenInSentence.add(key);
        const targetMap = component.type === "word" ? wordExposureCounts : expressionExposureCounts;
        targetMap.set(component.refId, (targetMap.get(component.refId) || 0) + 1);
        if (component.type === "word") sentenceComponentWordIds.add(component.refId);
        if (component.type === "expression") sentenceComponentExpressionIds.add(component.refId);
      }
    }

    const sentenceComponentWords = sentenceComponentWordIds.size > 0 ? await this.words.findByIds(Array.from(sentenceComponentWordIds)) : [];
    const sentenceComponentExpressions =
      sentenceComponentExpressionIds.size > 0 ? await this.expressions.findByIds(Array.from(sentenceComponentExpressionIds)) : [];
    const knownWordById = new Map([...knownWords, ...sentenceComponentWords].map((item) => [item.id, item] as const));
    const knownExpressionById = new Map([...knownExpressions, ...sentenceComponentExpressions].map((item) => [item.id, item] as const));
    const knownWordValues = Array.from(knownWordById.values());
    const knownExpressionValues = Array.from(knownExpressionById.values());

    const promotedWords = knownWordValues
      .filter((item) => !introducedWordIds.has(item.id) && (wordExposureCounts.get(item.id) || 0) >= 2)
      .map((item) => ({ item, exposureCount: wordExposureCounts.get(item.id) || 0 }))
      .sort((left, right) => right.exposureCount - left.exposureCount || left.item.text.localeCompare(right.item.text));
    const promotedExpressions = knownExpressionValues
      .filter((item) => !introducedExpressionIds.has(item.id) && (expressionExposureCounts.get(item.id) || 0) >= 2)
      .map((item) => ({ item, exposureCount: expressionExposureCounts.get(item.id) || 0 }))
      .sort((left, right) => right.exposureCount - left.exposureCount || left.item.text.localeCompare(right.item.text));

    const sentenceSourceLessonIds = new Map<string, string[]>();
    const knownSentences = Array.from(
      new Map<string, { sentence: SentenceEntity; lessonIds: Set<string> }>(
        sourceSentencesByLesson.flatMap(({ lessonId, sentences }) =>
          sentences
            .map((sentence) => [normalize(sentence.text), { sentence, lessonIds: new Set([lessonId]) }] as const)
            .filter(([key]) => Boolean(key))
        )
      ).values()
    ).map((entry) => {
      sentenceSourceLessonIds.set(entry.sentence.id, Array.from(entry.lessonIds));
      return entry.sentence;
    });

    for (const { lessonId, sentences } of sourceSentencesByLesson) {
      for (const sentence of sentences) {
        const matched = knownSentences.find((item) => normalize(item.text) === normalize(sentence.text));
        if (!matched) continue;
        const lessonIds = sentenceSourceLessonIds.get(matched.id) || [];
        if (!lessonIds.includes(lessonId)) {
          sentenceSourceLessonIds.set(matched.id, [...lessonIds, lessonId]);
        }
      }
    }

    return {
      sourceLessonIds,
      sourceUnitIds,
      knownWords: knownWordValues,
      knownExpressions: knownExpressionValues,
      knownSentences,
      sentenceSourceLessonIds,
      promotedWords,
      promotedExpressions,
      introducedWordIds,
      introducedExpressionIds,
      wordExposureCounts,
      expressionExposureCounts
    };
  }

  private async buildReviewGenerationContext(unit: UnitEntity): Promise<ReviewGenerationContext> {
    const sourceUnits = await this.resolveReviewSourceUnits(unit);
    const sourceLessons = (
      await Promise.all(sourceUnits.map((sourceUnit) => this.lessons.listByUnitId(sourceUnit.id)))
    ).flat();
    return this.buildReviewGenerationContextFromLessons(sourceLessons);
  }

  private buildReviewPlanningInventorySummary(reviewContext: ReviewGenerationContext | null) {
    if (!reviewContext) return "";

    const introducedWords = reviewContext.knownWords.filter((item) => reviewContext.introducedWordIds.has(item.id));
    const introducedExpressions = reviewContext.knownExpressions.filter((item) => reviewContext.introducedExpressionIds.has(item.id));
    const knownSupportWords = reviewContext.knownWords.filter((item) => !reviewContext.introducedWordIds.has(item.id));
    const knownSupportExpressions = reviewContext.knownExpressions.filter((item) => !reviewContext.introducedExpressionIds.has(item.id));
    const sentenceExamples = summarizeReviewSentenceExamples(reviewContext.knownSentences, 12);

    return [
      "Review planning constraints:",
      "Plan only review lessons whose conversationGoal, situations, and sentenceGoals stay inside the prior taught inventory below.",
      "Do not propose new teachable meanings or fresh target vocabulary outside this review inventory.",
      introducedWords.length > 0
        ? `Explicitly introduced review words: ${summarizeReviewInventoryEntries(introducedWords, 30)}`
        : "Explicitly introduced review words: none",
      introducedExpressions.length > 0
        ? `Explicitly introduced review expressions: ${summarizeReviewInventoryEntries(introducedExpressions, 24)}`
        : "Explicitly introduced review expressions: none",
      knownSupportWords.length > 0
        ? `Other known review words from source sentences: ${summarizeReviewInventoryEntries(knownSupportWords, 20)}`
        : "",
      knownSupportExpressions.length > 0
        ? `Other known review expressions from source sentences: ${summarizeReviewInventoryEntries(knownSupportExpressions, 16)}`
        : "",
      sentenceExamples ? `Known review sentence examples and patterns: ${sentenceExamples}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  private decorateReviewPlanLessons(input: {
    planLessons: LlmUnitPlanLesson[];
    reviewContext: ReviewGenerationContext | null;
  }): PlannedUnitLesson[] {
    const normalizedPlanLessons = Array.isArray(input.planLessons)
      ? input.planLessons.map((lesson) => normalizeUnitPlanLesson(lesson))
      : [];
    const reviewContext = input.reviewContext;
    if (!reviewContext || reviewContext.knownSentences.length === 0) {
      return normalizedPlanLessons.map((lesson) => ({ ...lesson, lessonMode: "review" }));
    }

    const sentenceUsageCounts = new Map<string, number>();
    return normalizedPlanLessons.map((lesson) => {
      const anchorSentences = selectReviewAnchorSentencesForLesson({
        lesson,
        knownSentences: reviewContext.knownSentences,
        sentenceUsageCounts,
        maxAnchors: REVIEW_ANCHOR_SENTENCES_PER_LESSON
      });
      for (const sentence of anchorSentences) {
        sentenceUsageCounts.set(sentence.id, (sentenceUsageCounts.get(sentence.id) || 0) + 1);
      }

      const anchorSentenceIds = anchorSentences.map((sentence) => sentence.id);
      const reviewSourceLessonIds = Array.from(
        new Set(
          anchorSentences.flatMap(
            (sentence) => reviewContext.sentenceSourceLessonIds.get(sentence.id) || reviewContext.sourceLessonIds
          )
        )
      );

      return {
        ...lesson,
        lessonMode: "review",
        reviewSourceLessonIds,
        reviewAnchorSentenceIds: anchorSentenceIds
      };
    });
  }

  private async listSentencesByIdsOrdered(sentenceIds: string[]) {
    const uniqueSentenceIds = Array.from(new Set(sentenceIds.map((value) => String(value || "").trim()).filter(Boolean)));
    if (uniqueSentenceIds.length === 0) return [];
    const sentences = await this.sentences.findByIds(uniqueSentenceIds);
    const byId = new Map(sentences.map((sentence) => [sentence.id, sentence] as const));
    return uniqueSentenceIds.map((id) => byId.get(id)).filter((sentence): sentence is SentenceEntity => Boolean(sentence));
  }

  private async selectLockedCoreTargets(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    targetCount: number;
    planTexts: string[];
    currentLessonWords: WordEntity[];
    currentLessonExpressions: ExpressionEntity[];
    wordLanguagePool: WordEntity[];
    expressionLanguagePool: ExpressionEntity[];
  }) {
    const targetCount = Math.max(0, input.targetCount);
    if (targetCount === 0 || input.sentenceDrafts.length === 0) {
      return {
        words: [] as Array<{ text: string; translations: string[] }>,
        expressions: [] as Array<{ text: string; translations: string[] }>
      };
    }

    const wordPool = new Map(
      [...input.currentLessonWords, ...input.wordLanguagePool].map((item) => [normalize(item.text), item] as const)
    );
    const expressionPool = new Map(
      [...input.currentLessonExpressions, ...input.expressionLanguagePool].map((item) => [normalize(item.text), item] as const)
    );
    const planHaystack = normalize(input.planTexts.join(" "));
    const candidateMap = new Map<
      string,
      {
        type: "word" | "expression";
        text: string;
        translations: string[];
        coreSentenceHits: number;
        sentenceHits: number;
        planMatches: number;
        existingWord?: WordEntity;
        existingExpression?: ExpressionEntity;
        introducedBefore?: boolean;
      }
    >();

    for (const draft of input.sentenceDrafts) {
      const seenInSentence = new Set<string>();
      for (const component of draft.components) {
        const normalizedText = normalize(component.text);
        if (!normalizedText) continue;
        const key = `${component.type}:${normalizedText}`;
        if (seenInSentence.has(key)) continue;
        seenInSentence.add(key);

        const existingCandidate = candidateMap.get(key);
        const translations = Array.from(
          new Set(
            [
              ...(existingCandidate?.translations || []),
              ...(Array.isArray(component.translations) ? component.translations : [])
            ]
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          )
        );
        const planMatches = [
          normalizedText,
          ...translations.map((item) => normalize(item))
        ].filter(Boolean).reduce((count, value) => (planHaystack.includes(value) ? count + 1 : count), 0);

        candidateMap.set(key, {
          type: component.type,
          text: String(component.text || "").trim(),
          translations,
          coreSentenceHits: (existingCandidate?.coreSentenceHits || 0) + (component.role === "core" ? 1 : 0),
          sentenceHits: (existingCandidate?.sentenceHits || 0) + 1,
          planMatches: (existingCandidate?.planMatches || 0) + planMatches,
          existingWord: component.type === "word" ? (existingCandidate?.existingWord || wordPool.get(normalizedText)) : undefined,
          existingExpression:
            component.type === "expression"
              ? (existingCandidate?.existingExpression || expressionPool.get(normalizedText))
              : undefined,
          introducedBefore: existingCandidate?.introducedBefore
        });
      }
    }

    for (const candidate of candidateMap.values()) {
      if (candidate.type === "word") {
        if (
          !shouldTeachStandaloneWord({
            language: input.lesson.language,
            word: (candidate.existingWord || {
              text: candidate.text,
              translations: candidate.translations
            }) as WordEntity,
            planTexts: input.planTexts
          })
        ) {
          candidate.introducedBefore = true;
          continue;
        }
        if (candidate.existingWord) {
          candidate.introducedBefore = await this.contentCurriculum.wasContentIntroducedBeforeLesson({
            lesson: input.lesson,
            contentType: "word",
            contentId: candidate.existingWord.id
          });
        } else {
          candidate.introducedBefore = false;
        }
        continue;
      }

      if (candidate.existingExpression) {
        candidate.introducedBefore = await this.wasExpressionIntroducedBeforeLesson(
          input.lesson,
          candidate.existingExpression.id
        );
      } else {
        candidate.introducedBefore = false;
      }
    }

    const candidateScore = (candidate: {
      type: "word" | "expression";
      text: string;
      coreSentenceHits: number;
      sentenceHits: number;
      planMatches: number;
      introducedBefore?: boolean;
    }) => {
      let value = 0;
      value += candidate.introducedBefore ? 0 : 100;
      value += candidate.coreSentenceHits * 12;
      value += candidate.sentenceHits * 6;
      value += candidate.planMatches * 8;
      if (candidate.type === "expression") value += 6;
      if (candidate.type === "expression" && candidate.text.trim().split(/\s+/).length > 1) value += 4;
      return value;
    };

    const ranked = Array.from(candidateMap.values())
      .filter((candidate) => {
        if (candidate.type === "word") {
          return shouldTeachStandaloneWord({
            language: input.lesson.language,
            word: (candidate.existingWord || {
              text: candidate.text,
              translations: candidate.translations
            }) as WordEntity,
            planTexts: input.planTexts
          });
        }
        return true;
      })
      .sort((left, right) => candidateScore(right) - candidateScore(left));

    const selectedWords: Array<{ text: string; translations: string[] }> = [];
    const selectedExpressions: Array<{ text: string; translations: string[] }> = [];
    let wordCount = 0;

    for (const candidate of ranked) {
      const totalSelected = selectedWords.length + selectedExpressions.length;
      if (totalSelected >= targetCount) break;

      if (candidate.type === "word") {
        if (wordCount >= LESSON_GENERATION_LIMITS.MAX_NEW_WORDS_PER_LESSON) continue;
        selectedWords.push({ text: candidate.text, translations: candidate.translations });
        wordCount += 1;
        continue;
      }

      selectedExpressions.push({ text: candidate.text, translations: candidate.translations });
    }

    return {
      words: selectedWords,
      expressions: selectedExpressions
    };
  }

  private selectReviewLessonTargets(input: {
    lesson: LessonEntity;
    targetCount: number;
    planTexts: string[];
    reviewContext: ReviewGenerationContext;
    allowPromotedTargets?: boolean;
  }) {
    const planHaystack = normalize(input.planTexts.join(" "));
    const allowPromotedTargets = input.allowPromotedTargets !== false;
    const promotedWordIds = new Set(input.reviewContext.promotedWords.map((candidate) => candidate.item.id));
    const promotedExpressionIds = new Set(input.reviewContext.promotedExpressions.map((candidate) => candidate.item.id));

    const scoreWord = (word: WordEntity, promoted = false) => {
      let value = 0;
      if (promoted) value += 80;
      value += (input.reviewContext.wordExposureCounts.get(word.id) || 0) * 10;
      const matches = [normalize(word.text), ...(word.translations || []).map((item) => normalize(item))]
        .filter(Boolean)
        .reduce((count, token) => (planHaystack.includes(token) ? count + 1 : count), 0);
      value += matches * 12;
      return value;
    };

    const scoreExpression = (expression: ExpressionEntity, promoted = false) => {
      let value = 12;
      if (promoted) value += 80;
      value += (input.reviewContext.expressionExposureCounts.get(expression.id) || 0) * 10;
      if (expression.text.trim().split(/\s+/).length > 1) value += 4;
      const matches = [normalize(expression.text), ...(expression.translations || []).map((item) => normalize(item))]
        .filter(Boolean)
        .reduce((count, token) => (planHaystack.includes(token) ? count + 1 : count), 0);
      value += matches * 12;
      return value;
    };

    const promotedWordCandidates = allowPromotedTargets
      ? input.reviewContext.promotedWords
          .map((candidate) => candidate.item)
          .filter((word) =>
            shouldTeachStandaloneWord({
              language: input.lesson.language,
              word,
              planTexts: input.planTexts
            })
          )
          .sort((left, right) => scoreWord(right, true) - scoreWord(left, true))
      : [];
    const promotedExpressionCandidates = allowPromotedTargets
      ? input.reviewContext.promotedExpressions
          .map((candidate) => candidate.item)
          .sort((left, right) => scoreExpression(right, true) - scoreExpression(left, true))
      : [];

    const knownWordCandidates = input.reviewContext.knownWords
      .filter((word) => !promotedWordIds.has(word.id))
      .filter((word) =>
        shouldTeachStandaloneWord({
          language: input.lesson.language,
          word,
          planTexts: input.planTexts
        })
      )
      .sort((left, right) => scoreWord(right) - scoreWord(left));
    const knownExpressionCandidates = input.reviewContext.knownExpressions
      .filter((expression) => !promotedExpressionIds.has(expression.id))
      .sort((left, right) => scoreExpression(right) - scoreExpression(left));

    const selectedWords: Array<{ text: string; translations: string[] }> = [];
    const selectedExpressions: Array<{ text: string; translations: string[] }> = [];
    const seen = new Set<string>();
    let selectedWordCount = 0;

    const pushWord = (word: WordEntity) => {
      if (selectedWordCount >= LESSON_GENERATION_LIMITS.MAX_NEW_WORDS_PER_LESSON) return false;
      const key = `word:${normalize(word.text)}`;
      if (seen.has(key)) return false;
      selectedWords.push({ text: word.text, translations: word.translations });
      selectedWordCount += 1;
      seen.add(key);
      return true;
    };
    const pushExpression = (expression: ExpressionEntity) => {
      const key = `expression:${normalize(expression.text)}`;
      if (seen.has(key)) return false;
      selectedExpressions.push({ text: expression.text, translations: expression.translations });
      seen.add(key);
      return true;
    };

    const tryAddPromoted = [...promotedExpressionCandidates, ...promotedWordCandidates].sort((left, right) => {
      const leftScore = left.kind === "word" ? scoreWord(left, true) : scoreExpression(left, true);
      const rightScore = right.kind === "word" ? scoreWord(right, true) : scoreExpression(right, true);
      return rightScore - leftScore;
    });

    if (input.targetCount > 0) {
      for (const candidate of tryAddPromoted) {
        const added = candidate.kind === "word" ? pushWord(candidate) : pushExpression(candidate);
        if (added) break;
      }
    }

    const rankedKnown = [...knownExpressionCandidates, ...knownWordCandidates].sort((left, right) => {
      const leftScore = left.kind === "word" ? scoreWord(left) : scoreExpression(left);
      const rightScore = right.kind === "word" ? scoreWord(right) : scoreExpression(right);
      return rightScore - leftScore;
    });

    for (const candidate of rankedKnown) {
      if (selectedWords.length + selectedExpressions.length >= input.targetCount) break;
      if (candidate.kind === "word") {
        pushWord(candidate);
        continue;
      }
      pushExpression(candidate);
    }

    return {
      words: selectedWords,
      expressions: selectedExpressions
    };
  }

  private lockSentenceDraftsToTargets(
    sentenceDrafts: LlmGeneratedSentence[],
    lockedTargets: {
      words: Array<{ text: string; translations: string[] }>;
      expressions: Array<{ text: string; translations: string[] }>;
    },
    options: {
      /**
       * Keep drafts that do not contain a target. A lesson's instructions ask for repetition
       * lines from earlier lessons -- `Ẹ káàárọ̀, Màmá.` in a lesson teaching `ni` -- and
       * dropping them left the lesson with half the sentences its goals named. The merge step
       * still puts target sentences first, so repetition only fills what is left.
       */
      keepOffTarget?: boolean;
    } = {}
  ) {
    const lockedWordSet = new Set(lockedTargets.words.map((item) => normalize(item.text)));
    const lockedExpressionSet = new Set(lockedTargets.expressions.map((item) => normalize(item.text)));
    const lockedExpressionTokenSets = lockedTargets.expressions
      .map((item) => splitExpressionIntoNormalizedWordTokens(item.text))
      .filter((tokens) => tokens.length > 0);

    return sentenceDrafts
      .map((draft) => ({
        ...draft,
        components: draft.components.map((component) => {
          const normalizedText = normalize(component.text);
          const isLockedWord = component.type === "word" && lockedWordSet.has(normalizedText);
          const isLockedExpressionChunk =
            component.type === "word" &&
            lockedExpressionTokenSets.some((tokens) => tokens.includes(normalizedText));
          const isLockedExpression = component.type === "expression" && lockedExpressionSet.has(normalizedText);
          const isLocked = isLockedWord || isLockedExpressionChunk || isLockedExpression;
          return {
            ...component,
            fixed: component.fixed,
            role: isLocked ? "core" : "support"
          } as typeof component;
        })
      }))
      .filter(
        (draft) =>
          options.keepOffTarget ||
          sentenceDraftUsesLockedTarget(draft, {
            words: lockedWordSet,
            expressions: lockedExpressionSet
          })
      );
  }

  private mergeSentenceDraftsForLockedTargets(input: {
    primary: LlmGeneratedSentence[];
    fallback: LlmGeneratedSentence[];
    lockedTargets: {
      words: Array<{ text: string; translations: string[] }>;
      expressions: Array<{ text: string; translations: string[] }>;
    };
    maxSentences: number;
  }) {
    const lockedWordSet = new Set(input.lockedTargets.words.map((item) => normalize(item.text)));
    const lockedExpressionSet = new Set(input.lockedTargets.expressions.map((item) => normalize(item.text)));
    const seenSentenceTexts = new Set<string>();
    const merged: LlmGeneratedSentence[] = [];

    const addDraft = (draft: LlmGeneratedSentence, requireTarget: boolean) => {
      const key = normalize(draft.text);
      if (!key || seenSentenceTexts.has(key)) return;
      if (
        requireTarget &&
        !sentenceDraftUsesLockedTarget(draft, { words: lockedWordSet, expressions: lockedExpressionSet })
      ) {
        return;
      }
      merged.push(draft);
      seenSentenceTexts.add(key);
    };

    // Sentences that drill this lesson's target come first and are never displaced.
    for (const draft of input.primary) addDraft(draft, true);
    for (const draft of input.fallback) addDraft(draft, true);
    // Then repetition -- lines the instructions asked for that revisit earlier lessons --
    // fills whatever room is left, rather than being thrown away.
    for (const draft of [...input.primary, ...input.fallback]) {
      if (merged.length >= input.maxSentences) break;
      addDraft(draft, false);
    }

    return merged.slice(0, Math.max(0, input.maxSentences));
  }

  private async upsertWordFromSentenceComponent(input: {
    lesson: LessonEntity;
    text: string;
    translations: string[];
  }) {
    const existing = await this.words.findByText(input.lesson.language, input.text, input.lesson.languageId || null);
    if (existing) {
      const mergedTranslations = Array.from(new Set([...existing.translations, ...input.translations].filter(Boolean)));
      return (await this.words.updateById(existing.id, {
        translations: mergedTranslations
      })) || existing;
    }

    return this.words.create({
      language: input.lesson.language,
      text: input.text,
      textNormalized: normalize(input.text),
      translations: Array.from(new Set(input.translations.filter(Boolean))),
      pronunciation: "",
      explanation: "",
      examples: [],
      difficulty: Math.max(1, Math.min(5, input.lesson.level === "beginner" ? 1 : input.lesson.level === "intermediate" ? 2 : 3)),
      aiMeta: {
        generatedByAI: true,
        model: this.contentModelName,
        reviewedByAdmin: false
      },
      audio: {
        provider: "",
        model: "",
        voice: "",
        locale: "",
        format: "",
        url: "",
        s3Key: ""
      },
      lemma: input.text,
      partOfSpeech: "unknown",
      status: "draft"
    });
  }

  private async upsertExpressionFromSentenceComponent(input: {
    lesson: LessonEntity;
    text: string;
    translations: string[];
    components?: ContentComponentRef[];
  }) {
    const existing = await this.expressions.findByText(input.lesson.language, input.text, input.lesson.languageId || null);
    if (existing) {
      const mergedTranslations = Array.from(new Set([...existing.translations, ...input.translations].filter(Boolean)));
      const update: Partial<ExpressionEntity> = {
        translations: mergedTranslations
      };
      if ((existing.components || []).length === 0 && (input.components || []).length > 0) {
        update.components = input.components;
      }
      return (await this.expressions.updateById(existing.id, update)) || existing;
    }

    return this.expressions.create({
      language: input.lesson.language,
      text: input.text,
      textNormalized: normalize(input.text),
      translations: Array.from(new Set(input.translations.filter(Boolean))),
      pronunciation: "",
      explanation: "",
      examples: [],
      difficulty: Math.max(1, Math.min(5, input.lesson.level === "beginner" ? 1 : input.lesson.level === "intermediate" ? 2 : 3)),
      aiMeta: {
        generatedByAI: true,
        model: this.contentModelName,
        reviewedByAdmin: false
      },
      audio: {
        provider: "",
        model: "",
        voice: "",
        locale: "",
        format: "",
        url: "",
        s3Key: ""
      },
      register: "neutral",
      components: input.components || [],
      status: "draft"
    });
  }

  private buildExpressionWordComponentRefs(input: {
    expressionText: string;
    wordsByText: Map<string, WordEntity>;
  }) {
    const tokenTexts = splitExpressionIntoWordTokens(input.expressionText);
    if (tokenTexts.length < 2) return [];

    const refs: ContentComponentRef[] = [];
    for (const [index, tokenText] of tokenTexts.entries()) {
      const tokenWord = input.wordsByText.get(normalize(tokenText));
      if (!tokenWord) return [];
      refs.push({
        type: "word",
        refId: tokenWord.id,
        orderIndex: index,
        textSnapshot: tokenText
      });
    }
    return refs;
  }

  private async resolveStandaloneWordsForExpressions(input: {
    lesson: LessonEntity;
    expressionTexts: string[];
  }) {
    const tokenTextsByExpression = new Map<string, string[]>();
    const requestedWordTexts: string[] = [];

    for (const expressionText of input.expressionTexts) {
      const expressionKey = normalize(expressionText);
      if (!expressionKey) continue;
      const tokenTexts = splitExpressionIntoWordTokens(expressionText);
      if (tokenTexts.length < 2) continue;
      tokenTextsByExpression.set(expressionKey, tokenTexts);
      requestedWordTexts.push(...tokenTexts);
    }

    const uniqueWordTexts = Array.from(new Set(requestedWordTexts.map((item) => item.trim()).filter(Boolean)));
    const wordsByText = new Map<string, WordEntity>();
    if (uniqueWordTexts.length === 0) {
      return { tokenTextsByExpression, wordsByText };
    }

    const generated = await this.wordOrchestrator.generateForLesson({
      lesson: input.lesson,
      seedWords: uniqueWordTexts,
      maxWords: uniqueWordTexts.length,
      extraInstructions: [
        "Generate entries only for the exact provided seed words.",
        "Do not merge seed words into multi-word expressions.",
        "Return a standalone gloss for each reusable seed word if it functions as its own word in the language.",
        "For short possessives, particles, or function words, use the most natural standalone English gloss."
      ].join(" ")
    });

    for (const word of generated) {
      const key = normalize(word.text);
      if (!key || wordsByText.has(key)) continue;
      wordsByText.set(key, word);
    }

    const unresolvedTexts = uniqueWordTexts.filter((item) => !wordsByText.has(normalize(item)));
    if (unresolvedTexts.length > 0) {
      const existing = await Promise.all(
        unresolvedTexts.map((item) => this.words.findByText(input.lesson.language, item, input.lesson.languageId || null))
      );
      for (const word of existing) {
        if (!word) continue;
        const key = normalize(word.text);
        if (!key || wordsByText.has(key)) continue;
        wordsByText.set(key, word);
      }
    }

    return { tokenTextsByExpression, wordsByText };
  }

  private async deriveContentFromSentenceDrafts(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    targetExpressions?: Array<{ text: string; translations: string[] }>;
    targetWords?: Array<{ text: string; translations: string[] }>;
  }) {
    const coreWords = new Map<string, WordEntity>();
    const coreExpressions = new Map<string, ExpressionEntity>();
    const supportWords = new Map<string, WordEntity>();
    const supportExpressions = new Map<string, ExpressionEntity>();
    const targetExpressions = Array.isArray(input.targetExpressions) ? input.targetExpressions : [];
    // A multi-word target is often typed into Target Words rather than Target Expressions
    // ("Níbo ni" = "where is"). Either list means the curriculum asked for it, so accept it
    // from both; otherwise an explicitly planned target is rejected as not_a_planned_target.
    const targetExpressionKeys = new Set(
      [...targetExpressions, ...(input.targetWords || [])]
        .map((item) => normalize(item.text))
        .filter(Boolean)
    );
    const sentenceExpressionTexts = input.sentenceDrafts.flatMap((draft) =>
      draft.components
        .filter((component) => component.type === "expression")
        .map((component) => component.text)
    );
    const { tokenTextsByExpression, wordsByText: derivedWordsByText } =
      await this.resolveStandaloneWordsForExpressions({
        lesson: input.lesson,
        expressionTexts: [...sentenceExpressionTexts, ...targetExpressions.map((item) => item.text)]
      });

    for (const draft of input.sentenceDrafts) {
      for (const component of draft.components) {
        const normalizedText = normalize(component.text);
        if (!normalizedText) continue;
        if (component.type === "word") {
          const word = await this.upsertWordFromSentenceComponent({
            lesson: input.lesson,
            text: component.text,
            translations: component.translations
          });
          (component.role === "support" ? supportWords : coreWords).set(normalizedText, word);
          continue;
        }

        // An expression is created only when the unit plan asked for it. `fixed=true` is a
        // weak model's snap judgement about a chunk mid-sentence, and no downstream text
        // heuristic can reliably tell a set phrase from a literal clause, so inferring
        // permanent inventory rows from it filled the table with sentences. Planned targets
        // are a curriculum decision that can be reviewed; everything else splits into words.
        // isSentenceLikeExpressionText still applies, in case a plan names a sentence.
        // Reuse is always allowed; only CREATION is gated. An expression that already exists
        // was approved when some earlier lesson introduced it, so a sentence using it should
        // link to it. Gating reuse tore known expressions ("ń lọ", "ibi iṣẹ́") back into
        // loose words. A brand-new expression is still only minted for a planned target.
        const existingExpression =
          component.fixed === true && !isSentenceLikeExpressionText(component.text)
            ? await this.expressions.findByText(
                input.lesson.language,
                component.text,
                input.lesson.languageId || null
              )
            : null;
        if (
          component.fixed === true &&
          (existingExpression || targetExpressionKeys.has(normalizedText)) &&
          !isSentenceLikeExpressionText(component.text)
        ) {
          const expressionComponents = this.buildExpressionWordComponentRefs({
            expressionText: component.text,
            wordsByText: derivedWordsByText
          });
          const expression = await this.upsertExpressionFromSentenceComponent({
            lesson: input.lesson,
            text: component.text,
            translations: component.translations,
            components: expressionComponents
          });
          (component.role === "support" ? supportExpressions : coreExpressions).set(normalizedText, expression);
          continue;
        }
        if (component.fixed === true) {
          console.warn("[EXPRESSION_SENTENCE_GUARD]", {
            lessonId: input.lesson.id,
            title: input.lesson.title,
            text: component.text,
            reason: targetExpressionKeys.has(normalizedText)
              ? "sentence_like"
              : "not_a_planned_target_and_does_not_exist",
            note: "Component marked fixed=true was not stored as an expression; split into words instead."
          });
        }

        const tokenTexts = tokenTextsByExpression.get(normalizedText) || [];
        const tokenDestination =
          component.role === "support" || targetExpressionKeys.has(normalizedText) ? supportWords : coreWords;
        for (const tokenText of tokenTexts) {
          const tokenWord = derivedWordsByText.get(normalize(tokenText));
          if (!tokenWord) continue;
          tokenDestination.set(normalize(tokenWord.text), tokenWord);
        }
      }
    }

    for (const targetExpression of targetExpressions) {
      const normalizedText = normalize(targetExpression.text);
      if (!normalizedText) continue;
      // This loop previously created every named target unconditionally, which is how the
      // five-token "fún mi ni omi kan" became an expression despite the component-level
      // guard rejecting that exact text.
      if (isSentenceLikeExpressionText(targetExpression.text)) {
        console.warn("[EXPRESSION_SENTENCE_GUARD]", {
          lessonId: input.lesson.id,
          title: input.lesson.title,
          text: targetExpression.text,
          reason: "planned_target_is_sentence_like",
          note: "Planned target expression reads as a full sentence; not stored as an expression."
        });
        continue;
      }
      const expressionComponents = this.buildExpressionWordComponentRefs({
        expressionText: targetExpression.text,
        wordsByText: derivedWordsByText
      });
      const expression = await this.upsertExpressionFromSentenceComponent({
        lesson: input.lesson,
        text: targetExpression.text,
        translations: targetExpression.translations,
        components: expressionComponents
      });
      coreExpressions.set(normalize(expression.text), expression);
    }

    // The same for planned target WORDS. Words otherwise arrive only as sentence components,
    // so a lesson generated without sentences (sentencesPerLesson: 0) had nothing to teach
    // when its target was a word like `Màmá`. A word already met as a component is untouched.
    //
    // A multi-word entry here is an expression typed into Target Words, which the curriculum
    // does routinely ("Ẹ káàárọ̀", "Níbo ni") -- targetExpressionKeys above already accepts
    // both lists. It is created as an expression, not split into words, and never dropped:
    // skipping it left a lesson teaching nothing at all.
    for (const targetWord of input.targetWords || []) {
      const normalizedText = normalize(targetWord.text);
      if (!normalizedText) continue;

      if (splitWords(targetWord.text).length > 1) {
        if (coreExpressions.has(normalizedText) || isSentenceLikeExpressionText(targetWord.text)) continue;
        const expression = await this.upsertExpressionFromSentenceComponent({
          lesson: input.lesson,
          text: targetWord.text,
          translations: targetWord.translations,
          components: this.buildExpressionWordComponentRefs({
            expressionText: targetWord.text,
            wordsByText: derivedWordsByText
          })
        });
        coreExpressions.set(normalize(expression.text), expression);
        supportExpressions.delete(normalize(expression.text));
        continue;
      }

      if (coreWords.has(normalizedText)) continue;
      const word = await this.upsertWordFromSentenceComponent({
        lesson: input.lesson,
        text: targetWord.text,
        translations: targetWord.translations
      });
      coreWords.set(normalize(word.text), word);
      supportWords.delete(normalize(word.text));
    }

    await this.fillMissingExpressionExplanations(input.lesson, [
      ...coreExpressions.values(),
      ...supportExpressions.values()
    ]);
    await this.fillMissingWordExplanations(input.lesson, [...coreWords.values(), ...supportWords.values()]);

    return {
      coreWords: Array.from(coreWords.values()),
      coreExpressions: Array.from(coreExpressions.values()),
      supportWords: Array.from(supportWords.values()),
      supportExpressions: Array.from(supportExpressions.values())
    };
  }

  /**
   * Give expressions the teaching metadata their creation path cannot supply.
   *
   * Expressions are built out of SENTENCE COMPONENTS, and the component schema the sentence
   * model answers with is `{type, text, translations, fixed, role}`. There is no explanation
   * field, so `upsertExpressionFromSentenceComponent` has nothing to write and stores "".
   * That is why every expression in the corpus was empty: not a failure, a route that never
   * carried the field. The two paths that do -- AiExpressionOrchestrator and
   * LessonRefactorService -- are not on the unit generation route.
   *
   * Nothing looked broken because the learner never saw a blank. With no explanation the
   * player substitutes a canned per-language line, and the Yoruba one asserts "Used in daily
   * greetings after sunrise and in relaxed first encounters" on every expression -- including
   * `Bàbá àgbà` (grandfather) and `ń lọ` (is going).
   *
   * `enhanceExpression` is the same call `backfillExpressionExplanations.ts` makes, so a row
   * written here and a row written by the backfill come from one prompt instead of two that
   * drift apart.
   *
   * Best-effort by design, like fillGroupedComponentGlosses. An explanation is a presentation
   * detail and a unit is not worth losing over one, so a failure is logged and the row keeps
   * its empty string; the next lesson to touch that expression tries again.
   *
   * Only empty rows are sent, so an explanation written once is never rewritten, and reused
   * expressions from earlier units get filled in passing. `pronunciation` is deliberately not
   * written: each call is independent, so the same word comes back respelled differently in
   * every expression that contains it, and the word row already carries one respelling.
   */
  /**
   * The word half of fillMissingExpressionExplanations, and empty for the same reason:
   * `upsertWordFromSentenceComponent` builds a word out of a sentence component, and a
   * component carries only {type, text, translations, fixed, role}. A word that is a PLANNED
   * TARGET goes through the word prompt instead and arrives with an explanation already --
   * which is why the first five Igbo words have one and `kedu`, minted from a component,
   * does not. Support words are the same story: all 25 Yoruba words with no explanation are
   * `part_of_speech = 'unknown'`, the signature of the component path.
   *
   * `enhancePhrase` shares `buildEnhancePrompt` with `enhanceExpression`, so both follow the
   * same LLM_EXPLANATION_PROVIDER routing and a word and an expression are never explained by
   * two different models.
   *
   * Support words are included, not just the lesson's targets: tapping any word in a sentence
   * opens its panel, so a support word's explanation is read by learners too.
   */
  private async fillMissingWordExplanations(lesson: LessonEntity, words: WordEntity[]) {
    const pending = Array.from(new Map(words.map((item) => [item.id, item] as const)).values()).filter(
      (item) => !String(item.explanation || "").trim()
    );
    if (pending.length === 0) return;

    let filled = 0;
    for (const word of pending) {
      try {
        const result = await this.llm.enhancePhrase({
          text: word.text,
          translations: word.translations,
          language: lesson.language,
          level: lesson.level
        });

        const explanation = String(result?.explanation || "").trim();
        if (!isUsableTeachingExplanation(explanation, word.text, word.translations)) continue;

        await this.words.updateById(word.id, { explanation });
        word.explanation = explanation;
        filled += 1;
      } catch (error) {
        console.warn("[WORD_EXPLANATION] skipped", {
          lessonId: lesson.id,
          word: word.text,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (filled > 0) {
      console.info("[WORD_EXPLANATION] filled", { lessonId: lesson.id, filled, of: pending.length });
    }
  }

  private async fillMissingExpressionExplanations(lesson: LessonEntity, expressions: ExpressionEntity[]) {
    const pending = Array.from(new Map(expressions.map((item) => [item.id, item] as const)).values()).filter(
      (item) => !String(item.explanation || "").trim()
    );
    if (pending.length === 0) return;

    let filled = 0;
    for (const expression of pending) {
      try {
        const result = await this.llm.enhanceExpression({
          text: expression.text,
          translations: expression.translations,
          language: lesson.language,
          level: lesson.level
        });

        const explanation = String(result?.explanation || "").trim();
        if (!isUsableTeachingExplanation(explanation, expression.text, expression.translations)) continue;

        await this.expressions.updateById(expression.id, { explanation });
        expression.explanation = explanation;
        filled += 1;
      } catch (error) {
        console.warn("[EXPRESSION_EXPLANATION] skipped", {
          lessonId: lesson.id,
          expression: expression.text,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (filled > 0) {
      console.info("[EXPRESSION_EXPLANATION] filled", { lessonId: lesson.id, filled, of: pending.length });
    }
  }

  private async persistSentenceDrafts(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    currentLessonSentences: SentenceEntity[];
    componentIndex: {
      words: Map<string, WordEntity>;
      expressions: Map<string, ExpressionEntity>;
    };
  }) {
    const existingLanguageSentences = await this.sentences.list({
      language: input.lesson.language,
      languageId: input.lesson.languageId || null
    });
    const byText = new Map(
      [...existingLanguageSentences, ...input.currentLessonSentences].map(
        (sentence) => [contentTextKey(sentence.text), sentence] as const
      )
    );
    const createdOrReused: TeachingContent[] = [];
    const dropDiagnostics: Array<Record<string, unknown>> = [];
    const okDiagnostics: Array<Record<string, unknown>> = [];

    for (const draft of input.sentenceDrafts) {
      // A "sentence" that is just one word or one expression duplicates a row the learner is
      // already taught from its own card, and the duplicate then competes with it: the lesson
      // teaches the sentence `Ẹ káàárọ̀.` beside the expression `Ẹ káàárọ̀`, and a word tap
      // lands on whichever won. Unit instructions that isolate a new item ("Màmá.") produce
      // these, so the guard lives here rather than in the wording of a prompt.
      const wholeTextKey = normalize(String(draft.text || "").replace(/[.?!]+\s*$/u, ""));
      const duplicatesWord = input.componentIndex.words.get(wholeTextKey);
      const duplicatesExpression = input.componentIndex.expressions.get(wholeTextKey);
      if (duplicatesWord || duplicatesExpression) {
        dropDiagnostics.push({
          text: draft.text,
          outcome: "dropped",
          reason: duplicatesWord ? "sentence is just the word" : "sentence is just the expression"
        });
        continue;
      }

      const existing = byText.get(contentTextKey(draft.text));
      const existingMeaningSegments = Array.isArray(existing?.meaningSegments) ? existing.meaningSegments : [];
      let componentRefs: ContentComponentRef[] = existing?.components?.length ? existing.components : [];
      let failedComponent: string | null = null;

      if (componentRefs.length === 0) {
        componentRefs = [];
        let isValid = true;
        let orderIndex = 0;

        for (const component of draft.components) {
          const key = normalize(component.text);
          if (component.type === "word") {
            const content = input.componentIndex.words.get(key);
            if (!content) {
              isValid = false;
              failedComponent = `word:${component.text}`;
              break;
            }
            componentRefs.push({
              type: "word",
              refId: content.id,
              orderIndex,
              textSnapshot: content.text
            });
            orderIndex += 1;
            continue;
          }

          // Mirror the same sentence-like guard used when deriving/creating expressions
          // (deriveContentFromSentenceDrafts). A fixed component that reads like a full
          // sentence is deliberately NOT stored as an expression there, so it will not be
          // in the expression index here. Rather than drop the whole sentence, fall through
          // to the token-split path below and map it to the word entities that were created
          // for its tokens -- the sentence survives, decomposed into words, with no
          // full-sentence pollution in the expression inventory.
          if (component.fixed === true && !isSentenceLikeExpressionText(component.text)) {
            const content = input.componentIndex.expressions.get(key);
            if (!content) {
              isValid = false;
              failedComponent = `expression:${component.text}`;
              break;
            }
            componentRefs.push({
              type: "expression",
              refId: content.id,
              orderIndex,
              textSnapshot: content.text
            });
            orderIndex += 1;
            continue;
          }

          const tokenTexts = splitExpressionIntoWordTokens(component.text);
          for (const tokenText of tokenTexts) {
            const tokenWord = input.componentIndex.words.get(normalize(tokenText));
            if (!tokenWord) {
              isValid = false;
              failedComponent = `token:${tokenText} (from "${component.text}")`;
              break;
            }
            componentRefs.push({
              type: "word",
              refId: tokenWord.id,
              orderIndex,
              textSnapshot: tokenWord.text
            });
            orderIndex += 1;
          }
          if (!isValid) break;
        }

        if (!isValid) componentRefs = [];
      }

      if (componentRefs.length === 0) {
        dropDiagnostics.push({
          text: draft.text,
          matchedExisting: Boolean(existing),
          existingComponentCount: existing?.components?.length || 0,
          draftComponentCount: draft.components.length,
          failedComponent,
          indexSizes: {
            words: input.componentIndex.words.size,
            expressions: input.componentIndex.expressions.size
          }
        });
        continue;
      }

      const generatedMeaningSegments = canUseGeneratedMeaningSegmentsForSentence({
        sentenceComponents: componentRefs,
        translations: draft.translations,
        meaningSegments: draft.meaningSegments
      })
        ? buildQuestionMeaningSegmentsFromSentence({
            sentenceComponents: componentRefs,
            meaningSegments: draft.meaningSegments
          })
        : undefined;

      if (existing) {
        const mergedTranslations = Array.from(new Set([...existing.translations, ...draft.translations].filter(Boolean)));
        const meaningSegmentsForReuse =
          existingMeaningSegments.length > 0 ? existingMeaningSegments : generatedMeaningSegments || [];
        const updated = await this.sentences.updateById(existing.id, {
          translations: mergedTranslations,
          literalTranslation: existing.literalTranslation || draft.literalTranslation || "",
          usageNotes: existing.usageNotes || draft.usageNotes || "",
          explanation: existing.explanation || draft.explanation || "",
          components: existing.components.length > 0 ? existing.components : componentRefs,
          ...(existingMeaningSegments.length === 0 && generatedMeaningSegments?.length
            ? { meaningSegments: generatedMeaningSegments }
            : {})
        });
        const reused = updated || existing;
        createdOrReused.push({
          ...reused,
          components: reused.components.length > 0 ? reused.components : componentRefs,
          meaningSegments: reused.meaningSegments?.length ? reused.meaningSegments : meaningSegmentsForReuse
        });
        okDiagnostics.push({ text: draft.text, outcome: "reused", components: componentRefs.length });
        continue;
      }

      // Words inside a grouped meaning segment have no meaning of their own to show, and this
      // path never set one -- every sentence a unit run created arrived blank. Filled here,
      // where the segments are already aligned to componentRefs.
      await this.fillGroupedComponentGlosses(draft, componentRefs, generatedMeaningSegments);

      const created = await this.sentences.create({
        language: input.lesson.language,
        text: draft.text,
        textNormalized: contentTextKey(draft.text),
        translations: draft.translations,
        pronunciation: "",
        explanation: draft.explanation || "",
        examples: [],
        difficulty: Math.max(1, Math.min(5, input.lesson.level === "beginner" ? 1 : input.lesson.level === "intermediate" ? 2 : 3)),
        aiMeta: {
          generatedByAI: true,
          model: this.contentModelName,
          reviewedByAdmin: false
        },
        audio: {
          provider: "",
          model: "",
          voice: "",
          locale: "",
          format: "",
          url: "",
          s3Key: ""
        },
        literalTranslation: draft.literalTranslation || "",
        usageNotes: draft.usageNotes || "",
        components: componentRefs,
        meaningSegments: generatedMeaningSegments || [],
        status: "draft"
      });
      createdOrReused.push({
        ...created,
        components: componentRefs,
        meaningSegments: generatedMeaningSegments
      });
      okDiagnostics.push({ text: draft.text, outcome: "created", components: componentRefs.length });
      byText.set(contentTextKey(created.text), created);
    }

    if (okDiagnostics.length > 0) {
      console.info("[SENTENCE_ASSEMBLY_OK]", {
        lessonId: input.lesson.id,
        draftsIn: input.sentenceDrafts.length,
        assembled: okDiagnostics.length,
        details: okDiagnostics
      });
    }

    if (dropDiagnostics.length > 0) {
      console.warn("[SENTENCE_ASSEMBLY_DROP]", {
        lessonId: input.lesson.id,
        draftsIn: input.sentenceDrafts.length,
        assembled: createdOrReused.length,
        dropped: dropDiagnostics.length,
        details: dropDiagnostics.slice(0, 8)
      });
    }

    return createdOrReused;
  }

  // DB top-up: borrow existing same-language sentences that are on-target for this lesson
  // (share at least one of the lesson's core word/expression targets) and already have
  // resolvable components. Used only when too few fresh sentences assembled, so one short
  // lesson doesn't fail the whole unit. Ranked by how many core targets each sentence covers.
  private async topUpSentenceSourcesFromDb(input: {
    lesson: LessonEntity;
    current: TeachingContent[];
    coreTargetIds: Set<string>;
    needed: number;
  }): Promise<TeachingContent[]> {
    if (input.needed <= 0) return [];

    const usedIds = new Set(input.current.map((item) => item.id));
    const existing = await this.sentences.list({
      language: input.lesson.language,
      languageId: input.lesson.languageId || null
    });
    // Only sentences the learner has already met. Borrowing was unordered, so a lesson could
    // be filled with sentences from later in the course -- `Màmá mi ni` arrived in the
    // greeting lesson from a unit taught much later, carrying words nobody had introduced.
    const taughtBefore = await this.listSentenceIdsTaughtBefore(input.lesson);
    const candidates = existing
      .filter((sentence) => !usedIds.has(sentence.id))
      .filter((sentence) => Array.isArray(sentence.components) && sentence.components.length > 0)
      .filter((sentence) => taughtBefore.has(sentence.id));

    const picked: TeachingContent[] = [];
    const take = (list: Array<TeachingContent | undefined>) => {
      for (const sentence of list) {
        if (picked.length >= input.needed) return;
        if (!sentence || usedIds.has(sentence.id)) continue;
        usedIds.add(sentence.id);
        picked.push(sentence);
      }
    };

    // Tier 1: sentences that actually drill this lesson's core targets. Best match, so first.
    take(
      candidates
        .map((sentence) => ({
          sentence,
          overlap: (sentence.components || []).reduce(
            (count, component) => count + (input.coreTargetIds.has(component.refId) ? 1 : 0),
            0
          )
        }))
        .filter((entry) => entry.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
        .map((entry) => entry.sentence as TeachingContent)
    );
    if (picked.length >= input.needed) return picked;

    // Tier 2: sentences already taught by neighbouring lessons in the same unit, nearest
    // lesson first. Same unit means same theme, so these stay on-topic. This tier is why the
    // whole helper no longer bails when coreTargetIds is empty: a lesson with no explicit
    // targets used to borrow nothing at all and ship underfilled.
    const byId = new Map(candidates.map((sentence) => [sentence.id, sentence as TeachingContent] as const));
    take(await this.listUnitSiblingSentenceIds(input.lesson).then((ids) => ids.map((id) => byId.get(id))));
    if (picked.length >= input.needed) return picked;

    // No tier 3. Borrowing any sentence in the language put "Bàbá mi ni ọ̀rẹ́ mi." into a
    // street-kiosk unit and, worse, let a lesson report success while generation produced
    // nothing. If the unit's own material cannot fill the lesson, it fails instead.
    return picked;
  }

  /**
   * Sentences already taught to the learner by the time they reach this lesson.
   *
   * "Already" is course order -- chapter, then unit, then lesson -- not merely "exists in the
   * database". A sentence taught later cannot be revision, and pulling one in is how words
   * the learner has never seen arrived in a beginner lesson.
   */
  private async listSentenceIdsTaughtBefore(lesson: LessonEntity): Promise<Set<string>> {
    const earlierLessonIds = await this.listEarlierLessonIds(lesson);
    if (earlierLessonIds.size === 0) return new Set();
    const attachments = await this.lessonContentItems.list({ contentType: "sentence" });
    return new Set(
      attachments.filter((item) => earlierLessonIds.has(item.lessonId)).map((item) => item.contentId)
    );
  }

  /**
   * The words and expressions a learner has already been taught when they reach this lesson.
   *
   * Passed to sentence drafting as the allowed inventory, which is what makes the validator
   * reject a sentence using anything else. Without it a first lesson teaching `ni` was handed
   * `Bàbá mi ni.` -- correct Yoruba, but `mi` is the NEXT lesson's target.
   */
  private async listVocabularyTaughtBefore(lesson: LessonEntity) {
    const earlierLessonIds = await this.listEarlierLessonIds(lesson);
    if (earlierLessonIds.size === 0) return { words: [] as WordEntity[], expressions: [] as ExpressionEntity[] };

    const introduced = (
      await Promise.all([
        this.lessonContentItems.list({ contentType: "word", role: "introduce" }),
        this.lessonContentItems.list({ contentType: "expression", role: "introduce" })
      ])
    )
      .flat()
      .filter((item) => earlierLessonIds.has(item.lessonId));

    const [words, expressions] = await Promise.all([
      this.words.findByIds(introduced.filter((item) => item.contentType === "word").map((item) => item.contentId)),
      this.expressions.findByIds(
        introduced.filter((item) => item.contentType === "expression").map((item) => item.contentId)
      )
    ]);
    return { words, expressions };
  }

  /** Lessons a learner reaches before this one, in course order: chapter, then unit, then lesson. */
  private async listEarlierLessonIds(lesson: LessonEntity): Promise<Set<string>> {
    const [lessons, units, chapters] = await Promise.all([
      this.lessons.list({ language: lesson.language, languageId: lesson.languageId || null }),
      this.units.list({ language: lesson.language, languageId: lesson.languageId || null }),
      this.chapters.list({ language: lesson.language, languageId: lesson.languageId || null })
    ]);
    const chapterOrder = new Map(chapters.map((item) => [item.id, item.orderIndex ?? 0] as const));
    const unitRank = new Map(
      units.map((item) => [
        item.id,
        [chapterOrder.get(item.chapterId || "") ?? 0, item.orderIndex ?? 0, item.createdAt?.getTime() ?? 0] as const
      ] as const)
    );
    const rankOf = (item: LessonEntity) => {
      const unit = unitRank.get(item.unitId || "") ?? ([0, 0, 0] as const);
      return [...unit, item.orderIndex ?? 0, item.createdAt?.getTime() ?? 0];
    };
    const isBefore = (left: number[], right: number[]) => {
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return left[index] < right[index];
      }
      return false;
    };

    const here = rankOf(lesson);
    return new Set(
      lessons.filter((item) => item.id !== lesson.id && isBefore(rankOf(item), here)).map((item) => item.id)
    );
  }

  /** Sentence ids taught by other lessons in this lesson's unit, nearest lesson first. */
  private async listUnitSiblingSentenceIds(lesson: LessonEntity): Promise<string[]> {
    if (!lesson.unitId) return [];
    const siblings = (await this.lessons.listByUnitId(lesson.unitId))
      .filter((item) => item.id !== lesson.id && !item.deletedAt)
      .filter((item) => (item.orderIndex ?? 0) < (lesson.orderIndex ?? 0))
      .sort(
        (a, b) =>
          Math.abs((a.orderIndex || 0) - (lesson.orderIndex || 0)) -
          Math.abs((b.orderIndex || 0) - (lesson.orderIndex || 0))
      );

    const ids: string[] = [];
    for (const sibling of siblings) {
      const items = await this.lessonContentItems.list({ lessonId: sibling.id, contentType: "sentence" });
      for (const item of items) ids.push(item.contentId);
    }
    return ids;
  }

  private async ensureSupportingWordsFromExpressions(
    lesson: LessonEntity,
    expressions: ExpressionEntity[]
  ): Promise<WordEntity[]> {
    const singleWordExpressions = expressions.filter((expression) => splitWords(expression.text).length === 1);
    const results: WordEntity[] = [];

    for (const expression of singleWordExpressions) {
      const existing = await this.words.findByText(lesson.language, expression.text, lesson.languageId || null);
      if (existing) {
        const mergedTranslations = Array.from(new Set([...existing.translations, ...expression.translations].filter(Boolean)));
        const updated = await this.words.updateById(existing.id, {
          translations: mergedTranslations,
          pronunciation: existing.pronunciation || expression.pronunciation || "",
          explanation: existing.explanation || expression.explanation || ""
        });
        results.push(updated || existing);
        continue;
      }

      const created = await this.words.create({
        language: lesson.language,
        text: expression.text,
        textNormalized: normalize(expression.text),
        translations: Array.from(new Set(expression.translations.filter(Boolean))),
        pronunciation: expression.pronunciation || "",
        explanation: expression.explanation || "",
        examples: Array.isArray(expression.examples) ? expression.examples : [],
        difficulty: Number(expression.difficulty || 1),
        aiMeta: {
          generatedByAI: true,
          model: this.contentModelName,
          reviewedByAdmin: false
        },
        audio: expression.audio || {
          provider: "",
          model: "",
          voice: "",
          locale: "",
          format: "",
          url: "",
          s3Key: ""
        },
        lemma: expression.text,
        partOfSpeech: "unknown",
        status: "draft"
      });
      results.push(created);
    }

    return results;
  }

  private async wasExpressionIntroducedBeforeLesson(lesson: LessonEntity, expressionId: string) {
    return this.contentCurriculum.wasContentIntroducedBeforeLesson({
      lesson,
      contentType: "expression",
      contentId: expressionId
    });
  }

  private async rebuildUnitContentItems(unitId: string, createdBy: string) {
    await this.contentCurriculum.rebuildUnitContentItemsFromLessons({
      unitId,
      createdBy
    });
  }

  private async loadUnitPlanContext(input: { unitId: string }): Promise<UnitPlanContext> {
    const unit = await this.units.findById(input.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }

    const reviewContext = unit.kind === "review" ? await this.buildReviewGenerationContext(unit) : null;
    const reviewPlanningInventorySummary = this.buildReviewPlanningInventorySummary(reviewContext);
    const chapter = unit.chapterId ? await this.chapters.findById(unit.chapterId) : null;
    const chapterContextInstruction = chapter
      ? `Chapter context: ${chapter.title}. ${chapter.description || ""} Keep lesson sentences anchored to this chapter theme first.`
      : "";
    const reviewInstruction =
      unit.kind === "review"
        ? [
            "This is a review unit.",
            "Do not introduce arbitrary brand-new content.",
            "Generate fresh review sentences and exercises from the source units' known words and expressions.",
            "Do not treat this review unit as a normal Stage 1 vocabulary-introduction unit.",
            "Do not promote repeated-but-unintroduced helper items into new teachable targets for this review unit.",
            "Review lesson conversation goals, situations, and sentence goals must stay within the prior taught review inventory.",
            "Do not propose new teachable meanings for this review unit.",
            "Plan review lessons as anchored variation on previously taught sentences, not open-ended new sentence invention.",
            reviewContext && reviewContext.sourceUnitIds.length > 0
              ? `Review source unit count: ${reviewContext.sourceUnitIds.length}.`
              : "No explicit review source units were set, so use earlier core units in scope.",
            reviewPlanningInventorySummary
          ]
            .filter(Boolean)
            .join("\n")
        : "";

    const existingLessonsInUnit = (await this.lessons.list({ unitId: input.unitId }))
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex);
    const existingLessonIdsInUnit = existingLessonsInUnit.map((lesson) => lesson.id);
    const existingExpressionItems = existingLessonsInUnit.length
      ? await this.lessonContentItems.list({ unitId: input.unitId, contentType: "expression" })
      : [];
    const existingUnitExpressions = existingExpressionItems.length > 0
      ? await this.expressions.findByIds(Array.from(new Set(existingExpressionItems.map((item) => item.contentId))))
      : [];
    const existingUnitProverbs = existingLessonIdsInUnit.length
      ? (await Promise.all(existingLessonIdsInUnit.map((lessonId) => this.proverbs.findByLessonId(lessonId)))).flat()
      : [];
    const curriculumMemory = await this.curriculumMemory.buildUnitPlanningMemory({
      unit,
      chapter
    });

    return {
      unit,
      reviewContext,
      reviewPlanningInventorySummary,
      chapterContextInstruction,
      reviewInstruction,
      existingLessonsInUnit,
      existingUnitExpressions,
      existingUnitProverbs,
      curriculumMemory
    };
  }

  private buildRegeneratePlanningInstruction(input: {
    existingLessonsSummary: string;
    lessonGenerationInstruction?: string;
  }) {
    return [
      "Regenerate the unit from scratch while staying within the same unit theme and level.",
      "Do not repeat weak lesson breakdowns or weak titles from the previous draft unless they are clearly the best fit.",
      input.existingLessonsSummary
        ? `Previous unit draft summary to avoid shallow repetition:\n${input.existingLessonsSummary}`
        : "",
      input.lessonGenerationInstruction
    ]
      .filter(Boolean)
      .join("\n\n") || undefined;
  }

  private buildPlanMemoryInputs(planContext: UnitPlanContext) {
    const existingLessonsSummary = [
      planContext.curriculumMemory.summary,
      buildExistingLessonSummary(planContext.existingLessonsInUnit)
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      existingLessonTitles: Array.from(
        new Set([
          ...planContext.curriculumMemory.lessonTitles,
          ...planContext.existingLessonsInUnit.map((item) => item.title).filter(Boolean)
        ])
      ),
      existingPhraseTexts: Array.from(
        new Set([
          ...planContext.curriculumMemory.phraseTexts,
          ...planContext.existingUnitExpressions.map((item) => item.text).filter(Boolean)
        ])
      ),
      existingProverbTexts: Array.from(
        new Set([
          ...planContext.curriculumMemory.proverbTexts,
          ...planContext.existingUnitProverbs.map((item) => item.text).filter(Boolean)
        ])
      ),
      existingLessonsSummary
    };
  }

  private async clearUnitLessonsForRegeneration(input: {
    unitId: string;
    lessonsInUnit: LessonEntity[];
  }) {
    for (const lesson of input.lessonsInUnit) {
      await this.lessons.softDeleteById(lesson.id);
      const now = new Date();
      await this.lessonContentItems.deleteByLessonId(lesson.id);
      await this.proverbs.softDeleteByLessonId(lesson.id, now);
      await this.questions.softDeleteByLessonId(lesson.id, now);
    }
    await this.unitContentItems.deleteByUnitId(input.unitId);
    await this.lessons.compactOrderIndexesByUnit(input.unitId);
    return input.lessonsInUnit.length;
  }

  private validateApprovedUnitPlan(input: {
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    lessonCount: number;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    planLessons: LlmUnitPlanLesson[];
    /** The unit-level count; a lesson may still set its own. See validateUnitPlanLessons. */
    defaultSentencesPerLesson?: number;
  }) {
    const normalizedLessons = Array.isArray(input.planLessons)
      ? input.planLessons.map((lesson) => normalizeUnitPlanLesson(lesson))
      : [];
    const themeAnchors = extractThemeAnchors({
      unitTitle: input.unitTitle,
      unitDescription: input.unitDescription,
      topic: input.topic,
      curriculumInstruction: input.curriculumInstruction
    });
    const validation = validateUnitPlanLessons(normalizedLessons, {
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: input.unitTitle,
      unitDescription: input.unitDescription,
      topic: input.topic,
      curriculumInstruction: input.curriculumInstruction,
      themeAnchors,
      defaultSentencesPerLesson: input.defaultSentencesPerLesson
    });

    if (!validation.ok) {
      throw new AiPlanValidationError("Approved plan is invalid.", validation);
    }

    return normalizedLessons;
  }

  private async getValidatedUnitPlan(input: {
    flow: "generate" | "regenerate";
    unitId?: string;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    lessonCount: number;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    extraInstructions?: string;
    reviewMode?: boolean;
    reviewInventorySummary?: string;
    existingUnitTitles?: string[];
    existingLessonTitles?: string[];
    existingPhraseTexts?: string[];
    existingProverbTexts?: string[];
    existingLessonsSummary?: string;
  }) {
    let retryInstruction = "";
    // Each attempt regenerates the whole unit, so a lesson that validated on attempt 1 is
    // thrown away when an unrelated lesson fails. Keep the first valid version of each slot
    // and try the merged plan once every slot is filled.
    const bestLessonBySlot: Array<LlmUnitPlanLesson | null> = Array.from(
      { length: input.lessonCount },
      () => null
    );
    const attempts: Array<{
      attempt: number;
      status: "accepted" | "rejected";
      plan: LlmUnitPlanLesson[];
      validation?: { reasons: string[]; details?: unknown };
    }> = [];
    const themeAnchors = extractThemeAnchors({
      unitTitle: input.unitTitle,
      unitDescription: input.unitDescription,
      topic: input.topic,
      curriculumInstruction: input.curriculumInstruction
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const rawLessons = await this.llm.planUnitLessons({
        language: input.language,
        level: input.level,
        lessonCount: input.lessonCount,
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined,
        reviewMode: input.reviewMode,
        reviewInventorySummary: input.reviewInventorySummary,
        themeAnchors,
        existingUnitTitles: input.existingUnitTitles,
        existingLessonTitles: input.existingLessonTitles,
        existingPhraseTexts: input.existingPhraseTexts,
        existingProverbTexts: input.existingProverbTexts,
        existingLessonsSummary: input.existingLessonsSummary
      });

      const lessons = repairUnitPlanLessons(rawLessons);

      const validation = validateUnitPlanLessons(lessons, {
        language: input.language,
        level: input.level,
        lessonCount: input.lessonCount,
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction,
        themeAnchors
      });

      if (validation.ok) {
        attempts.push({
          attempt,
          status: "accepted",
          plan: lessons
        });
        await appendAiPlanLog({
          loggedAt: new Date().toISOString(),
          flow: input.flow,
          planType: "unit-plan",
          unitId: input.unitId,
          unitTitle: input.unitTitle,
          topic: input.topic,
          lessonCount: input.lessonCount,
          finalStatus: "accepted",
          finalPlan: lessons,
          attempts
        });
        return lessons;
      }

      attempts.push({
        attempt,
        status: "rejected",
        plan: lessons,
        validation: {
          reasons: validation.reasons,
          details: validation.details
        }
      });

      logAiValidation("unit-plan", {
        attempt,
        unitTitle: input.unitTitle,
        lessonCount: input.lessonCount,
        reasons: validation.reasons,
        details: validation.details
      });

      // Salvage the lessons this attempt got right, then see whether the accumulated
      // best-of-all-attempts plan validates as a whole. It still has to pass the full check
      // because duplicate-title and overlap rules are cross-lesson.
      const invalidSlots = new Set(validation.details.invalidLessonIndexes);
      lessons.forEach((lesson, index) => {
        if (index < bestLessonBySlot.length && !invalidSlots.has(index) && !bestLessonBySlot[index]) {
          bestLessonBySlot[index] = lesson;
        }
      });

      if (bestLessonBySlot.every((lesson): lesson is LlmUnitPlanLesson => Boolean(lesson))) {
        const mergedLessons = bestLessonBySlot.filter((lesson): lesson is LlmUnitPlanLesson =>
          Boolean(lesson)
        );
        const mergedValidation = validateUnitPlanLessons(mergedLessons, {
          language: input.language,
          level: input.level,
          lessonCount: input.lessonCount,
          unitTitle: input.unitTitle,
          unitDescription: input.unitDescription,
          topic: input.topic,
          curriculumInstruction: input.curriculumInstruction,
          themeAnchors
        });

        if (mergedValidation.ok) {
          attempts.push({
            attempt,
            status: "accepted",
            plan: mergedLessons
          });
          await appendAiPlanLog({
            loggedAt: new Date().toISOString(),
            flow: input.flow,
            planType: "unit-plan",
            unitId: input.unitId,
            unitTitle: input.unitTitle,
            topic: input.topic,
            lessonCount: input.lessonCount,
            finalStatus: "accepted",
            finalPlan: mergedLessons,
            attempts
          });
          return mergedLessons;
        }
      }

      if (attempt < 3) {
        retryInstruction = buildUnitPlanRetryInstruction({
          validation,
          themeAnchors
        });
        logAiRetry("unit-plan", {
          attempt,
          unitTitle: input.unitTitle,
          retryInstruction
        });
      }
    }

    await appendAiPlanLog({
      loggedAt: new Date().toISOString(),
      flow: input.flow,
      planType: "unit-plan",
      unitId: input.unitId,
      unitTitle: input.unitTitle,
      topic: input.topic,
      lessonCount: input.lessonCount,
      finalStatus: "failed",
      finalPlan: null,
      attempts,
      error: "Failed to generate a valid unit plan."
    });

    throw new Error("Failed to generate a valid unit plan.");
  }

  private async getValidatedUnitRefactorPlan(input: {
    flow: "unit-refactor" | "lesson-refactor";
    unitId?: string;
    lessonId?: string;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    lessonCount: number;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    extraInstructions?: string;
    existingLessons: LessonEntity[];
    existingLessonsSnapshot: string;
    reviewLessonIds?: Set<string>;
  }) {
    let retryInstruction = "";
    const attempts: Array<{
      attempt: number;
      status: "accepted" | "rejected";
      plan: LlmUnitRefactorPlan;
      validation?: { reasons: string[]; details?: unknown };
    }> = [];
    const themeAnchors = extractThemeAnchors({
      unitTitle: input.unitTitle,
      unitDescription: input.unitDescription,
      topic: input.topic,
      curriculumInstruction: input.curriculumInstruction
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const plan = await this.llm.planUnitRefactor({
        language: input.language,
        level: input.level,
        lessonCount: input.lessonCount,
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined,
        themeAnchors,
        existingLessonsSnapshot: input.existingLessonsSnapshot,
        existingLessonTitles: input.existingLessons.map((lesson) => lesson.title).filter(Boolean)
      });

      // Grouping is not meaning: a plan split across two patches for one lesson says the same
      // thing as one patch with both sets of operations. Fold before validating.
      const groupedPlan = mergeDuplicateLessonPatches(plan);
      const effectivePlan = input.reviewLessonIds?.size
        ? sanitizeReviewUnitRefactorPlan({
            plan: groupedPlan,
            reviewLessonIds: input.reviewLessonIds,
            existingLessons: input.existingLessons
          })
        : groupedPlan;

      const validation = validateUnitRefactorPlan({
        plan: effectivePlan,
        existingLessons: input.existingLessons,
        expectedLessonCount: input.lessonCount,
        language: input.language,
        level: input.level,
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction,
        themeAnchors
      });

      if (validation.ok) {
        attempts.push({
          attempt,
          status: "accepted",
          plan: effectivePlan
        });
        await appendAiPlanLog({
          loggedAt: new Date().toISOString(),
          flow: input.flow,
          planType: "unit-refactor-plan",
          unitId: input.unitId,
          lessonId: input.lessonId,
          unitTitle: input.unitTitle,
          topic: input.topic,
          lessonCount: input.lessonCount,
          finalStatus: "accepted",
          finalPlan: effectivePlan,
          attempts
        });
        return effectivePlan;
      }

      attempts.push({
        attempt,
        status: "rejected",
        plan: effectivePlan,
        validation: {
          reasons: validation.reasons,
          details: validation.details
        }
      });

      logAiValidation("unit-refactor-plan", {
        attempt,
        unitTitle: input.unitTitle,
        lessonCount: input.lessonCount,
        reasons: validation.reasons,
        details: validation.details
      });

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
        logAiRetry("unit-refactor-plan", {
          attempt,
          unitTitle: input.unitTitle,
          retryInstruction
        });
      }
    }

    await appendAiPlanLog({
      loggedAt: new Date().toISOString(),
      flow: input.flow,
      planType: "unit-refactor-plan",
      unitId: input.unitId,
      lessonId: input.lessonId,
      unitTitle: input.unitTitle,
      topic: input.topic,
      lessonCount: input.lessonCount,
      finalStatus: "failed",
      finalPlan: null,
      attempts,
      error: "Failed to generate a valid unit refactor plan."
    });

    throw new Error("Failed to generate a valid unit refactor plan.");
  }

  private async createPlannedLessons(input: {
    unitId: string;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    createdBy: string;
    planLessons: PlannedUnitLesson[];
    autoInsertReviewLessons?: boolean;
  }) {
    const existingLessons = await this.lessons.list({ unitId: input.unitId });
    const existingTitleSet = new Set(existingLessons.map((lesson) => normalize(lesson.title)));
    const created: Array<{ lesson: LessonEntity; plan: PlannedUnitLesson }> = [];
    const skipped: { reason: string; title?: string }[] = [];
    const errors: { title?: string; error: string }[] = [];
    let nextOrderIndex = (await this.lessons.findLastOrderIndex(input.unitId)) ?? -1;
    const recentCoreLessons: Array<{ lesson: LessonEntity; plan: LlmUnitPlanLesson }> = [];
    const autoInsertReviewLessons = input.autoInsertReviewLessons !== false;

    const buildReviewPlan = (coreLessons: Array<{ lesson: LessonEntity; plan: LlmUnitPlanLesson }>): PlannedUnitLesson | null => {
      if (coreLessons.length < 2) return null;
      const titleA = coreLessons[0].lesson.title.trim();
      const titleB = coreLessons[1].lesson.title.trim();
      const focusA = String(coreLessons[0].plan.focusSummary || "").trim();
      const focusB = String(coreLessons[1].plan.focusSummary || "").trim();
      return {
        title: `Review: ${titleA} + ${titleB}`,
        description: `Review and apply the key words, expressions, and sentence patterns from ${titleA} and ${titleB}.`,
        objectives: [
          `Review the main targets from ${titleA}.`,
          `Review the main targets from ${titleB}.`,
          "Use known content in fresh sentence exercises without introducing arbitrary new targets."
        ],
        conversationGoal: `Review and reuse the practical language from ${titleA} and ${titleB} in new situations.`,
        situations: [
          `A short review conversation that combines ${titleA} and ${titleB}.`,
          "Fresh practice using already seen language in slightly different real-life situations."
        ],
        sentenceGoals: [
          ...normalizePlanItems(coreLessons[0].plan.sentenceGoals).slice(0, 1),
          ...normalizePlanItems(coreLessons[1].plan.sentenceGoals).slice(0, 1),
          "Use familiar language in a new review sentence."
        ],
        focusSummary: [focusA, focusB].filter(Boolean).join(" + ") || `Review of ${titleA} and ${titleB}`,
        lessonMode: "review",
        reviewSourceLessonIds: coreLessons.map((item) => item.lesson.id)
      };
    };

    for (const planLesson of input.planLessons) {
      const title = String(planLesson.title || "").trim();
      if (!title) {
        skipped.push({ reason: "empty_title" });
        continue;
      }
      const titleKey = normalize(title);
      if (existingTitleSet.has(titleKey)) {
        skipped.push({ reason: "duplicate_title", title });
        continue;
      }

      try {
        nextOrderIndex += 1;
        const lesson = await this.lessons.create({
          title,
          unitId: input.unitId,
          language: input.language,
          level: input.level,
          kind: "core",
          orderIndex: nextOrderIndex,
          description: String(planLesson.description || "").trim(),
          topics: [String(planLesson.focusSummary || "").trim(), String((planLesson as { conversationGoal?: unknown }).conversationGoal || "").trim()].filter(Boolean),
          proverbs: [],
          stages: buildInitialStages(Array.isArray(planLesson.objectives) ? planLesson.objectives : []),
          status: "draft",
          createdBy: input.createdBy
        });
        existingTitleSet.add(titleKey);
        created.push({ lesson, plan: planLesson });
        if (!autoInsertReviewLessons) {
          continue;
        }
        recentCoreLessons.push({ lesson, plan: planLesson });

        if (recentCoreLessons.length === 2) {
          const reviewPlan = buildReviewPlan(recentCoreLessons);
          recentCoreLessons.length = 0;
          if (reviewPlan) {
            const reviewTitle = String(reviewPlan.title || "").trim();
            const reviewTitleKey = normalize(reviewTitle);
            if (!existingTitleSet.has(reviewTitleKey)) {
              nextOrderIndex += 1;
              const reviewLesson = await this.lessons.create({
                title: reviewTitle,
                unitId: input.unitId,
                language: input.language,
                level: input.level,
                kind: "review",
                orderIndex: nextOrderIndex,
                description: String(reviewPlan.description || "").trim(),
                topics: [String(reviewPlan.focusSummary || "").trim(), String(reviewPlan.conversationGoal || "").trim()].filter(Boolean),
                proverbs: [],
                stages: buildInitialStages(Array.isArray(reviewPlan.objectives) ? reviewPlan.objectives : []),
                status: "draft",
                createdBy: input.createdBy
              });
              existingTitleSet.add(reviewTitleKey);
              created.push({ lesson: reviewLesson, plan: reviewPlan });
            } else {
              skipped.push({ reason: "duplicate_title", title: reviewTitle });
            }
          }
        }
      } catch (error) {
        errors.push({
          title,
          error: error instanceof Error ? error.message : "Failed to create planned lesson."
        });
      }
    }

    return { created, skipped, errors };
  }

  private ensureRefactorStages(lesson: LessonEntity) {
    const sorted = Array.isArray(lesson.stages) && lesson.stages.length > 0
      ? lesson.stages
          .slice()
          .sort((left, right) => left.orderIndex - right.orderIndex)
          .map(cloneStage)
      : buildDefaultRefactorStages(lesson.id);

    while (sorted.length < 3) {
      const defaults = buildDefaultRefactorStages(lesson.id);
      sorted.push(defaults[sorted.length]);
    }

    return sorted.slice(0, 3).map((stage, index) => ({
      ...stage,
      id: stage.id || `${lesson.id}-stage-${index + 1}`,
      orderIndex: index
    }));
  }

  private async populateGeneratedLessonFromPlan(input: {
    lesson: LessonEntity;
    plan: LlmUnitPlanLesson;
    lessonMode?: "core" | "review";
    unitKind?: UnitEntity["kind"];
    sentencesPerLesson: number;
    reviewContentPerLesson?: number;
    proverbsPerLesson: number;
    createdBy: string;
    extraInstructions?: string;
    languagePool: ExpressionEntity[];
    repetitionPool: ExpressionEntity[];
    wordLanguagePool: WordEntity[];
    wordRepetitionPool: WordEntity[];
    reviewContext?: ReviewGenerationContext | null;
    questionSelectionState?: LessonQuestionSelectionState | null;
  }): Promise<LessonGenerationSummary> {
    const isReviewExerciseLesson =
      input.unitKind === "review" || input.lessonMode === "review" || input.lesson.kind === "review";
    const isSentenceOnlyReviewUnit = isReviewExerciseLesson;
    const planReviewAnchorSentenceIds = Array.isArray((input.plan as { reviewAnchorSentenceIds?: unknown }).reviewAnchorSentenceIds)
      ? ((input.plan as { reviewAnchorSentenceIds?: unknown }).reviewAnchorSentenceIds as unknown[])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];
    // The lesson's own count wins; without one it follows the unit, which is the behaviour
    // every plan had before the field existed.
    const sentencePlan = resolveSentencePlan({
      sentencesPerLesson: input.plan.sentences ?? input.sentencesPerLesson,
      isReviewLesson: isReviewExerciseLesson
    });
    const targetNewSentences = sentencePlan.targetNewSentences;
    const targetReviewContent = clampReviewContentPerLesson(
      Number(input.reviewContentPerLesson),
      targetNewSentences
    );
    const conversationGoal = String((input.plan as { conversationGoal?: unknown }).conversationGoal || "").trim();
    const situations = normalizePlanItems((input.plan as { situations?: unknown }).situations);
    const sentenceGoals = normalizePlanItems((input.plan as { sentenceGoals?: unknown }).sentenceGoals);
    const baseTargetSentenceCount = sentencePlan.sentenceFree
      ? 0
      : Math.min(
          LESSON_GENERATION_LIMITS.MAX_NEW_SENTENCES_PER_LESSON,
          Math.max(2, targetNewSentences * LESSON_GENERATION_LIMITS.MIN_SENTENCES_PER_TARGET)
        );
    const targetSentenceCount = isSentenceOnlyReviewUnit
      ? Math.max(baseTargetSentenceCount + 2, 6)
      : baseTargetSentenceCount;
    const targetReviewWords = Math.max(0, Math.floor(targetReviewContent / 2));
    const targetReviewExpressions = Math.max(0, targetReviewContent - targetReviewWords);
    // Routed again here, not just in normalizeUnitPlanLesson: this is the point where a
    // target actually becomes lesson content, and plans reach it from several callers
    // (approved-plan apply, review decoration, refactor) that do not all pass through the
    // same normalizer. Routing is idempotent, so running it twice costs nothing.
    const routedPlanTargets = routePlanTargetsByShape(
      normalizePlanTargets((input.plan as { targetWords?: unknown }).targetWords),
      normalizePlanTargets((input.plan as { targetExpressions?: unknown }).targetExpressions)
    );
    const planTargetWords = routedPlanTargets.targetWords;
    const planTargetExpressions = routedPlanTargets.targetExpressions;
    const wordTargetPlanTexts = [
      input.plan.focusSummary,
      conversationGoal,
      ...situations,
      ...sentenceGoals,
      ...input.plan.objectives,
      ...planTargetWords.flatMap((item) => [item.text, ...(item.translations || [])]),
      ...planTargetExpressions.flatMap((item) => [item.text, ...(item.translations || [])])
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    const currentLessonWords = await this.listLessonWords(input.lesson.id);
    const currentLessonExpressions = await this.listLessonExpressions(input.lesson.id);
    const currentLessonSentences = await this.listLessonSentences(input.lesson.id);
    const wordTargetPool = new Map(
      [...currentLessonWords, ...input.wordLanguagePool, ...input.wordRepetitionPool].map((item) => [
        normalize(item.text),
        item
      ] as const)
    );
    const expressionTargetPool = new Map(
      [...currentLessonExpressions, ...input.languagePool, ...input.repetitionPool].map((item) => [
        normalize(item.text),
        item
      ] as const)
    );
    const explicitCoreTargets: {
      words: Array<{ text: string; translations: string[] }>;
      expressions: Array<{ text: string; translations: string[] }>;
    } = isReviewExerciseLesson
      ? { words: [], expressions: [] }
      : {
          words: planTargetWords.map((target) => {
            const existing = wordTargetPool.get(normalize(target.text));
            return {
              text: existing?.text || target.text,
              translations: Array.from(new Set([...(target.translations || []), ...(existing?.translations || [])].filter(Boolean)))
            };
          }),
          expressions: planTargetExpressions.map((target) => {
            const existing = expressionTargetPool.get(normalize(target.text));
            return {
              text: existing?.text || target.text,
              translations: Array.from(new Set([...(target.translations || []), ...(existing?.translations || [])].filter(Boolean)))
            };
          })
        };
    const hasExplicitCoreTargets = explicitCoreTargets.words.length + explicitCoreTargets.expressions.length > 0;
    const explicitReviewAnchorSentences =
      isReviewExerciseLesson && planReviewAnchorSentenceIds.length > 0
        ? await this.listSentencesByIdsOrdered(planReviewAnchorSentenceIds)
        : [];
    const contextReviewAnchorSentences =
      isReviewExerciseLesson && input.reviewContext && input.reviewContext.knownSentences.length > 0
        ? selectReviewAnchorSentencesForLesson({
            lesson: input.plan,
            knownSentences: input.reviewContext.knownSentences,
            sentenceUsageCounts: new Map(),
            maxAnchors: REVIEW_ANCHOR_SENTENCES_PER_LESSON
          })
        : [];
    const reviewAnchorSentences = Array.from(
      new Map(
        [...explicitReviewAnchorSentences, ...contextReviewAnchorSentences].map((sentence) => [
          normalize(sentence.text) || sentence.id,
          sentence
        ] as const)
      ).values()
    ).slice(0, REVIEW_ANCHOR_SENTENCES_PER_LESSON);
    let sentenceDrafts: LlmGeneratedSentence[] = [];
    let expressionTargetsForContent: Array<{ text: string; translations: string[] }> = [];
    const reviewLockedTargets =
      input.reviewContext && input.reviewContext.sourceUnitIds.length > 0
        ? this.selectReviewLessonTargets({
            lesson: input.lesson,
            targetCount: targetNewSentences,
            planTexts: wordTargetPlanTexts,
            reviewContext: input.reviewContext,
            allowPromotedTargets: !isSentenceOnlyReviewUnit
          })
        : null;
    const useReviewFlow = Boolean(
      reviewLockedTargets &&
        (reviewLockedTargets.words.length > 0 || reviewLockedTargets.expressions.length > 0) &&
        input.reviewContext &&
        input.reviewContext.sourceUnitIds.length > 0
    );

    if (sentencePlan.sentenceFree) {
      // Nothing is drafted and nothing is borrowed: the lesson teaches the targets the plan
      // names, on their own. This is the first lesson of a unit, where the new item IS the
      // content (`Ẹ káàárọ̀` is a greeting, not a sentence) and inventing a sentence for it
      // only produced a row duplicating the word card.
      expressionTargetsForContent = explicitCoreTargets.expressions;
    } else if (useReviewFlow && input.reviewContext && reviewLockedTargets) {
      const lockedTargets = reviewLockedTargets;
      expressionTargetsForContent = lockedTargets.expressions;
      const allowedWords = Array.from(
        new Map(
          [
            ...input.reviewContext.knownWords,
            ...(isSentenceOnlyReviewUnit ? [] : input.reviewContext.promotedWords.map((candidate) => candidate.item))
          ].map((item) => [
            normalize(item.text),
            { text: item.text, translations: item.translations }
          ] as const)
        ).values()
      );
      const allowedExpressions = Array.from(
        new Map(
          [
            ...input.reviewContext.knownExpressions,
            ...(isSentenceOnlyReviewUnit ? [] : input.reviewContext.promotedExpressions.map((candidate) => candidate.item))
          ].map((item) => [
            normalize(item.text),
            { text: item.text, translations: item.translations }
          ] as const)
        ).values()
      );

      const reviewSentenceDrafts = (await this.sentenceOrchestrator.draftForLessonPlan({
        lesson: input.lesson,
        existingLessonSentences: currentLessonSentences,
        maxSentences: Math.min(targetSentenceCount, REVIEW_VARIANT_SENTENCES_PER_LESSON),
        conversationGoal,
        situations,
        sentenceGoals,
        anchorSentences: reviewAnchorSentences.map((sentence) => ({
          text: sentence.text,
          translations: sentence.translations
        })),
        allowedExpressions,
        allowedWords,
        allowDerivedComponents: false,
        extraInstructions: [
          input.extraInstructions ? input.extraInstructions.trim() : "",
          isSentenceOnlyReviewUnit ? "This is a sentence-focused review unit lesson." : "This is a review lesson.",
          "Do not invent brand-new lesson targets outside the allowed inventory.",
          "Generate close review variants from the provided anchor sentences and allowed inventory.",
          // Must agree with buildSentencesPrompt: goals outrank anchors. This line used to
          // read "Do not repeat an anchor sentence exactly", which contradicted the goal
          // rule and, because extraInstructions land last in the prompt, quietly won --
          // the model shipped "Who is THAT woman?" for the goal "Who is this woman?".
          "Sentence goals outrank anchors: render a stated sentence goal exactly, reproducing the anchor verbatim when they say the same thing. Vary only the sentences beyond the goals.",
          "Keep every generated sentence inside the same taught meaning space as the anchor sentences.",
          lockedTargets.words.length > 0
            ? `Locked review words: ${lockedTargets.words.map((item) => `${item.text} = ${item.translations.join(" / ")}`).join(" | ")}`
            : "",
          lockedTargets.expressions.length > 0
            ? `Locked review expressions: ${lockedTargets.expressions.map((item) => `${item.text} = ${item.translations.join(" / ")}`).join(" | ")}`
            : "",
          lockedTargets.expressions.length > 0
            ? "Locked review expressions are target phrases. If a phrase is breakable, split it into word components; only keep it as one expression component when the words do not teach independently."
            : "",
          "Every generated sentence must include at least one locked review target.",
          "Mark locked review targets as role=core and all other helper items as role=support.",
          "Do not promote previously unintroduced helper items into new lesson targets in this review unit.",
          "Teach the standard form of the target language first."
        ]
          .filter(Boolean)
          .join(" ")
      }))
        .map(sanitizeGeneratedSentence)
        .filter((item): item is LlmGeneratedSentence => Boolean(item));

      sentenceDrafts = this.lockSentenceDraftsToTargets(reviewSentenceDrafts, lockedTargets);
    } else {
      // What the learner may meet here: everything taught in an earlier lesson, plus this
      // lesson's own targets and whatever it already holds. Passing it makes the validator
      // reject a sentence built from anything else -- a lesson teaching `ni` was being given
      // `Bàbá mi ni.`, where `mi` is the NEXT lesson's target, because nothing said no.
      const taughtBefore = await this.listVocabularyTaughtBefore(input.lesson);
      const asAllowed = (items: Array<{ text: string; translations?: string[] }>) =>
        items
          .filter((item) => String(item.text || "").trim())
          .map((item) => ({ text: item.text, translations: item.translations || [] }));
      const allowedCoreWords = dedupeAllowedByText([
        ...asAllowed(taughtBefore.words),
        ...asAllowed(currentLessonWords),
        ...asAllowed(planTargetWords)
      ]);
      const allowedCoreExpressions = dedupeAllowedByText([
        ...asAllowed(taughtBefore.expressions),
        ...asAllowed(currentLessonExpressions),
        ...asAllowed(planTargetExpressions)
      ]);
      // A first lesson has nothing taught before it and may name no targets; with an empty
      // inventory every sentence would be rejected, so it keeps the old open behaviour.
      const hasInventory = allowedCoreWords.length + allowedCoreExpressions.length > 0;

      const discoverySentenceDrafts = (await this.sentenceOrchestrator.draftForLessonPlan({
        lesson: input.lesson,
        existingLessonSentences: currentLessonSentences,
        maxSentences: Math.max(2, Math.min(4, targetSentenceCount)),
        conversationGoal,
        situations,
        sentenceGoals,
        ...(hasInventory
          ? {
              allowedWords: allowedCoreWords,
              allowedExpressions: allowedCoreExpressions,
              allowDerivedComponents: false
            }
          : {}),
        extraInstructions: [
          hasInventory
            ? "Every sentence must use ONLY the allowed words and expressions listed above. They are what this learner has been taught; anything else is unknown to them."
            : "",
          input.extraInstructions ? input.extraInstructions.trim() : "",
          "Generate practical conversational sentences learners can actually say in this chapter and lesson.",
          "Use the generated sentences to surface reusable words and expressions, but do not teach the whole sentence as the introductory content item.",
          "Stage 1 should introduce target words and expressions first, then later stages should apply them in sentence context.",
          input.plan.focusSummary ? `Lesson focus: ${input.plan.focusSummary}` : "",
          input.plan.objectives.length > 0 ? `Lesson objectives: ${input.plan.objectives.join(" | ")}` : "",
          conversationGoal ? `Primary conversation goal: ${conversationGoal}` : "",
          situations.length > 0 ? `Situations: ${situations.join(" | ")}` : "",
          sentenceGoals.length > 0 ? `Sentence goals: ${sentenceGoals.join(" | ")}` : "",
          "Teach the standard form of the target language first."
        ]
          .filter(Boolean)
          .join(" ")
      }))
        .map(sanitizeGeneratedSentence)
        .filter((item): item is LlmGeneratedSentence => Boolean(item));

      const lockedTargets = await this.selectLockedCoreTargets({
        lesson: input.lesson,
        sentenceDrafts: discoverySentenceDrafts,
        targetCount: targetNewSentences,
        planTexts: wordTargetPlanTexts,
        currentLessonWords,
        currentLessonExpressions,
        wordLanguagePool: [...input.wordLanguagePool, ...input.wordRepetitionPool],
        expressionLanguagePool: [...input.languagePool, ...input.repetitionPool]
      });
      const effectiveLockedTargets = hasExplicitCoreTargets ? explicitCoreTargets : lockedTargets;
      // Auto-selected locked targets still steer sentence generation below, but they must
      // never create expression rows. hasExplicitCoreTargets is a combined word+expression
      // check, so a plan naming only target words fell through to model-inferred targets and
      // minted expressions ("owó mi ni", "mi ni") the plan never asked for. An expression is
      // created only when the plan explicitly names it.
      expressionTargetsForContent = explicitCoreTargets.expressions;

      sentenceDrafts = discoverySentenceDrafts;
      if (effectiveLockedTargets.words.length + effectiveLockedTargets.expressions.length > 0) {
        const lockedTargetInstruction = [
          hasExplicitCoreTargets ? "Use the approved plan targets below as the only main teachable items for this lesson." : "",
          effectiveLockedTargets.words.length > 0
            ? `Locked core words: ${effectiveLockedTargets.words.map((item) => `${item.text} = ${(item.translations || []).join(" / ")}`).join(" | ")}`
            : "",
          effectiveLockedTargets.expressions.length > 0
            ? `Locked core expressions: ${effectiveLockedTargets.expressions.map((item) => `${item.text} = ${(item.translations || []).join(" / ")}`).join(" | ")}`
            : "",
          effectiveLockedTargets.expressions.length > 0
            ? "Locked core expressions are target phrases. If a phrase is breakable, split it into word components; only keep it as one expression component when the words do not teach independently."
            : "",
          "Treat the locked targets as the main teachable items for this lesson.",
          "Every generated sentence must include at least one locked core target.",
          "Across the whole sentence set, cover every locked core target at least once.",
          "Mark locked targets as role=core and mark all other helper components as role=support."
        ]
          .filter(Boolean)
          .join(" ");

        const targetedSentenceDrafts = (await this.sentenceOrchestrator.draftForLessonPlan({
          lesson: input.lesson,
          existingLessonSentences: currentLessonSentences,
          maxSentences: targetSentenceCount,
          conversationGoal,
          situations,
          sentenceGoals,
          // The same taught-vocabulary limit as the discovery call above. Without it this
          // second pass produced `Màmá mi ni.` for a lesson teaching `ni` -- on target, so it
          // filled the lesson's slots -- while `mi` is the NEXT lesson's word.
          ...(hasInventory
            ? {
                allowedWords: allowedCoreWords,
                allowedExpressions: allowedCoreExpressions,
                allowDerivedComponents: false
              }
            : {}),
          extraInstructions: [
            input.extraInstructions ? input.extraInstructions.trim() : "",
            hasInventory
              ? "Every sentence must use ONLY the allowed words and expressions listed above. They are what this learner has been taught; anything else is unknown to them."
              : "",
            lockedTargetInstruction,
            "Generate practical conversational sentences learners can actually say in this chapter and lesson.",
            "Use the generated sentences to reinforce the locked targets, not to replace them with different introductory items.",
            "Teach the standard form of the target language first."
          ]
            .filter(Boolean)
            .join(" ")
        }))
          .map(sanitizeGeneratedSentence)
          .filter((item): item is LlmGeneratedSentence => Boolean(item));

        // keepOffTarget: the instructions ask for repetition lines that revisit earlier
        // lessons; the merge below still puts target sentences first.
        const lockedDiscoveryDrafts = this.lockSentenceDraftsToTargets(discoverySentenceDrafts, effectiveLockedTargets, {
          keepOffTarget: true
        });
        const lockedTargetedDrafts = this.lockSentenceDraftsToTargets(targetedSentenceDrafts, effectiveLockedTargets, {
          keepOffTarget: true
        });
        sentenceDrafts = this.mergeSentenceDraftsForLockedTargets({
          primary: lockedTargetedDrafts,
          fallback: lockedDiscoveryDrafts,
          lockedTargets: effectiveLockedTargets,
          maxSentences: targetSentenceCount
        });
        if (sentenceDrafts.length === 0) {
          sentenceDrafts = lockedDiscoveryDrafts;
        }
      }
    }

    const derivedContent = await this.deriveContentFromSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts,
      targetExpressions: expressionTargetsForContent,
      targetWords: explicitCoreTargets.words
    });
    const words = derivedContent.coreWords;
    const expressions = derivedContent.coreExpressions;
    const supportWords = derivedContent.supportWords;
    const supportExpressions = derivedContent.supportExpressions;

    const lessonProverbs = await this.proverbs.findByLessonId(input.lesson.id);
    let ensuredProverbs = lessonProverbs;
    if (lessonProverbs.length < input.proverbsPerLesson) {
      const missing = input.proverbsPerLesson - lessonProverbs.length;
      const generated = await this.lessonAi.generateLessonProverbs({
        lesson: input.lesson,
        count: missing,
        extraInstructions: [
          input.extraInstructions?.trim() || "",
          input.plan.focusSummary ? `Lesson focus: ${input.plan.focusSummary}` : "",
          input.plan.objectives.length > 0 ? `Lesson objectives: ${input.plan.objectives.join(" | ")}` : "",
          "Teach the standard form of the target language first."
        ]
          .filter(Boolean)
          .join(" ")
      });
      ensuredProverbs = [...lessonProverbs, ...generated];
    }

    let repeatedExpressionsLinked = 0;
    let repeatedWordsLinked = 0;
    const currentLessonExpressionIds = new Set(currentLessonExpressions.map((item) => item.id));
    const currentLessonWordIds = new Set(currentLessonWords.map((item) => item.id));
    const expressionRepetitionCandidates =
      targetReviewExpressions > 0
        ? input.repetitionPool
            .filter((item) => !currentLessonExpressionIds.has(item.id))
            .sort((a, b) => a.difficulty - b.difficulty)
        : [];
    const wordRepetitionCandidates =
      targetReviewWords > 0
        ? input.wordRepetitionPool
            .filter((item) => !currentLessonWordIds.has(item.id))
            .sort((a, b) => a.difficulty - b.difficulty)
        : [];
    const generatedWordIdSet = new Set(words.map((item) => item.id));
    const generatedExpressionIdSet = new Set(expressions.map((item) => item.id));
    const generatedWordIntroductionMap = new Map<string, boolean>();
    const generatedIntroductionMap = new Map<string, boolean>();
    for (const word of words) {
      generatedWordIntroductionMap.set(
        word.id,
        await this.contentCurriculum.wasContentIntroducedBeforeLesson({
          lesson: input.lesson,
          contentType: "word",
          contentId: word.id
        })
      );
    }
    for (const expression of expressions) {
      generatedIntroductionMap.set(
        expression.id,
        await this.wasExpressionIntroducedBeforeLesson(input.lesson, expression.id)
      );
    }
    if (input.reviewContext) {
      for (const wordId of input.reviewContext.introducedWordIds) {
        generatedWordIntroductionMap.set(wordId, true);
      }
      for (const expressionId of input.reviewContext.introducedExpressionIds) {
        generatedIntroductionMap.set(expressionId, true);
      }
    }

    const explicitWordTargetKeys = new Set(explicitCoreTargets.words.map((item) => normalize(item.text)).filter(Boolean));
    const explicitExpressionTargetKeys = new Set(
      explicitCoreTargets.expressions.map((item) => normalize(item.text)).filter(Boolean)
    );
    const explicitExpressionTokenKeys = new Set(
      explicitCoreTargets.expressions.flatMap((item) => splitExpressionIntoNormalizedWordTokens(item.text))
    );
    const explicitTeachableWordKeys = new Set([...explicitWordTargetKeys, ...explicitExpressionTokenKeys]);
    const teachableWords = words.filter((word) => {
      if (explicitTeachableWordKeys.has(normalize(word.text))) return true;
      return shouldTeachStandaloneWord({
        language: input.lesson.language,
        word,
        planTexts: wordTargetPlanTexts
      });
    });
    const teachableGeneratedWordIds = new Set(teachableWords.map((item) => item.id));
    const filteredWordRepetitionCandidates = wordRepetitionCandidates.filter((word) =>
      shouldTeachStandaloneWord({
        language: input.lesson.language,
        word,
        planTexts: wordTargetPlanTexts
      })
    );

    const prioritizeExplicitTargets = <T extends { text: string }>(items: T[], explicitKeys: Set<string>) => {
      if (explicitKeys.size === 0) return items;
      return [
        ...items.filter((item) => explicitKeys.has(normalize(item.text))),
        ...items.filter((item) => !explicitKeys.has(normalize(item.text)))
      ];
    };
    const rawGeneratedNewWords = prioritizeExplicitTargets(
      teachableWords.filter((item) => !generatedWordIntroductionMap.get(item.id)),
      explicitTeachableWordKeys
    );
    const rawGeneratedNewExpressions = prioritizeExplicitTargets(
      expressions.filter((item) => !generatedIntroductionMap.get(item.id)),
      explicitExpressionTargetKeys
    );
    // A target the curriculum named is never crowded out of its own lesson. Slicing words
    // first let words derived from the generated sentences fill every slot, so a lesson whose
    // plan said "teach Ẹ káàárọ̀" introduced Màmá instead and the greeting was introduced
    // nowhere in the course. Explicit targets are taken first and always fit; everything else
    // fills what is left, under the same caps as before.
    const isExplicitWord = (item: { text: string }) => explicitTeachableWordKeys.has(normalize(item.text));
    const isExplicitExpression = (item: { text: string }) => explicitExpressionTargetKeys.has(normalize(item.text));

    const explicitNewWords = rawGeneratedNewWords.filter(isExplicitWord);
    const spareWordSlots = Math.max(0, LESSON_GENERATION_LIMITS.MAX_NEW_WORDS_PER_LESSON - explicitNewWords.length);
    const selectedGeneratedNewWords = [
      ...explicitNewWords,
      ...rawGeneratedNewWords.filter((item) => !isExplicitWord(item)).slice(0, spareWordSlots)
    ];

    const explicitNewExpressions = rawGeneratedNewExpressions.filter(isExplicitExpression);
    const remainingNewContentSlots = Math.max(0, targetNewSentences - selectedGeneratedNewWords.length);
    const selectedGeneratedNewContent = [
      ...explicitNewExpressions,
      ...rawGeneratedNewExpressions
        .filter((item) => !isExplicitExpression(item))
        .slice(0, Math.max(0, remainingNewContentSlots - explicitNewExpressions.length))
    ];
    const selectedGeneratedReviewWords = teachableWords
      .filter((item) => generatedWordIntroductionMap.get(item.id))
      .slice(0, targetReviewWords);
    const remainingWordReviewSlots = Math.max(0, targetReviewWords - selectedGeneratedReviewWords.length);
    const selectedReviewWords = filteredWordRepetitionCandidates.slice(0, remainingWordReviewSlots);
    const selectedGeneratedReviewContent = expressions
      .filter((item) => generatedIntroductionMap.get(item.id))
      .slice(0, targetReviewExpressions);
    const remainingReviewSlots = Math.max(0, targetReviewExpressions - selectedGeneratedReviewContent.length);
    const selectedReviewContent = expressionRepetitionCandidates.slice(0, remainingReviewSlots);
    repeatedExpressionsLinked = selectedReviewContent.length;
    repeatedWordsLinked = selectedReviewWords.length;

    const selectedReviewContentIds = selectedReviewContent.map((item) => item.id);
    const selectedReviewWordIds = selectedReviewWords.map((item) => item.id);
    const selectedWordIds = Array.from(
      new Set([
        ...selectedGeneratedNewWords.map((item) => item.id),
        ...selectedGeneratedReviewWords.map((item) => item.id),
        ...selectedReviewWordIds
      ])
    );
    const selectedExpressionIds = Array.from(
      new Set([
        ...selectedGeneratedNewContent.map((item) => item.id),
        ...selectedGeneratedReviewContent.map((item) => item.id),
        ...selectedReviewContentIds
      ])
    );
    const wordById = new Map(
      [...currentLessonWords, ...input.wordLanguagePool, ...words, ...supportWords, ...input.wordRepetitionPool].map((item) => [item.id, item] as const)
    );
    const expressionById = new Map(
      [...currentLessonExpressions, ...input.languagePool, ...expressions, ...supportExpressions, ...input.repetitionPool].map((item) => [item.id, item] as const)
    );
    const focusedLessonWords = selectedWordIds
      .map((wordId) => wordById.get(wordId))
      .filter((item): item is WordEntity => Boolean(item));
    const focusedLessonExpressions = selectedExpressionIds
      .map((expressionId) => expressionById.get(expressionId))
      .filter((item): item is ExpressionEntity => Boolean(item));
    const focusedLessonContent = [...focusedLessonWords, ...focusedLessonExpressions];
    const questionOptionPool = Array.from(
      new Map(
        [
          ...supportWords,
          ...supportExpressions,
          ...focusedLessonWords,
          ...focusedLessonExpressions,
          ...currentLessonWords,
          ...currentLessonExpressions,
          ...input.wordRepetitionPool,
          ...input.repetitionPool
        ].map((item) => [getContentKey(item), item] as const)
      ).values()
    );

    const generatedFirst = focusedLessonContent.filter(
      (item) =>
        (item.kind === "word"
          ? teachableGeneratedWordIds.has(item.id) && !generatedWordIntroductionMap.get(item.id)
          : generatedExpressionIdSet.has(item.id) && !generatedIntroductionMap.get(item.id))
    );
 
    for (const word of focusedLessonWords) {
      if (!input.wordRepetitionPool.some((item) => item.id === word.id)) {
        input.wordRepetitionPool.push(word);
      }
    }
    for (const expression of focusedLessonContent) {
      if (expression.kind === "expression" && !input.repetitionPool.some((item) => item.id === expression.id)) {
        input.repetitionPool.push(expression);
      }
    }

    const stage1ContentSet = isSentenceOnlyReviewUnit
      ? new Set<string>()
      : new Set(
          generatedFirst
            .slice(0, LESSON_GENERATION_LIMITS.MAX_CONTENT_PER_STAGE)
            .map((item) => getContentKey(item))
        );
    const stage1Introductions = generatedFirst.filter((item) => stage1ContentSet.has(getContentKey(item)));

    const stage2ContentSet = new Set(focusedLessonContent.map((item) => getContentKey(item)));
    const stage3ContentSet = new Set(focusedLessonContent.map((item) => getContentKey(item)));

    const stage1Questions: QuestionEntity[] = [];
    const pendingQuestionCreates: PendingLessonQuestionCreate[] = [];
    const createdQuestions: QuestionEntity[] = [];
    const contentWasIntroducedBeforeMap = new Map<string, boolean>();

    for (const content of focusedLessonContent) {
      contentWasIntroducedBeforeMap.set(
        getContentKey(content),
        content.kind === "word"
          ? generatedWordIntroductionMap.get(content.id) ?? (await this.contentCurriculum.wasContentIntroducedBeforeLesson({
              lesson: input.lesson,
              contentType: "word",
              contentId: content.id
            }))
          : generatedIntroductionMap.get(content.id) ?? (await this.wasExpressionIntroducedBeforeLesson(input.lesson, content.id))
      );
    }

    if (!isSentenceOnlyReviewUnit) {
      for (const content of focusedLessonContent) {
        const isPreviouslyIntroduced = contentWasIntroducedBeforeMap.get(getContentKey(content)) ?? false;
        const drafts = filterDraftsForLesson(
          input.lesson,
          content.kind,
          buildQuestionDrafts(content, focusedLessonContent, questionOptionPool, isPreviouslyIntroduced)
        );
        for (const draft of drafts) {
          const stageTarget =
            draft.stage === 1
              ? stage1ContentSet
              : draft.stage === 2
                ? stage2ContentSet
                : stage3ContentSet;
          if (!stageTarget.has(getContentKey(content))) continue;
          pendingQuestionCreates.push({
            stage: draft.stage,
            sourceGroup: "target",
            sourceKey: getContentKey(content),
            questionType: draft.type,
            questionSubtype: draft.subtype,
            createInput: {
              lessonId: input.lesson.id,
              sourceType: content.kind,
              sourceId: content.id,
              translationIndex: 0,
              type: draft.type,
              subtype: draft.subtype,
              promptTemplate: draft.promptTemplate,
              options: draft.options,
              correctIndex: draft.correctIndex,
              reviewData: draft.reviewData,
              explanation: draft.explanation,
              status: "draft"
            }
          });
        }
      }
    }

    const stage2MatchingSubtype: "mt-match-image" | "mt-match-translation" =
      hashMatchingSeed(`${input.lesson.id}:${input.lesson.title}`) % 3 === 0
        ? "mt-match-image"
        : "mt-match-translation";
    const stage2MatchingDraft = buildWordMatchingQuestionDraft({
      lessonId: input.lesson.id,
      subtype: stage2MatchingSubtype,
      lessonWords: Array.from(
        new Map(
          [...focusedLessonWords, ...currentLessonWords, ...supportWords].map((item) => [item.id, item] as const)
        ).values()
      ),
      languageWords: Array.from(
        new Map(
          [...input.wordLanguagePool, ...input.wordRepetitionPool, ...focusedLessonWords, ...supportWords].map((item) => [item.id, item] as const)
        ).values()
      )
    });
    if (!isSentenceOnlyReviewUnit && stage2MatchingDraft) {
      pendingQuestionCreates.push({
        stage: 2,
        sourceGroup: "lesson",
        sourceKey: `lesson:${input.lesson.id}:matching`,
        questionType: stage2MatchingDraft.type,
        questionSubtype: stage2MatchingDraft.subtype,
        createInput: stage2MatchingDraft
      });
    }

    let generatedSentences = await this.persistSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts,
      currentLessonSentences,
      componentIndex: {
        // Resolve a sentence component against every word/expression the system already has
        // in memory (derived this run + the live language pool + current lesson + reuse pool),
        // not just this lesson's selected targets. Otherwise a fresh sentence is dropped when
        // it uses a basic word like "Mo"/"ni" that exists in the DB but isn't a lesson target.
        words: new Map(Array.from(wordById.values(), (item) => [normalize(item.text), item] as const)),
        expressions: new Map(Array.from(expressionById.values(), (item) => [normalize(item.text), item] as const))
      }
    });

    // When too few fresh sentences assembled, borrow on-target sentences from the DB (ones
    // that share a core word/expression target) before falling back to shipping underfilled.
    // Reassigning generatedSentences here means borrowed sentences flow through every
    // downstream step (question drafts, stage blocks, stats) exactly like generated ones.
    const assembledSentenceCount = generatedSentences.length;
    // A lesson asked for no sentences borrows none: pulling in old sentences to fill a quota
    // is what put untaught words in front of beginners.
    if (!sentencePlan.sentenceFree && assembledSentenceCount < sentencePlan.minSources) {
      const coreTargetIds = new Set<string>([
        ...words.map((item) => item.id),
        ...expressions.map((item) => item.id)
      ]);
      const borrowedSentences = await this.topUpSentenceSourcesFromDb({
        lesson: input.lesson,
        current: generatedSentences,
        coreTargetIds,
        needed: MIN_SENTENCE_SOURCES_PER_LESSON - assembledSentenceCount
      });
      if (borrowedSentences.length > 0) {
        generatedSentences = Array.from(
          new Map(
            [...generatedSentences, ...borrowedSentences].map((item) => [item.id, item] as const)
          ).values()
        );
      }
      console.info("[SENTENCE_TOPUP]", {
        lessonId: input.lesson.id,
        title: input.lesson.title,
        assembled: assembledSentenceCount,
        target: MIN_SENTENCE_SOURCES_PER_LESSON,
        borrowedCount: borrowedSentences.length,
        borrowed: borrowedSentences.map((item) => item.text),
        finalCount: generatedSentences.length
      });
    }
    const reviewFallbackAnchorSentences = reviewAnchorSentences.filter(
      (sentence) => !generatedSentences.some((generated) => normalize(generated.text) === normalize(sentence.text))
    );
    const reviewSentenceSources: TeachingContent[] = isReviewExerciseLesson
      ? [
          ...generatedSentences,
          ...reviewFallbackAnchorSentences.slice(0, Math.max(0, 4 - generatedSentences.length))
        ]
      : generatedSentences;
    const lessonSentenceSources = Array.from(
      new Map(reviewSentenceSources.map((sentence) => [sentence.id, sentence] as const)).values()
    );
    if (lessonSentenceSources.length < sentencePlan.floor) {
      throw new Error(
        `${isReviewExerciseLesson ? "Review lesson" : "Lesson"} requires at least ${sentencePlan.floor} sentences, but only ${lessonSentenceSources.length} could be assembled or borrowed.`
      );
    }
    if (!sentencePlan.sentenceFree && lessonSentenceSources.length < sentencePlan.minSources) {
      console.warn("[SENTENCE_UNDERFILLED]", {
        lessonId: input.lesson.id,
        title: input.lesson.title,
        count: lessonSentenceSources.length,
        target: MIN_SENTENCE_SOURCES_PER_LESSON,
        note: "Allowed below target sentence count after DB top-up; consider admin review."
      });
    }
    const sentenceQuestionPool: TeachingContent[] =
      reviewSentenceSources.length > 1
        ? reviewSentenceSources
        : [...reviewSentenceSources, ...focusedLessonContent];
    const stage1SentenceQuestions: QuestionEntity[] = [];
    const reviewStage2ScenarioQuestions: QuestionEntity[] = [];
    const reviewStage3ScenarioQuestions: QuestionEntity[] = [];

    for (const sentence of reviewSentenceSources) {
      const drafts = buildSentenceQuestionDrafts(sentence, sentenceQuestionPool, focusedLessonContent, {
        reviewMode: isReviewExerciseLesson
      });
      for (const draft of drafts) {
        pendingQuestionCreates.push({
          stage: draft.stage,
          sourceGroup: "sentence",
          sourceKey: `sentence:${sentence.id}`,
          questionType: draft.type,
          questionSubtype: draft.subtype,
          createInput: {
            lessonId: input.lesson.id,
            sourceType: "sentence",
            sourceId: sentence.id,
            translationIndex: 0,
            type: draft.type,
            subtype: draft.subtype,
            promptTemplate: draft.promptTemplate,
            options: draft.options,
            correctIndex: draft.correctIndex,
            reviewData: draft.reviewData,
            explanation: draft.explanation,
            status: "draft"
          }
        });
      }
    }

    const selectedQuestionPlan = selectLessonQuestionPlan(
      pendingQuestionCreates.map((pending) => ({
        stage: pending.stage,
        sourceGroup: pending.sourceGroup,
        sourceKey: pending.sourceKey,
        questionType: pending.questionType,
        questionSubtype: pending.questionSubtype,
        payload: pending
      })),
      {
        lessonKey: input.lesson.id,
        lessonMode: isReviewExerciseLesson ? "review" : input.lessonMode || (input.lesson.kind === "review" ? "review" : "core"),
        selectionState: input.questionSelectionState,
        commitSelection: false
      }
    );
    const selectedQuestionCreates = selectedQuestionPlan.selectedCandidates.map((candidate) => candidate.payload);
    const generatedReviewScenarioDrafts = isReviewExerciseLesson
      ? await this.buildGeneratedReviewScenarioDrafts({
          lesson: input.lesson,
          conversationGoal: input.plan.conversationGoal,
          focusedLessonContent,
          questionOptionPool
        })
      : [];
    const plannedReviewExerciseCount = selectedQuestionCreates.length + generatedReviewScenarioDrafts.length;

    // The selector's own ceiling, from its own stage and per-source limits, plus the scenario
    // drafts which are added outside selection.
    //
    // This replaced a flat requirement of 8, which for a review lesson was not a floor at all:
    // the per-source limit allows 2 questions per source sentence, so four sentences cap out at
    // exactly 8. Requiring 8 meant requiring perfection from a selector whose diversity rules
    // exist precisely to skip candidates, and one skip rolled back the entire unit.
    const reviewSelectionCeiling =
      computeReviewSelectionCeiling(
        pendingQuestionCreates.map((pending) => ({
          stage: pending.stage,
          sourceGroup: pending.sourceGroup,
          sourceKey: pending.sourceKey,
          questionType: pending.questionType,
          questionSubtype: pending.questionSubtype,
          payload: pending
        })),
        "review"
      ) + generatedReviewScenarioDrafts.length;
    const reviewExerciseTarget = computeReviewExerciseFloor(reviewSelectionCeiling);

    // Only a lesson too small to be a review at all fails the unit. Anything above that is
    // shipped and reported: an under-target review is a curriculum observation, and failing the
    // whole unit over it destroys five good lessons to punish the sixth.
    if (isReviewExerciseLesson && plannedReviewExerciseCount < MIN_VIABLE_REVIEW_EXERCISES) {
      throw new Error(
        `Review lesson needs at least ${MIN_VIABLE_REVIEW_EXERCISES} exercises to be a review, but only ${plannedReviewExerciseCount} could be assembled (selector ceiling ${reviewSelectionCeiling}, from ${lessonSentenceSources.length} source sentence(s)).`
      );
    }

    if (isReviewExerciseLesson && plannedReviewExerciseCount < reviewExerciseTarget) {
      console.warn("[REVIEW_UNDERFILLED]", {
        lessonId: input.lesson.id,
        title: input.lesson.title,
        sourceSentences: lessonSentenceSources.length,
        selectionCeiling: reviewSelectionCeiling,
        target: reviewExerciseTarget,
        plannedExercises: plannedReviewExerciseCount
      });
    }

    const stage2OrderedQuestions: QuestionEntity[] = [];
    const stage3OrderedQuestions: QuestionEntity[] = [];
    for (const pending of selectedQuestionCreates) {
      const created = await this.questions.create(pending.createInput);
      createdQuestions.push(created);
      if (pending.createInput.sourceType === "sentence") {
        if (pending.stage === 1) stage1SentenceQuestions.push(created);
      } else {
        if (pending.stage === 1) stage1Questions.push(created);
      }
      if (pending.stage === 2) stage2OrderedQuestions.push(created);
      if (pending.stage === 3) stage3OrderedQuestions.push(created);
    }

    if (isReviewExerciseLesson) {
      for (const generatedScenario of generatedReviewScenarioDrafts) {
        const created = await this.questions.create({
          lessonId: input.lesson.id,
          sourceType: generatedScenario.source.kind,
          sourceId: generatedScenario.source.id,
          translationIndex: 0,
          type: generatedScenario.draft.type,
          subtype: generatedScenario.draft.subtype,
          promptTemplate: generatedScenario.draft.promptTemplate,
          options: generatedScenario.draft.options,
          correctIndex: generatedScenario.draft.correctIndex,
          reviewData: generatedScenario.draft.reviewData,
          explanation: generatedScenario.draft.explanation,
          status: "draft"
        });
        if (generatedScenario.stage === 2) reviewStage2ScenarioQuestions.push(created);
        else reviewStage3ScenarioQuestions.push(created);
        createdQuestions.push(created);
      }
    }

    const updatedProverbs = ensuredProverbs.map((item) => ({
      text: item.text,
      translation: item.translation,
      contextNote: item.contextNote
    }));
    const nextStages = this.ensureRefactorStages(input.lesson);
    const stage1Blocks: LessonBlock[] = [];
    const sentenceById = new Map(generatedSentences.map((item) => [item.id, item] as const));
    const introContentKeySet = new Set(stage1Introductions.map((item) => getContentKey(item)));
    const stage1SentenceQuestionsByContentKey = new Map<string, QuestionEntity[]>();
    const unassignedStage1SentenceQuestions: QuestionEntity[] = [];

    for (const question of stage1SentenceQuestions) {
      const sourceId = question.sourceId;
      const sentence = sourceId ? sentenceById.get(sourceId) : null;
      const matchingContentKey = sentence?.components
        ?.map((component) => `${component.type}:${component.refId}`)
        .find((key) => introContentKeySet.has(key));
      if (!matchingContentKey) {
        unassignedStage1SentenceQuestions.push(question);
        continue;
      }
      const bucket = stage1SentenceQuestionsByContentKey.get(matchingContentKey) || [];
      bucket.push(question);
      stage1SentenceQuestionsByContentKey.set(matchingContentKey, bucket);
    }

    if (input.lesson.description.trim()) stage1Blocks.push({ type: "text", content: input.lesson.description.trim() });
    for (const content of focusedLessonContent.filter((item) => stage1ContentSet.has(getContentKey(item)))) {
      stage1Blocks.push({ type: "content", contentType: content.kind, refId: content.id });
      for (const question of stage1Questions.filter((q) => q.sourceType === content.kind && q.sourceId === content.id)) {
        stage1Blocks.push({ type: "question", refId: question.id });
      }
      for (const question of stage1SentenceQuestionsByContentKey.get(getContentKey(content)) || []) {
        stage1Blocks.push({ type: "question", refId: question.id });
      }
    }
    for (const question of unassignedStage1SentenceQuestions) {
      stage1Blocks.push({ type: "question", refId: question.id });
    }

    if (!isReviewExerciseLesson) {
      const stage1ScenarioSource = stage1Introductions.find((item) => contentSupportsContextScenario(item));
      const stage1ScenarioDraft = stage1ScenarioSource
        ? await buildAiContextScenarioQuestionDraft({
            llm: this.llm,
            language: input.lesson.language,
            level: input.lesson.level,
            lessonTitle: input.lesson.title,
            lessonDescription: input.lesson.description,
            conversationGoal: input.plan.conversationGoal,
            contentType: stage1ScenarioSource.kind,
            content: stage1ScenarioSource,
            lessonPool: stage1Introductions,
            languagePool: focusedLessonContent
          })
        : null;
      if (stage1ScenarioDraft && stage1ScenarioSource) {
        const created = await this.questions.create({
          lessonId: input.lesson.id,
          sourceType: stage1ScenarioSource.kind,
          sourceId: stage1ScenarioSource.id,
          translationIndex: 0,
          type: stage1ScenarioDraft.type,
          subtype: stage1ScenarioDraft.subtype,
          promptTemplate: stage1ScenarioDraft.promptTemplate,
          options: stage1ScenarioDraft.options,
          correctIndex: stage1ScenarioDraft.correctIndex,
          reviewData: stage1ScenarioDraft.reviewData,
          explanation: stage1ScenarioDraft.explanation,
          status: "draft"
        });
        createdQuestions.push(created);
        stage1Blocks.push({ type: "question", refId: created.id });
      }
    }

    const stage2Blocks: LessonBlock[] = [];
    for (const question of stage2OrderedQuestions) {
      if (!stage2Blocks.some((block) => block.type === "question" && block.refId === question.id)) {
        stage2Blocks.push({ type: "question", refId: question.id });
      }
    }
    for (const question of reviewStage2ScenarioQuestions) {
      stage2Blocks.push({ type: "question", refId: question.id });
    }

    const stage3Blocks: LessonBlock[] = [];
    for (const question of stage3OrderedQuestions) {
      if (!stage3Blocks.some((block) => block.type === "question" && block.refId === question.id)) {
        stage3Blocks.push({ type: "question", refId: question.id });
      }
    }
    for (const question of reviewStage3ScenarioQuestions) {
      stage3Blocks.push({ type: "question", refId: question.id });
    }
    // Last blocks in the last stage, so a lesson closes on the proverb. Capped at the
    // configured count rather than showing everything the lesson has ever accumulated: a
    // re-run over a lesson that already held proverbs would otherwise ignore the setting.
    for (const proverb of ensuredProverbs.slice(0, input.proverbsPerLesson)) {
      stage3Blocks.push({ type: "proverb", refId: proverb.id });
    }

    nextStages[0].blocks = stage1Blocks;
    nextStages[1].blocks = stage2Blocks;
    nextStages[2].blocks = stage3Blocks;

    await this.lessons.updateById(input.lesson.id, {
      stages: nextStages.filter((stage) => stage.blocks.length > 0),
      proverbs: updatedProverbs
    });
    await this.contentCurriculum.replaceLessonContentItems({
      lesson: input.lesson,
      createdBy: input.createdBy,
      introduced: stage1Introductions.map((item) => ({ contentType: item.kind, contentId: item.id })),
      review: [
        ...selectedGeneratedReviewWords,
        ...selectedReviewWords,
        ...selectedGeneratedReviewContent,
        ...selectedReviewContent
      ].map((item) => ({
        contentType: item.kind,
        contentId: item.id
      })),
      practice: [
        ...focusedLessonContent.map((item) => ({ contentType: item.kind, contentId: item.id })),
        ...lessonSentenceSources.map((item) => ({ contentType: "sentence" as const, contentId: item.id }))
      ]
    });
    if (input.questionSelectionState) {
      recordLessonQuestionSelection(
        input.questionSelectionState,
        input.lesson.id,
        selectedQuestionPlan.profileName,
        selectedQuestionPlan.selectedCandidates
      );
    }

    return {
      lessonId: input.lesson.id,
      title: input.lesson.title,
      contentGenerated: words.length + expressions.length + generatedSentences.length,
      sentencesGenerated: generatedSentences.length,
      existingContentLinked: repeatedWordsLinked + repeatedExpressionsLinked,
      newContentSelected: selectedGeneratedNewWords.length + selectedGeneratedNewContent.length,
      reviewContentSelected:
        selectedGeneratedReviewWords.length +
        selectedReviewWords.length +
        selectedGeneratedReviewContent.length +
        selectedReviewContent.length,
      contentDroppedFromCandidates: Math.max(
        0,
        words.length +
          expressions.length -
          selectedGeneratedNewWords.length -
          selectedGeneratedReviewWords.length -
          selectedGeneratedNewContent.length -
          selectedGeneratedReviewContent.length
      ),
      proverbsGenerated: ensuredProverbs.length,
      questionsGenerated: createdQuestions.length,
      blocksGenerated:
        stage1Blocks.length +
        stage2Blocks.length +
        stage3Blocks.length
    };
  }


  /**
   * The model to stamp on generated content. Sentence work can be routed to a different model
   * than the bulk tasks, and everything created here comes out of that path -- the sentences
   * themselves, and the words and expressions decomposed from them. Reporting `modelName`
   * would name the bulk model for content it never saw.
   */
  private get contentModelName(): string {
    return this.llm.sentenceModelName || this.llm.modelName;
  }

  /**
   * Give a meaning to components a grouped segment cannot explain.
   *
   * A segment covering one component IS that component's meaning; one covering several says
   * nothing about any of them, and the word panel presents a per-word meaning as fact. Without
   * this those words fall back to their dictionary entry -- honest but vague, and previously
   * the source of `ń` being shown as "are".
   *
   * Best-effort by design. A gloss is a presentation detail and a lesson is not worth losing
   * over one, so any failure leaves the glosses empty and generation continues.
   */
  private async fillGroupedComponentGlosses(
    draft: LlmGeneratedSentence,
    componentRefs: ContentComponentRef[],
    meaningSegments: Array<{ sourceComponentIndexes?: number[] }> | undefined
  ): Promise<void> {
    if (!meaningSegments?.length) return;
    const translation = String(draft.translations?.[0] || "").trim();
    if (!translation) return; // nothing to gloss against

    const targets = new Set<number>();
    for (const segment of meaningSegments) {
      const indexes = segment?.sourceComponentIndexes || [];
      if (indexes.length < 2) continue; // a 1:1 segment already IS that word's meaning
      for (const index of indexes) {
        const ref = componentRefs[index];
        if (ref && !ref.gloss) targets.add(index);
      }
    }
    if (!targets.size) return;

    // The class already holds the routed client; glossing rides the sentence model with it.
    if (typeof this.llm.glossComponents !== "function") return;

    // Caught, not propagated. The guards in componentGloss.ts reject a whole sentence when the
    // model alters a word or overruns the gloss length, which is right for the gloss but wrong
    // as a reason to fail generation: the sentence itself is already valid and every word still
    // resolves through its dictionary entry. Losing a unit run over a presentation detail is
    // the worse outcome, so a failure is logged and the glosses stay empty.
    let results: Awaited<ReturnType<NonNullable<typeof this.llm.glossComponents>>>;
    try {
      results = await this.llm.glossComponents({
        sentence: draft.text,
        translation,
        components: componentRefs.map((ref, index) => ({
          index,
          text: String(ref.textSnapshot || "")
        })),
        targets: [...targets].sort((a, b) => a - b)
      });
    } catch (error) {
      console.warn("[GLOSS_COMPONENTS] skipped", {
        sentence: draft.text.slice(0, 40),
        of: targets.size,
        reason: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    for (const result of results) {
      const ref = componentRefs[result.index];
      if (ref && !ref.gloss) ref.gloss = result.gloss;
    }
    if (results.length) {
      console.info("[GLOSS_COMPONENTS] filled", {
        sentence: draft.text.slice(0, 40),
        filled: results.length,
        of: targets.size
      });
    }
  }

  async generate(input: GenerateUnitAiContentInput) {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const planMemory = this.buildPlanMemoryInputs(planContext);
    const rawPlanLessons = await this.getValidatedUnitPlan({
      flow: input.planLoggingFlow || "generate",
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: planContext.unit.title,
      unitDescription: planContext.unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: input.lessonGenerationInstruction,
      extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction, planContext.reviewInstruction].filter(Boolean).join("\n"),
      reviewMode: planContext.unit.kind === "review",
      reviewInventorySummary: planContext.reviewPlanningInventorySummary,
      existingUnitTitles: (await this.units.listByLanguage(input.language, planContext.unit.languageId || undefined))
        .map((item) => item.title)
        .filter(Boolean),
      existingLessonTitles: planMemory.existingLessonTitles,
      existingPhraseTexts: planMemory.existingPhraseTexts,
      existingProverbTexts: planMemory.existingProverbTexts,
      existingLessonsSummary: planMemory.existingLessonsSummary
    });
    const planLessons =
      planContext.unit.kind === "review"
        ? this.decorateReviewPlanLessons({
            planLessons: rawPlanLessons,
            reviewContext: planContext.reviewContext
          })
        : rawPlanLessons;
    return this.executeGenerateFromPlan({
      generateInput: {
        ...input,
        extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction].filter(Boolean).join("\n") || undefined
      },
      unitKind: planContext.unit.kind,
      planLessons,
      reviewContext: planContext.reviewContext,
      existingLessonsInUnit: planContext.existingLessonsInUnit,
      existingUnitExpressions: planContext.existingUnitExpressions
    });
  }


  /**
   * Undo a failed unit generation. A partially-generated unit is worse than none: half its
   * lessons are empty shells, and the words/sentences it minted stay in the inventory and
   * get borrowed into later units.
   *
   * Only content created DURING this run is removed, and only when nothing else still
   * references it. Anything reused from earlier lessons is left alone -- reuse is normal and
   * those rows belong to whichever lesson introduced them.
   */
  private async rollbackUnitGeneration(input: {
    unitId: string;
    language: LessonEntity["language"];
    lessonIds: string[];
    runStartedAt: Date;
  }) {
    const now = new Date();
    const removed = { lessons: 0, words: 0, expressions: 0, sentences: 0, proverbs: 0, questions: 0 };

    // Questions and proverbs hang off a lesson, so they go with it. Stages and blocks are
    // FK-cascaded from the lesson row.
    for (const lessonId of input.lessonIds) {
      await this.questions.softDeleteByLessonId(lessonId, now).catch(() => undefined);
      await this.proverbs.softDeleteByLessonId(lessonId, now).catch(() => undefined);
      await this.lessonContentItems.deleteByLessonId(lessonId).catch(() => undefined);
      const deleted = await this.lessons.softDeleteById(lessonId).catch(() => null);
      if (deleted) removed.lessons += 1;
    }

    // Vocabulary is shared, so it can only go once the run's lessons have released it.
    const startedAt = input.runStartedAt.getTime();
    const createdInRun = <T extends { id: string; createdAt?: Date | string | null }>(items: T[]) =>
      items.filter((item) => {
        const created = item.createdAt ? new Date(item.createdAt).getTime() : 0;
        return created >= startedAt;
      });

    const stillReferenced = async (type: "word" | "expression" | "sentence", ids: string[]) => {
      if (ids.length === 0) return new Set<string>();
      const links = await this.lessonContentItems.listByContent(type, ids).catch(() => []);
      return new Set(links.map((link) => link.contentId));
    };

    const [words, expressions, sentences] = await Promise.all([
      this.words.list({ language: input.language }).catch(() => []),
      this.expressions.list({ language: input.language }).catch(() => []),
      this.sentences.list({ language: input.language }).catch(() => [])
    ]);

    const freshWords = createdInRun(words);
    const freshExpressions = createdInRun(expressions);
    const freshSentences = createdInRun(sentences);

    const [keepWords, keepExpressions, keepSentences] = await Promise.all([
      stillReferenced("word", freshWords.map((item) => item.id)),
      stillReferenced("expression", freshExpressions.map((item) => item.id)),
      stillReferenced("sentence", freshSentences.map((item) => item.id))
    ]);

    for (const word of freshWords) {
      if (keepWords.has(word.id)) continue;
      if (await this.words.softDeleteById(word.id).catch(() => null)) removed.words += 1;
    }
    for (const expression of freshExpressions) {
      if (keepExpressions.has(expression.id)) continue;
      if (await this.expressions.softDeleteById(expression.id).catch(() => null)) removed.expressions += 1;
    }
    for (const sentence of freshSentences) {
      if (keepSentences.has(sentence.id)) continue;
      if (await this.sentences.softDeleteById(sentence.id).catch(() => null)) removed.sentences += 1;
    }

    console.warn("[UNIT_AI_GENERATE] rolled_back", { unitId: input.unitId, ...removed });
    return removed;
  }

  private async executeGenerateFromPlan(input: {
    generateInput: GenerateUnitAiContentInput;
    unitKind: UnitEntity["kind"];
    planLessons: PlannedUnitLesson[];
    reviewContext: ReviewGenerationContext | null;
    existingLessonsInUnit: LessonEntity[];
    existingUnitExpressions: ExpressionEntity[];
    runMode?: UnitAiRunSummary["mode"];
    updatedLessons?: number;
    clearedLessons?: number;
  }) {
    const runStartedAt = Date.now();
    console.info("[UNIT_AI_GENERATE] start", {
      unitId: input.generateInput.unitId,
      runMode: input.runMode || "generate",
      requestedLessons: input.generateInput.lessonCount,
      planLessons: input.planLessons.length,
      unitKind: input.unitKind
    });

    const lessonResult = await this.createPlannedLessons({
      unitId: input.generateInput.unitId,
      language: input.generateInput.language,
      level: input.generateInput.level,
      createdBy: input.generateInput.createdBy,
      planLessons: input.planLessons,
      autoInsertReviewLessons: input.unitKind !== "review"
    });

    let languagePool = await this.expressions.list({ language: input.generateInput.language });
    let wordLanguagePool = await this.words.list({ language: input.generateInput.language });
    const repetitionPool: ExpressionEntity[] = [...input.existingUnitExpressions];
    const existingWordItems = input.existingLessonsInUnit.length
      ? await this.lessonContentItems.list({ unitId: input.generateInput.unitId, contentType: "word" })
      : [];
    const existingUnitWords = existingWordItems.length > 0
      ? await this.words.findByIds(Array.from(new Set(existingWordItems.map((item) => item.contentId))))
      : [];
    const wordRepetitionPool: WordEntity[] = [...existingUnitWords];
    const lessonSummaries: LessonGenerationSummary[] = [];
    const errors: Array<{ lessonId?: string; title?: string; error: string }> = [];
    const createdLessonById = new Map(lessonResult.created.map((item) => [item.lesson.id, item.lesson] as const));
    const questionSelectionState = createLessonQuestionSelectionState({
      lessons: lessonResult.created.map((item) => ({
        lessonKey: item.lesson.id,
        lessonMode: input.unitKind === "review"
          ? "review"
          : item.plan.lessonMode || (item.lesson.kind === "review" ? "review" : "core")
      }))
    });

    for (const item of lessonResult.created) {
      const lessonStartedAt = Date.now();
      console.info("[UNIT_AI_GENERATE] lesson:start", {
        unitId: input.generateInput.unitId,
        lessonId: item.lesson.id,
        title: item.lesson.title,
        lessonMode: item.plan.lessonMode || item.lesson.kind
      });
      try {
        const planReviewSourceLessonIds = Array.isArray((item.plan as { reviewSourceLessonIds?: unknown }).reviewSourceLessonIds)
          ? ((item.plan as { reviewSourceLessonIds?: unknown }).reviewSourceLessonIds as unknown[])
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        const perLessonReviewContext =
          planReviewSourceLessonIds.length > 0
            ? await this.buildReviewGenerationContextFromLessons(
                planReviewSourceLessonIds
                  .map((lessonId) => createdLessonById.get(lessonId))
                  .filter((lesson): lesson is LessonEntity => Boolean(lesson))
              )
            : input.reviewContext;
        const summary = await this.populateGeneratedLessonFromPlan({
          lesson: item.lesson,
          plan: item.plan,
          lessonMode: item.plan.lessonMode,
          unitKind: input.unitKind,
          sentencesPerLesson: input.generateInput.sentencesPerLesson,
          reviewContentPerLesson: input.generateInput.reviewContentPerLesson,
          proverbsPerLesson: input.generateInput.proverbsPerLesson,
          createdBy: input.generateInput.createdBy,
          extraInstructions: input.generateInput.extraInstructions,
          languagePool,
          repetitionPool,
          wordLanguagePool,
          wordRepetitionPool,
          reviewContext: perLessonReviewContext,
          questionSelectionState
        });
        lessonSummaries.push(summary);
        console.info("[UNIT_AI_GENERATE] lesson:success", {
          unitId: input.generateInput.unitId,
          lessonId: item.lesson.id,
          title: item.lesson.title,
          durationMs: Date.now() - lessonStartedAt,
          contentGenerated: summary.contentGenerated,
          sentencesGenerated: summary.sentencesGenerated,
          proverbsGenerated: summary.proverbsGenerated,
          questionsGenerated: summary.questionsGenerated,
          blocksGenerated: summary.blocksGenerated
        });
        languagePool = await this.expressions.list({ language: input.generateInput.language });
        wordLanguagePool = await this.words.list({ language: input.generateInput.language });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate lesson content.";
        console.error("[UNIT_AI_GENERATE] lesson:error", {
          unitId: input.generateInput.unitId,
          lessonId: item.lesson.id,
          title: item.lesson.title,
          durationMs: Date.now() - lessonStartedAt,
          error: message
        });
        // One failed lesson fails the unit. A partially generated unit leaves empty lessons
        // in the sequence and its half-built vocabulary leaks into later units through
        // borrowing, so unwind everything this run created before giving up.
        await this.rollbackUnitGeneration({
          unitId: input.generateInput.unitId,
          language: input.generateInput.language,
          lessonIds: lessonResult.created.map((entry) => entry.lesson.id),
          runStartedAt: new Date(runStartedAt)
        });
        throw new Error(`Unit generation failed on lesson "${item.lesson.title}": ${message}`);
      }
    }
    await this.rebuildUnitContentItems(input.generateInput.unitId, input.generateInput.createdBy);

    const result = {
      unitId: input.generateInput.unitId,
      requestedLessons: input.generateInput.lessonCount,
      createdLessons: lessonResult.created.length,
      skippedLessons: lessonResult.skipped,
      lessonGenerationErrors: lessonResult.errors,
      contentErrors: errors,
      lessons: lessonSummaries
    };
    await this.saveLatestAiRun(input.generateInput.unitId, {
      mode: input.runMode || "generate",
      createdBy: input.generateInput.createdBy,
      createdAt: new Date(),
      requestedLessons: result.requestedLessons,
      createdLessons: result.createdLessons,
      updatedLessons: input.updatedLessons,
      clearedLessons: input.clearedLessons,
      skippedLessons: result.skippedLessons,
      lessonGenerationErrors: result.lessonGenerationErrors,
      contentErrors: result.contentErrors,
      lessons: result.lessons
    });
    console.info("[UNIT_AI_GENERATE] complete", {
      unitId: input.generateInput.unitId,
      runMode: input.runMode || "generate",
      durationMs: Date.now() - runStartedAt,
      createdLessons: result.createdLessons,
      lessonGenerationErrors: result.lessonGenerationErrors.length,
      contentErrors: result.contentErrors.length
    });
    return result;
  }

  async previewGeneratePlan(input: GenerateUnitAiContentInput): Promise<PreviewGenerateUnitPlanResult> {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const planMemory = this.buildPlanMemoryInputs(planContext);
    const rawCoreLessons = await this.getValidatedUnitPlan({
      flow: input.planLoggingFlow || "generate",
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: planContext.unit.title,
      unitDescription: planContext.unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: input.lessonGenerationInstruction,
      extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction, planContext.reviewInstruction].filter(Boolean).join("\n"),
      reviewMode: planContext.unit.kind === "review",
      reviewInventorySummary: planContext.reviewPlanningInventorySummary,
      existingUnitTitles: (await this.units.listByLanguage(input.language, planContext.unit.languageId || undefined))
        .map((item) => item.title)
        .filter(Boolean),
      existingLessonTitles: planMemory.existingLessonTitles,
      existingPhraseTexts: planMemory.existingPhraseTexts,
      existingProverbTexts: planMemory.existingProverbTexts,
      existingLessonsSummary: planMemory.existingLessonsSummary
    });
    const coreLessons =
      planContext.unit.kind === "review"
        ? this.decorateReviewPlanLessons({
            planLessons: rawCoreLessons,
            reviewContext: planContext.reviewContext
          })
        : rawCoreLessons;
    const lessonSequence = buildAutoInsertedReviewLessonSequence(coreLessons, {
      autoInsertReviewLessons: planContext.unit.kind !== "review"
    });

    const createdAt = new Date();
    const settings = {
      lessonCount: input.lessonCount,
      sentencesPerLesson: input.sentencesPerLesson,
      reviewContentPerLesson: input.reviewContentPerLesson,
      proverbsPerLesson: input.proverbsPerLesson,
      topics: input.topics,
      extraInstructions: input.extraInstructions
    };
    const preview = {
      unitId: input.unitId,
      mode: "generate" as const,
      createdBy: input.createdBy,
      createdAt,
      requestedLessons: input.lessonCount,
      actualLessonCount: lessonSequence.length,
      coreLessons,
      lessonSequence,
      settings
    };
    await this.saveLatestAiPreviewPlan(input.unitId, preview);
    return preview;
  }

  async previewRegeneratePlan(input: GenerateUnitAiContentInput): Promise<PreviewGenerateUnitPlanResult> {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const planMemory = this.buildPlanMemoryInputs(planContext);
    const rawCoreLessons = await this.getValidatedUnitPlan({
      flow: "regenerate",
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: planContext.unit.title,
      unitDescription: planContext.unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: this.buildRegeneratePlanningInstruction({
        existingLessonsSummary: planMemory.existingLessonsSummary,
        lessonGenerationInstruction: input.lessonGenerationInstruction
      }),
      extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction, planContext.reviewInstruction]
        .filter(Boolean)
        .join("\n"),
      reviewMode: planContext.unit.kind === "review",
      reviewInventorySummary: planContext.reviewPlanningInventorySummary,
      existingUnitTitles: (await this.units.listByLanguage(input.language, planContext.unit.languageId || undefined))
        .map((item) => item.title)
        .filter(Boolean),
      existingLessonTitles: planMemory.existingLessonTitles,
      existingPhraseTexts: planMemory.existingPhraseTexts,
      existingProverbTexts: planMemory.existingProverbTexts,
      existingLessonsSummary: planMemory.existingLessonsSummary
    });
    const coreLessons =
      planContext.unit.kind === "review"
        ? this.decorateReviewPlanLessons({
            planLessons: rawCoreLessons,
            reviewContext: planContext.reviewContext
          })
        : rawCoreLessons;
    const lessonSequence = buildAutoInsertedReviewLessonSequence(coreLessons, {
      autoInsertReviewLessons: planContext.unit.kind !== "review"
    });

    const createdAt = new Date();
    const settings = {
      lessonCount: input.lessonCount,
      sentencesPerLesson: input.sentencesPerLesson,
      reviewContentPerLesson: input.reviewContentPerLesson,
      proverbsPerLesson: input.proverbsPerLesson,
      topics: input.topics,
      extraInstructions: input.extraInstructions
    };
    const preview = {
      unitId: input.unitId,
      mode: "regenerate" as const,
      createdBy: input.createdBy,
      createdAt,
      requestedLessons: input.lessonCount,
      actualLessonCount: lessonSequence.length,
      coreLessons,
      lessonSequence,
      settings
    };
    await this.saveLatestAiPreviewPlan(input.unitId, preview);
    return preview;
  }

  async generateFromApprovedPlan(input: GenerateUnitAiContentInput & { planLessons: LlmUnitPlanLesson[] }) {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const normalizedPlanLessons = this.validateApprovedUnitPlan({
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: planContext.unit.title,
      unitDescription: planContext.unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: input.lessonGenerationInstruction,
      planLessons: input.planLessons,
      // Each lesson may set its own count; this is the default for those that do not.
      defaultSentencesPerLesson: Number(input.sentencesPerLesson)
    });
    const effectivePlanLessons =
      planContext.unit.kind === "review"
        ? this.decorateReviewPlanLessons({
            planLessons: normalizedPlanLessons,
            reviewContext: planContext.reviewContext
          })
        : normalizedPlanLessons;

    return this.executeGenerateFromPlan({
      generateInput: {
        ...input,
        extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction].filter(Boolean).join("\n") || undefined
      },
      unitKind: planContext.unit.kind,
      planLessons: effectivePlanLessons,
      reviewContext: planContext.reviewContext,
      existingLessonsInUnit: planContext.existingLessonsInUnit,
      existingUnitExpressions: planContext.existingUnitExpressions
    });
  }

  async regenerateFromApprovedPlan(input: GenerateUnitAiContentInput & { planLessons: LlmUnitPlanLesson[] }) {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const planMemory = this.buildPlanMemoryInputs(planContext);
    const normalizedPlanLessons = this.validateApprovedUnitPlan({
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: planContext.unit.title,
      unitDescription: planContext.unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: this.buildRegeneratePlanningInstruction({
        existingLessonsSummary: planMemory.existingLessonsSummary,
        lessonGenerationInstruction: input.lessonGenerationInstruction
      }),
      planLessons: input.planLessons,
      // Each lesson may set its own count; this is the default for those that do not.
      defaultSentencesPerLesson: Number(input.sentencesPerLesson)
    });
    const effectivePlanLessons =
      planContext.unit.kind === "review"
        ? this.decorateReviewPlanLessons({
            planLessons: normalizedPlanLessons,
            reviewContext: planContext.reviewContext
          })
        : normalizedPlanLessons;

    const clearedLessons = await this.clearUnitLessonsForRegeneration({
      unitId: input.unitId,
      lessonsInUnit: planContext.existingLessonsInUnit
    });

    const result = await this.executeGenerateFromPlan({
      generateInput: {
        ...input,
        planLoggingFlow: "regenerate",
        extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction].filter(Boolean).join("\n") || undefined
      },
      unitKind: planContext.unit.kind,
      planLessons: effectivePlanLessons,
      reviewContext: planContext.reviewContext,
      existingLessonsInUnit: [],
      existingUnitExpressions: [],
      runMode: "regenerate",
      updatedLessons: 0,
      clearedLessons
    });

    return {
      ...result,
      revisionMode: "regenerate" as const,
      updatedLessons: 0,
      clearedLessons
    };
  }

  async refactorLesson(input: {
    lessonId: string;
    createdBy: string;
    topic?: string;
    extraInstructions?: string;
    lessonGenerationInstruction?: string;
  }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson) {
      throw new Error("Lesson not found.");
    }

    const unit = await this.units.findById(lesson.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }
    const chapter = unit.chapterId ? await this.chapters.findById(unit.chapterId) : null;
    const chapterContextInstruction = chapter
      ? `Chapter context: ${chapter.title}. ${chapter.description || ""} Keep lesson sentences anchored to this chapter theme first.`
      : "";
    const isReviewRefactor = unit.kind === "review" || lesson.kind === "review";
    const reviewContext = isReviewRefactor ? await this.buildReviewGenerationContext(unit) : null;
    const reviewPlanningInventorySummary = this.buildReviewPlanningInventorySummary(reviewContext);
    const reviewInstruction =
      isReviewRefactor
        ? [
            "This is a review lesson/refactor.",
            "Do not introduce arbitrary brand-new content.",
            "Do not treat this review content as a normal Stage 1 vocabulary-introduction lesson.",
            "Review refactor patches may remove or reorder existing question blocks only.",
            "Do not use add_text_block, add_word_bundle, add_expression_bundle, add_sentence_bundle, replace_word_bundle, replace_expression_bundle, replace_sentence_bundle, or add_match_translation_block for existing review lessons.",
            "Do not add text blocks, content blocks, direct matching blocks, or new teachable word/expression/sentence bundles to existing review lessons.",
            reviewPlanningInventorySummary
          ]
            .filter(Boolean)
            .join("\n")
        : "";

    const existingLessonsSnapshot = await this.buildExistingLessonsSnapshot([lesson]);
    const refactorPlan = await this.getValidatedUnitRefactorPlan({
      flow: "lesson-refactor",
      unitId: unit.id,
      lessonId: lesson.id,
      language: lesson.language,
      level: lesson.level,
      lessonCount: 1,
      unitTitle: unit.title,
      unitDescription: unit.description,
      topic: input.topic,
      curriculumInstruction: input.lessonGenerationInstruction,
      extraInstructions: [input.extraInstructions, chapterContextInstruction, reviewInstruction].filter(Boolean).join("\n"),
      existingLessons: [lesson],
      existingLessonsSnapshot,
      reviewLessonIds: isReviewRefactor ? new Set([lesson.id]) : undefined
    });

    const patch = (Array.isArray(refactorPlan.lessonPatches) ? refactorPlan.lessonPatches : []).find(
      (item) => item.lessonId === lesson.id
    );
    const expressionLanguagePool = await this.expressions.list({
      language: lesson.language,
      languageId: lesson.languageId || null
    });
    const wordLanguagePool = await this.words.list({
      language: lesson.language,
      languageId: lesson.languageId || null
    });
    const summary = patch && Array.isArray(patch.operations) && patch.operations.length > 0
      ? await this.lessonRefactors.applyPatchPlan({
          lesson,
          patch,
          languagePool: expressionLanguagePool,
          wordLanguagePool,
          createdBy: input.createdBy
        })
      : {
          lessonId: lesson.id,
          title: lesson.title,
          contentGenerated: 0,
          sentencesGenerated: 0,
          existingContentLinked: 0,
          newContentSelected: 0,
          reviewContentSelected: 0,
          contentDroppedFromCandidates: 0,
          proverbsGenerated: 0,
          questionsGenerated: 0,
          blocksGenerated: lesson.stages.reduce((sum, stage) => sum + stage.blocks.length, 0)
        };

    await this.saveLatestAiRun(unit.id, {
      mode: "refactor",
      createdBy: input.createdBy,
      createdAt: new Date(),
      requestedLessons: 1,
      createdLessons: 0,
      updatedLessons: patch?.operations?.length ? 1 : 0,
      clearedLessons: 0,
      skippedLessons: [],
      lessonGenerationErrors: [],
      contentErrors: [],
      lessons: [summary]
    });

    return {
      unitId: unit.id,
      lessonId: lesson.id,
      updatedLesson: Boolean(patch?.operations?.length),
      lesson: summary,
      patch: patch || null
    };
  }

  async revise(input: GenerateUnitAiContentInput & { mode: "refactor" | "regenerate" }) {
    const unit = await this.units.findById(input.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }
    const reviewContext = unit.kind === "review" ? await this.buildReviewGenerationContext(unit) : null;
    const reviewPlanningInventorySummary = this.buildReviewPlanningInventorySummary(reviewContext);
    const chapter = unit.chapterId ? await this.chapters.findById(unit.chapterId) : null;
    const chapterContextInstruction = chapter
      ? `Chapter context: ${chapter.title}. ${chapter.description || ""} Keep lesson sentences anchored to this chapter theme first.`
      : "";
    const reviewInstruction =
      unit.kind === "review"
        ? [
            "This is a review unit.",
            "Do not introduce arbitrary brand-new content.",
            "Generate fresh review sentences and exercises from the source units' known words and expressions.",
            "Do not treat this review unit as a normal Stage 1 vocabulary-introduction unit.",
            "Do not promote repeated-but-unintroduced helper items into new teachable targets for this review unit.",
            "Review lesson conversation goals, situations, and sentence goals must stay within the prior taught review inventory.",
            "Do not propose new teachable meanings for this review unit.",
            "Plan review lessons as anchored variation on previously taught sentences, not open-ended new sentence invention.",
            "For refactor patches on existing review lessons, only remove blocks, remove bundles, or move existing question blocks.",
            "Do not use add_text_block, add_word_bundle, add_expression_bundle, add_sentence_bundle, replace_word_bundle, replace_expression_bundle, replace_sentence_bundle, or add_match_translation_block on existing review lessons.",
            "Do not add text blocks, content blocks, direct matching blocks, or new teachable word/expression/sentence bundles to existing review lessons.",
            reviewContext && reviewContext.sourceUnitIds.length > 0
              ? `Review source unit count: ${reviewContext.sourceUnitIds.length}.`
              : "No explicit review source units were set, so use earlier core units in scope.",
            reviewPlanningInventorySummary
          ]
            .filter(Boolean)
            .join("\n")
        : "";

    const existingLessonsInUnit = (await this.lessons.list({ unitId: input.unitId }))
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex);
    const existingSummary = buildExistingLessonSummary(existingLessonsInUnit);
    if (input.mode === "regenerate") {
      for (const lesson of existingLessonsInUnit) {
        await this.lessons.softDeleteById(lesson.id);
        const now = new Date();
        await this.lessonContentItems.deleteByLessonId(lesson.id);
        await this.proverbs.softDeleteByLessonId(lesson.id, now);
        await this.questions.softDeleteByLessonId(lesson.id, now);
      }
      await this.unitContentItems.deleteByUnitId(input.unitId);
      await this.lessons.compactOrderIndexesByUnit(input.unitId);

      const result = await this.generate({
        ...input,
        planLoggingFlow: "regenerate",
        lessonGenerationInstruction: [
          [
            "Regenerate the unit from scratch while staying within the same unit theme and level.",
            "Do not repeat weak lesson breakdowns or weak titles from the previous draft unless they are clearly the best fit.",
            existingSummary ? `Previous unit draft summary to avoid shallow repetition:\n${existingSummary}` : ""
          ].join("\n"),
          input.lessonGenerationInstruction,
          input.extraInstructions,
          chapterContextInstruction,
          reviewInstruction
        ]
          .filter(Boolean)
          .join("\n\n"),
        extraInstructions: input.extraInstructions
      });

      const revised = {
        ...result,
        revisionMode: input.mode,
        updatedLessons: 0,
        clearedLessons: existingLessonsInUnit.length
      };
      await this.saveLatestAiRun(input.unitId, {
        mode: "regenerate",
        createdBy: input.createdBy,
        createdAt: new Date(),
        requestedLessons: revised.requestedLessons,
        createdLessons: revised.createdLessons,
        updatedLessons: revised.updatedLessons,
        clearedLessons: revised.clearedLessons,
        skippedLessons: revised.skippedLessons,
        lessonGenerationErrors: revised.lessonGenerationErrors,
        contentErrors: revised.contentErrors,
        lessons: revised.lessons
      });
      return revised;
    }

    let expressionLanguagePool = await this.expressions.list({ language: input.language });
    let wordLanguagePool = await this.words.list({ language: input.language });
    const desiredLessonCount = Math.max(existingLessonsInUnit.length, input.lessonCount);
    const existingLessonsSnapshot = await this.buildExistingLessonsSnapshot(existingLessonsInUnit);
    const refactorPlan = await this.getValidatedUnitRefactorPlan({
      flow: "unit-refactor",
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      lessonCount: desiredLessonCount,
      unitTitle: unit.title,
      unitDescription: unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: input.lessonGenerationInstruction,
      extraInstructions: [input.extraInstructions, chapterContextInstruction, reviewInstruction].filter(Boolean).join("\n"),
      existingLessons: existingLessonsInUnit,
      existingLessonsSnapshot,
      reviewLessonIds: unit.kind === "review" ? new Set(existingLessonsInUnit.map((lesson) => lesson.id)) : undefined
    });
    const lessonSummaries: LessonGenerationSummary[] = [];
    const contentErrors: Array<{ lessonId?: string; title?: string; error: string }> = [];
    const patchByLessonId = new Map(
      (Array.isArray(refactorPlan.lessonPatches) ? refactorPlan.lessonPatches : []).map((patch) => [patch.lessonId, patch] as const)
    );

    for (const lesson of existingLessonsInUnit) {
      const patch = patchByLessonId.get(lesson.id);
      if (!patch || !Array.isArray(patch.operations) || patch.operations.length === 0) continue;
      try {
        const summary = await this.lessonRefactors.applyPatchPlan({
          lesson,
          patch,
          languagePool: expressionLanguagePool,
          wordLanguagePool,
          createdBy: input.createdBy
        });
        lessonSummaries.push(summary);
        expressionLanguagePool = await this.expressions.list({ language: input.language });
        wordLanguagePool = await this.words.list({ language: input.language });
      } catch (error) {
        contentErrors.push({
          lessonId: lesson.id,
          title: lesson.title,
          error: error instanceof Error ? error.message : "Failed to refactor lesson content."
        });
      }
    }
    const updatedLessonCount = lessonSummaries.length;

    const existingLessonIdsInUnit = existingLessonsInUnit.map((lesson) => lesson.id);
    const updatedExpressionItems = existingLessonIdsInUnit.length
      ? await this.lessonContentItems.list({ unitId: input.unitId, contentType: "expression" })
      : [];
    const updatedWordItems = existingLessonIdsInUnit.length
      ? await this.lessonContentItems.list({ unitId: input.unitId, contentType: "word" })
      : [];
    const updatedUnitExpressions = updatedExpressionItems.length > 0
      ? await this.expressions.findByIds(Array.from(new Set(updatedExpressionItems.map((item) => item.contentId))))
      : [];
    const updatedUnitWords = updatedWordItems.length > 0
      ? await this.words.findByIds(Array.from(new Set(updatedWordItems.map((item) => item.contentId))))
      : [];
    const repetitionPool: ExpressionEntity[] = [...updatedUnitExpressions];
    const wordRepetitionPool: WordEntity[] = [...updatedUnitWords];
    const newPlanLessons = Array.isArray(refactorPlan.newLessons) ? refactorPlan.newLessons : [];
    const createdResult =
      newPlanLessons.length > 0
        ? await this.createPlannedLessons({
            unitId: input.unitId,
            language: input.language,
            level: input.level,
            createdBy: input.createdBy,
            planLessons: newPlanLessons,
            autoInsertReviewLessons: unit.kind !== "review"
          })
        : {
            created: [],
            skipped: [],
            errors: []
          };
    const createdLessonById = new Map(createdResult.created.map((item) => [item.lesson.id, item.lesson] as const));
    const questionSelectionState = createLessonQuestionSelectionState({
      lessons: createdResult.created.map((item) => ({
        lessonKey: item.lesson.id,
        lessonMode: unit.kind === "review"
          ? "review"
          : item.plan.lessonMode || (item.lesson.kind === "review" ? "review" : "core")
      }))
    });

    for (const item of createdResult.created) {
      try {
        const planReviewSourceLessonIds = Array.isArray((item.plan as { reviewSourceLessonIds?: unknown }).reviewSourceLessonIds)
          ? ((item.plan as { reviewSourceLessonIds?: unknown }).reviewSourceLessonIds as unknown[])
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        const perLessonReviewContext =
          planReviewSourceLessonIds.length > 0
            ? await this.buildReviewGenerationContextFromLessons(
                planReviewSourceLessonIds
                  .map((lessonId) => createdLessonById.get(lessonId))
                  .filter((lesson): lesson is LessonEntity => Boolean(lesson))
              )
            : reviewContext;
        const summary = await this.populateGeneratedLessonFromPlan({
          lesson: item.lesson,
          plan: item.plan,
          lessonMode: item.plan.lessonMode,
          unitKind: unit.kind,
          sentencesPerLesson: input.sentencesPerLesson,
          reviewContentPerLesson: input.reviewContentPerLesson,
          proverbsPerLesson: input.proverbsPerLesson,
          createdBy: input.createdBy,
          extraInstructions: [
            input.extraInstructions?.trim() || "",
            chapterContextInstruction,
            reviewInstruction,
            "This is a non-destructive refactor. Keep existing content intact and only add genuinely missing content."
          ]
            .filter(Boolean)
            .join(" "),
          languagePool: expressionLanguagePool,
          repetitionPool,
          wordLanguagePool,
          wordRepetitionPool,
          reviewContext: perLessonReviewContext,
          questionSelectionState
        });
        lessonSummaries.push(summary);
        expressionLanguagePool = await this.expressions.list({ language: input.language });
        wordLanguagePool = await this.words.list({ language: input.language });
      } catch (error) {
        contentErrors.push({
          lessonId: item.lesson.id,
          title: item.lesson.title,
          error: error instanceof Error ? error.message : "Failed to generate lesson content."
        });
      }
    }
    await this.rebuildUnitContentItems(input.unitId, input.createdBy);

    const result = {
      unitId: input.unitId,
      requestedLessons: desiredLessonCount,
      createdLessons: createdResult.created.length,
      updatedLessons: updatedLessonCount,
      skippedLessons: createdResult.skipped,
      lessonGenerationErrors: createdResult.errors,
      contentErrors,
      lessons: lessonSummaries,
      revisionMode: input.mode,
      clearedLessons: 0
    };
    await this.saveLatestAiRun(input.unitId, {
      mode: "refactor",
      createdBy: input.createdBy,
      createdAt: new Date(),
      requestedLessons: result.requestedLessons,
      createdLessons: result.createdLessons,
      updatedLessons: result.updatedLessons,
      clearedLessons: result.clearedLessons,
      skippedLessons: result.skippedLessons,
      lessonGenerationErrors: result.lessonGenerationErrors,
      contentErrors: result.contentErrors,
      lessons: result.lessons
    });
    return result;
  }
}
