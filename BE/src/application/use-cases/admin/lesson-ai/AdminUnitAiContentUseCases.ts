import type { LessonBlock, LessonEntity, LessonStage } from "../../../../domain/entities/Lesson.js";
import type { ContentComponentRef, ContentType } from "../../../../domain/entities/Content.js";
import type { ExpressionEntity } from "../../../../domain/entities/Expression.js";
import type { ProverbEntity } from "../../../../domain/entities/Proverb.js";
import type { SentenceEntity } from "../../../../domain/entities/Sentence.js";
import type { WordEntity } from "../../../../domain/entities/Word.js";
import type { QuestionEntity, QuestionSubtype, QuestionType } from "../../../../domain/entities/Question.js";
import type { UnitAiRunSummary, UnitEntity } from "../../../../domain/entities/Unit.js";
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
  LlmUnitRefactorPlan
} from "../../../../services/llm/types.js";
import { AiExpressionOrchestrator } from "../../../services/AiExpressionOrchestrator.js";
import { AiSentenceOrchestrator } from "../../../services/AiSentenceOrchestrator.js";
import { AiWordOrchestrator } from "../../../services/AiWordOrchestrator.js";
import { buildPedagogicalStages } from "../../../services/defaultLessonStages.js";
import { AdminLessonAiUseCases, buildInitialStages } from "./AdminLessonAiUseCases.js";
import {
  LESSON_GENERATION_LIMITS,
  clampNewTargetsPerLesson,
  clampReviewContentPerLesson
} from "../../../../config/lessonGeneration.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../../../services/llm/aiGenerationLogger.js";
import { appendAiPlanLog } from "../../../../services/llm/aiPlanFileLogger.js";
import { extractThemeAnchors } from "../../../../services/llm/unitTheme.js";
import { sanitizeGeneratedSentence } from "../../../services/AiSentenceOrchestrator.js";
import { buildLetterOrderReviewData } from "../../../../controllers/shared/spellingQuestion.js";
import { ContentCurriculumService } from "../../../services/ContentCurriculumService.js";
import { CurriculumMemoryService, type CurriculumMemoryResult } from "../../../services/CurriculumMemoryService.js";
import {
  createLessonQuestionSelectionState,
  recordLessonQuestionSelection,
  selectLessonQuestionPlan,
  type LessonQuestionSelectionState
} from "../../../services/lessonQuestionSelection.js";
import {
  buildAiContextScenarioQuestionDraft,
  contentSupportsContextScenario
} from "../../../services/contextScenarioQuestions.js";
import { LessonRefactorService } from "../../../services/LessonRefactorService.js";

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

export type PreviewGenerateUnitPlanResult = {
  unitId: string;
  requestedLessons: number;
  actualLessonCount: number;
  coreLessons: LlmUnitPlanLesson[];
  lessonSequence: UnitPlanSequenceLesson[];
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

type ReviewGenerationContext = {
  sourceUnitIds: string[];
  knownWords: WordEntity[];
  knownExpressions: ExpressionEntity[];
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
  const options = shuffle(makeUniqueOptions([answer, ...uniqueDistractors.slice(0, 3)])).slice(0, 4);
  while (options.length < 4) {
    const fallback = `Option ${options.length + 1}`;
    if (!options.includes(fallback)) options.push(fallback);
  }

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
  const options = shuffle(makeUniqueOptions([String(phraseWord), ...selectedDistractors])).slice(0, 4);
  while (options.length < 4) {
    const fallback = `Word ${options.length + 1}`;
    if (!options.includes(fallback)) options.push(fallback);
  }
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
  languagePool: TeachingContent[]
): StageTaggedDraft[] {
  const mc = buildMcOptions(sentence, sentencePool, languagePool);
  const sentenceOrderReviewData = buildPhraseOrderReviewData(sentence);
  const englishTranslation = pickTranslation(sentence);
  const englishTranslationWords = splitWords(englishTranslation);
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

function splitExpressionIntoWordTokens(value: string) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim().replace(/^[.,!?;:\"'()\[\]{}]+|[.,!?;:\"'()\[\]{}]+$/g, ""))
    .filter(Boolean);
}

function normalizePlanItems(values: unknown) {
  return Array.isArray(values) ? values.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeUnitPlanLesson(lesson: LlmUnitPlanLesson): LlmUnitPlanLesson {
  return {
    title: String(lesson.title || "").trim(),
    description: String(lesson.description || "").trim() || undefined,
    objectives: normalizePlanItems(lesson.objectives),
    conversationGoal: String(lesson.conversationGoal || "").trim(),
    situations: normalizePlanItems(lesson.situations),
    sentenceGoals: normalizePlanItems(lesson.sentenceGoals),
    focusSummary: String(lesson.focusSummary || "").trim() || undefined
  };
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
  hausa: new Set(["na", "ce", "ta", "ya", "su", "mu"])
};

const WEAK_TRANSLATION_HINTS = new Set([
  "i",
  "we",
  "you",
  "he",
  "she",
  "they",
  "it",
  "am",
  "is",
  "are"
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
  const looksWeakByShape = normalizedText.length <= 2;
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
  return draft.components.some((component) => {
    const normalizedText = normalize(component.text);
    return component.type === "word"
      ? lockedTargets.words.has(normalizedText)
      : lockedTargets.expressions.has(normalizedText);
  });
}

function looksEnglishLikeText(value: string) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed) && /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/.test(trimmed);
}

function countThemeMatches(values: string[], anchors: string[]) {
  if (anchors.length === 0) return 0;
  const haystack = values.map((item) => normalize(item).replace(/[^a-z0-9\s-]/g, " ")).join(" ");
  return anchors.filter((anchor) => new RegExp(`(^|\\s)${anchor}(\\s|$)`, "i").test(haystack)).length;
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

    if (!looksEnglishLikeText(String(lesson.title || ""))) {
      customReasons.push("title not English-like");
    }
    if (!looksEnglishLikeText(String(lesson.description || ""))) {
      customReasons.push("description not English-like");
    }
    if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) {
      customReasons.push("missing objectives");
    }
    if (objectives.some((item) => !looksEnglishLikeText(String(item || "")))) {
      customReasons.push("objective not English-like");
    }
    if (!looksEnglishLikeText(conversationGoal) || conversationGoal.length < 8) {
      customReasons.push("invalid conversation goal");
    }
    if (situations.length < 2 || situations.length > 4) {
      customReasons.push("invalid situations count");
    }
    if (situations.some((item) => !looksEnglishLikeText(item) || item.length < 6)) {
      customReasons.push("situations must be English-like");
    }
    if (sentenceGoals.length < 2 || sentenceGoals.length > 5) {
      customReasons.push("invalid sentence goal count");
    }
    if (sentenceGoals.some((item) => item.length < 8 || !looksEnglishLikeText(item))) {
      customReasons.push("sentence goals must be English-like");
    }
    const metadataThemeMatches = countThemeMatches(
      [String(lesson.title || ""), String(lesson.description || ""), focusSummary, ...objectives],
      themeAnchors
    );
    const conversationThemeMatches = countThemeMatches([conversationGoal, ...situations, ...sentenceGoals], themeAnchors);

    if (themeAnchors.length > 0 && metadataThemeMatches === 0) {
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
      this.unitContentItems
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

  private async cloneReviewScenarioQuestions(input: {
    lessonId: string;
    sourceLessonIds: string[];
  }) {
    if (input.sourceLessonIds.length === 0) {
      return { stage2: [] as QuestionEntity[], stage3: [] as QuestionEntity[] };
    }

    const lessonOrder = new Map(input.sourceLessonIds.map((lessonId, index) => [lessonId, index] as const));
    const sourceQuestions = await this.questions.list({
      lessonIds: input.sourceLessonIds,
      subtype: "mc-select-context-response"
    });

    const orderedSourceQuestions = sourceQuestions
      .slice()
      .sort((left, right) => {
        const lessonDiff = (lessonOrder.get(left.lessonId) ?? 0) - (lessonOrder.get(right.lessonId) ?? 0);
        if (lessonDiff !== 0) return lessonDiff;
        return left.createdAt.getTime() - right.createdAt.getTime();
      })
      .slice(0, 2);

    const cloned: QuestionEntity[] = [];
    for (const source of orderedSourceQuestions) {
      const created = await this.questions.create({
        lessonId: input.lessonId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        relatedSourceRefs: source.relatedSourceRefs,
        translationIndex: source.translationIndex,
        type: source.type,
        subtype: source.subtype,
        promptTemplate: source.promptTemplate,
        options: source.options,
        correctIndex: source.correctIndex,
        reviewData: source.reviewData,
        interactionData: source.interactionData,
        explanation: source.explanation,
        status: "draft"
      });
      cloned.push(created);
    }

    return {
      stage2: cloned[0] ? [cloned[0]] : [],
      stage3: cloned[1] ? [cloned[1]] : []
    };
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
        sourceUnitIds: [],
        knownWords: [],
        knownExpressions: [],
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

    const sourceSentences = (
      await Promise.all(
        sourceLessonIds.map(async (lessonId) => {
          const sentenceItems = await this.lessonContentItems.list({ lessonId, contentType: "sentence" });
          const sentenceIds = Array.from(new Set(sentenceItems.map((item) => item.contentId).filter(Boolean)));
          return sentenceIds.length > 0 ? this.sentences.findByIds(sentenceIds) : [];
        })
      )
    ).flat();

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

    return {
      sourceUnitIds,
      knownWords: knownWordValues,
      knownExpressions: knownExpressionValues,
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
    }
  ) {
    const lockedWordSet = new Set(lockedTargets.words.map((item) => normalize(item.text)));
    const lockedExpressionSet = new Set(lockedTargets.expressions.map((item) => normalize(item.text)));

    return sentenceDrafts
      .map((draft) => ({
        ...draft,
        components: draft.components.map((component) => {
          const normalizedText = normalize(component.text);
          const isLocked =
            component.type === "word"
              ? lockedWordSet.has(normalizedText)
              : lockedExpressionSet.has(normalizedText);
          return {
            ...component,
            role: isLocked ? "core" : "support"
          } as typeof component;
        })
      }))
      .filter((draft) =>
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

    const addDraft = (draft: LlmGeneratedSentence) => {
      const key = normalize(draft.text);
      if (!key || seenSentenceTexts.has(key)) return;
      if (!sentenceDraftUsesLockedTarget(draft, { words: lockedWordSet, expressions: lockedExpressionSet })) return;
      merged.push(draft);
      seenSentenceTexts.add(key);
    };

    for (const draft of input.primary) addDraft(draft);
    for (const draft of input.fallback) addDraft(draft);

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
        model: this.llm.modelName,
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
        model: this.llm.modelName,
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

  private async resolveStandaloneWordsForExpressionComponents(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
  }) {
    const tokenTextsByExpression = new Map<string, string[]>();
    const requestedWordTexts: string[] = [];

    for (const draft of input.sentenceDrafts) {
      for (const component of draft.components) {
        if (component.type !== "expression") continue;
        if (component.fixed === true) continue;
        const expressionKey = normalize(component.text);
        if (!expressionKey) continue;
        const tokenTexts = splitExpressionIntoWordTokens(component.text);
        if (tokenTexts.length < 2) continue;
        tokenTextsByExpression.set(expressionKey, tokenTexts);
        requestedWordTexts.push(...tokenTexts);
      }
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
  }) {
    const coreWords = new Map<string, WordEntity>();
    const coreExpressions = new Map<string, ExpressionEntity>();
    const supportWords = new Map<string, WordEntity>();
    const supportExpressions = new Map<string, ExpressionEntity>();
    const { tokenTextsByExpression, wordsByText: derivedWordsByText } =
      await this.resolveStandaloneWordsForExpressionComponents({
        lesson: input.lesson,
        sentenceDrafts: input.sentenceDrafts
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

        if (component.fixed === true) {
          const expression = await this.upsertExpressionFromSentenceComponent({
            lesson: input.lesson,
            text: component.text,
            translations: component.translations
          });
          (component.role === "support" ? supportExpressions : coreExpressions).set(normalizedText, expression);
          continue;
        }

        const tokenTexts = tokenTextsByExpression.get(normalizedText) || [];
        for (const tokenText of tokenTexts) {
          const tokenWord = derivedWordsByText.get(normalize(tokenText));
          if (!tokenWord) continue;
          (component.role === "support" ? supportWords : coreWords).set(normalize(tokenWord.text), tokenWord);
        }
      }
    }

    return {
      coreWords: Array.from(coreWords.values()),
      coreExpressions: Array.from(coreExpressions.values()),
      supportWords: Array.from(supportWords.values()),
      supportExpressions: Array.from(supportExpressions.values())
    };
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
      [...existingLanguageSentences, ...input.currentLessonSentences].map((sentence) => [normalize(sentence.text), sentence] as const)
    );
    const createdOrReused: TeachingContent[] = [];

    for (const draft of input.sentenceDrafts) {
      const componentRefs: ContentComponentRef[] = [];
      let isValid = true;
      let orderIndex = 0;

      for (const component of draft.components) {
        const key = normalize(component.text);
        if (component.type === "word") {
          const content = input.componentIndex.words.get(key);
          if (!content) {
            isValid = false;
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

        if (component.fixed === true) {
          const content = input.componentIndex.expressions.get(key);
          if (!content) {
            isValid = false;
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

      if (!isValid || componentRefs.length === 0) continue;

      const reviewMeaningSegments = buildQuestionMeaningSegmentsFromSentence({
        sentenceComponents: componentRefs,
        meaningSegments: draft.meaningSegments
      });

      const existing = byText.get(normalize(draft.text));
      if (existing) {
        const mergedTranslations = Array.from(new Set([...existing.translations, ...draft.translations].filter(Boolean)));
        const updated = await this.sentences.updateById(existing.id, {
          translations: mergedTranslations,
          literalTranslation: existing.literalTranslation || draft.literalTranslation || "",
          usageNotes: existing.usageNotes || draft.usageNotes || "",
          explanation: existing.explanation || draft.explanation || "",
          components: existing.components.length > 0 ? existing.components : componentRefs
        });
        const reused = updated || existing;
        createdOrReused.push({
          ...reused,
          components: reused.components.length > 0 ? reused.components : componentRefs,
          meaningSegments: reviewMeaningSegments
        });
        continue;
      }

      const created = await this.sentences.create({
        language: input.lesson.language,
        text: draft.text,
        textNormalized: normalize(draft.text),
        translations: draft.translations,
        pronunciation: "",
        explanation: draft.explanation || "",
        examples: [],
        difficulty: Math.max(1, Math.min(5, input.lesson.level === "beginner" ? 1 : input.lesson.level === "intermediate" ? 2 : 3)),
        aiMeta: {
          generatedByAI: true,
          model: this.llm.modelName,
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
        status: "draft"
      });
      createdOrReused.push({
        ...created,
        components: componentRefs,
        meaningSegments: reviewMeaningSegments
      });
      byText.set(normalize(created.text), created);
    }

    return createdOrReused;
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
          model: this.llm.modelName,
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
    const unitLessons = (await this.lessons.list({ unitId }))
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime());
    const lessonOrderMap = new Map(unitLessons.map((lesson, index) => [lesson.id, index]));
    const lessonItems = await this.lessonContentItems.list({ unitId });
    const sortedItems = lessonItems
      .slice()
      .sort((left, right) => {
        const lessonDiff = (lessonOrderMap.get(left.lessonId) ?? 0) - (lessonOrderMap.get(right.lessonId) ?? 0);
        if (lessonDiff !== 0) return lessonDiff;
        const stageDiff = (left.stageIndex ?? Number.MAX_SAFE_INTEGER) - (right.stageIndex ?? Number.MAX_SAFE_INTEGER);
        if (stageDiff !== 0) return stageDiff;
        return left.orderIndex - right.orderIndex;
      });

    const introduced: Array<{ contentType: ContentType; contentId: string }> = [];
    const review: Array<{ contentType: ContentType; contentId: string; sourceUnitId?: string | null }> = [];
    const introducedKeys = new Set<string>();
    const reviewKeys = new Set<string>();

    for (const item of sortedItems) {
      const key = `${item.contentType}:${item.contentId}`;
      if (item.role === "introduce" && !introducedKeys.has(key)) {
        introduced.push({ contentType: item.contentType, contentId: item.contentId });
        introducedKeys.add(key);
        continue;
      }

      if ((item.role === "review" || item.role === "practice") && !reviewKeys.has(key)) {
        review.push({ contentType: item.contentType, contentId: item.contentId, sourceUnitId: null });
        reviewKeys.add(key);
      }
    }

    await this.contentCurriculum.replaceUnitContentItems({
      unitId,
      createdBy,
      introduced,
      review
    });
  }

  private async loadUnitPlanContext(input: { unitId: string }): Promise<UnitPlanContext> {
    const unit = await this.units.findById(input.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }

    const reviewContext = unit.kind === "review" ? await this.buildReviewGenerationContext(unit) : null;
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
            reviewContext && reviewContext.sourceUnitIds.length > 0
              ? `Review source unit count: ${reviewContext.sourceUnitIds.length}.`
              : "No explicit review source units were set, so use earlier core units in scope."
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
      themeAnchors
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
    existingUnitTitles?: string[];
    existingLessonTitles?: string[];
    existingPhraseTexts?: string[];
    existingProverbTexts?: string[];
    existingLessonsSummary?: string;
  }) {
    let retryInstruction = "";
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
      const lessons = await this.llm.planUnitLessons({
        language: input.language,
        level: input.level,
        lessonCount: input.lessonCount,
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined,
        themeAnchors,
        existingUnitTitles: input.existingUnitTitles,
        existingLessonTitles: input.existingLessonTitles,
        existingPhraseTexts: input.existingPhraseTexts,
        existingProverbTexts: input.existingProverbTexts,
        existingLessonsSummary: input.existingLessonsSummary
      });

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

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
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

      const validation = validateUnitRefactorPlan({
        plan,
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
          plan
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
          finalPlan: plan,
          attempts
        });
        return plan;
      }

      attempts.push({
        attempt,
        status: "rejected",
        plan,
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
    planLessons: LlmUnitPlanLesson[];
    autoInsertReviewLessons?: boolean;
  }) {
    type PlannedLessonWithMeta = LlmUnitPlanLesson & {
      lessonMode?: "core" | "review";
      reviewSourceLessonIds?: string[];
    };
    const existingLessons = await this.lessons.list({ unitId: input.unitId });
    const existingTitleSet = new Set(existingLessons.map((lesson) => normalize(lesson.title)));
    const created: Array<{ lesson: LessonEntity; plan: PlannedLessonWithMeta }> = [];
    const skipped: { reason: string; title?: string }[] = [];
    const errors: { title?: string; error: string }[] = [];
    let nextOrderIndex = (await this.lessons.findLastOrderIndex(input.unitId)) ?? -1;
    const recentCoreLessons: Array<{ lesson: LessonEntity; plan: LlmUnitPlanLesson }> = [];
    const autoInsertReviewLessons = input.autoInsertReviewLessons !== false;

    const buildReviewPlan = (coreLessons: Array<{ lesson: LessonEntity; plan: LlmUnitPlanLesson }>): PlannedLessonWithMeta | null => {
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
    const isSentenceOnlyReviewUnit = input.unitKind === "review";
    const planReviewSourceLessonIds = Array.isArray((input.plan as { reviewSourceLessonIds?: unknown }).reviewSourceLessonIds)
      ? ((input.plan as { reviewSourceLessonIds?: unknown }).reviewSourceLessonIds as unknown[])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];
    const targetNewSentences = clampNewTargetsPerLesson(input.sentencesPerLesson);
    const targetReviewContent = clampReviewContentPerLesson(
      Number(input.reviewContentPerLesson),
      targetNewSentences
    );
    const conversationGoal = String((input.plan as { conversationGoal?: unknown }).conversationGoal || "").trim();
    const situations = normalizePlanItems((input.plan as { situations?: unknown }).situations);
    const sentenceGoals = normalizePlanItems((input.plan as { sentenceGoals?: unknown }).sentenceGoals);
    const targetSentenceCount = Math.min(
      LESSON_GENERATION_LIMITS.MAX_NEW_SENTENCES_PER_LESSON,
      Math.max(2, targetNewSentences * LESSON_GENERATION_LIMITS.MIN_SENTENCES_PER_TARGET)
    );
    const targetReviewWords = Math.max(0, Math.floor(targetReviewContent / 2));
    const targetReviewExpressions = Math.max(0, targetReviewContent - targetReviewWords);
    const wordTargetPlanTexts = [
      input.plan.focusSummary,
      conversationGoal,
      ...situations,
      ...sentenceGoals,
      ...input.plan.objectives
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    const currentLessonWords = await this.listLessonWords(input.lesson.id);
    const currentLessonExpressions = await this.listLessonExpressions(input.lesson.id);
    const currentLessonSentences = await this.listLessonSentences(input.lesson.id);
    let sentenceDrafts: LlmGeneratedSentence[] = [];
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

    if (useReviewFlow && input.reviewContext && reviewLockedTargets) {
      const lockedTargets = reviewLockedTargets;
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
        maxSentences: targetSentenceCount,
        conversationGoal,
        situations,
        sentenceGoals,
        allowedExpressions,
        allowedWords,
        allowDerivedComponents: true,
        extraInstructions: [
          input.extraInstructions ? input.extraInstructions.trim() : "",
          isSentenceOnlyReviewUnit ? "This is a sentence-focused review unit lesson." : "This is a review lesson.",
          "Do not invent brand-new lesson targets outside the allowed inventory.",
          isSentenceOnlyReviewUnit
            ? "Generate fresh sentences using only the allowed known words and expressions from the source units."
            : "Prefer fresh review sentences built from already seen lesson content rather than reusing old sentence text.",
          lockedTargets.words.length > 0
            ? `Locked review words: ${lockedTargets.words.map((item) => `${item.text} = ${item.translations.join(" / ")}`).join(" | ")}`
            : "",
          lockedTargets.expressions.length > 0
            ? `Locked review expressions: ${lockedTargets.expressions.map((item) => `${item.text} = ${item.translations.join(" / ")}`).join(" | ")}`
            : "",
          "Every generated sentence must include at least one locked review target.",
          "Mark locked review targets as role=core and all other helper items as role=support.",
          isSentenceOnlyReviewUnit
            ? "Do not promote previously unintroduced helper items into new lesson targets in this review unit."
            : "If you use a repeated but previously unintroduced item from the allowed inventory, use at most one such promoted item as a core target in this lesson.",
          "Teach the standard form of the target language first."
        ]
          .filter(Boolean)
          .join(" ")
      }))
        .map(sanitizeGeneratedSentence)
        .filter((item): item is LlmGeneratedSentence => Boolean(item));

      sentenceDrafts = this.lockSentenceDraftsToTargets(reviewSentenceDrafts, lockedTargets);
    } else {
      const discoverySentenceDrafts = (await this.sentenceOrchestrator.draftForLessonPlan({
        lesson: input.lesson,
        existingLessonSentences: currentLessonSentences,
        maxSentences: Math.max(2, Math.min(4, targetSentenceCount)),
        conversationGoal,
        situations,
        sentenceGoals,
        extraInstructions: [
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

      sentenceDrafts = discoverySentenceDrafts;
      if (lockedTargets.words.length + lockedTargets.expressions.length > 0) {
        const lockedTargetInstruction = [
          lockedTargets.words.length > 0
            ? `Locked core words: ${lockedTargets.words.map((item) => `${item.text} = ${item.translations.join(" / ")}`).join(" | ")}`
            : "",
          lockedTargets.expressions.length > 0
            ? `Locked core expressions: ${lockedTargets.expressions.map((item) => `${item.text} = ${item.translations.join(" / ")}`).join(" | ")}`
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
          extraInstructions: [
            input.extraInstructions ? input.extraInstructions.trim() : "",
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

        const lockedDiscoveryDrafts = this.lockSentenceDraftsToTargets(discoverySentenceDrafts, lockedTargets);
        const lockedTargetedDrafts = this.lockSentenceDraftsToTargets(targetedSentenceDrafts, lockedTargets);
        sentenceDrafts = this.mergeSentenceDraftsForLockedTargets({
          primary: lockedTargetedDrafts,
          fallback: lockedDiscoveryDrafts,
          lockedTargets,
          maxSentences: targetSentenceCount
        });
        if (sentenceDrafts.length === 0) {
          sentenceDrafts = lockedDiscoveryDrafts;
        }
      }
    }

    const derivedContent = await this.deriveContentFromSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts
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

    const teachableWords = words.filter((word) =>
      shouldTeachStandaloneWord({
        language: input.lesson.language,
        word,
        planTexts: wordTargetPlanTexts
      })
    );
    const teachableGeneratedWordIds = new Set(teachableWords.map((item) => item.id));
    const filteredWordRepetitionCandidates = wordRepetitionCandidates.filter((word) =>
      shouldTeachStandaloneWord({
        language: input.lesson.language,
        word,
        planTexts: wordTargetPlanTexts
      })
    );

    const rawGeneratedNewWords = teachableWords.filter((item) => !generatedWordIntroductionMap.get(item.id));
    const rawGeneratedNewExpressions = expressions.filter((item) => !generatedIntroductionMap.get(item.id));
    const selectedGeneratedNewWords = rawGeneratedNewWords.slice(0, LESSON_GENERATION_LIMITS.MAX_NEW_WORDS_PER_LESSON);
    const remainingNewContentSlots = Math.max(0, targetNewSentences - selectedGeneratedNewWords.length);
    const selectedGeneratedNewContent = rawGeneratedNewExpressions.slice(0, remainingNewContentSlots);
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

    const generatedSentences = await this.persistSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts,
      currentLessonSentences,
      componentIndex: {
        words: new Map([...focusedLessonWords, ...supportWords].map((item) => [normalize(item.text), item] as const)),
        expressions: new Map([...focusedLessonExpressions, ...supportExpressions].map((item) => [normalize(item.text), item] as const))
      }
    });
    const sentenceQuestionPool: TeachingContent[] =
      generatedSentences.length > 1
        ? generatedSentences
        : [...generatedSentences, ...focusedLessonContent];
    const stage1SentenceQuestions: QuestionEntity[] = [];
    const reviewStage2ScenarioQuestions: QuestionEntity[] = [];
    const reviewStage3ScenarioQuestions: QuestionEntity[] = [];

    for (const sentence of generatedSentences) {
      const drafts = buildSentenceQuestionDrafts(sentence, sentenceQuestionPool, focusedLessonContent);
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
        lessonMode: input.lessonMode || (input.lesson.kind === "review" ? "review" : "core"),
        selectionState: input.questionSelectionState,
        commitSelection: false
      }
    );
    const selectedQuestionCreates = selectedQuestionPlan.selectedCandidates.map((candidate) => candidate.payload);
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

    if (input.lesson.kind === "review" && planReviewSourceLessonIds.length > 0) {
      const clonedReviewScenarioQuestions = await this.cloneReviewScenarioQuestions({
        lessonId: input.lesson.id,
        sourceLessonIds: planReviewSourceLessonIds
      });
      reviewStage2ScenarioQuestions.push(...clonedReviewScenarioQuestions.stage2);
      reviewStage3ScenarioQuestions.push(...clonedReviewScenarioQuestions.stage3);
      createdQuestions.push(...clonedReviewScenarioQuestions.stage2, ...clonedReviewScenarioQuestions.stage3);
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

    if (input.lesson.kind !== "review") {
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
    for (const proverb of ensuredProverbs) {
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
        ...generatedSentences.map((item) => ({ contentType: "sentence" as const, contentId: item.id }))
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

  async generate(input: GenerateUnitAiContentInput) {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const planMemory = this.buildPlanMemoryInputs(planContext);
    const planLessons = await this.getValidatedUnitPlan({
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
      existingUnitTitles: (await this.units.listByLanguage(input.language, planContext.unit.languageId || undefined))
        .map((item) => item.title)
        .filter(Boolean),
      existingLessonTitles: planMemory.existingLessonTitles,
      existingPhraseTexts: planMemory.existingPhraseTexts,
      existingProverbTexts: planMemory.existingProverbTexts,
      existingLessonsSummary: planMemory.existingLessonsSummary
    });
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

  private async executeGenerateFromPlan(input: {
    generateInput: GenerateUnitAiContentInput;
    unitKind: UnitEntity["kind"];
    planLessons: LlmUnitPlanLesson[];
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
        lessonMode: item.plan.lessonMode || (item.lesson.kind === "review" ? "review" : "core")
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
        console.error("[UNIT_AI_GENERATE] lesson:error", {
          unitId: input.generateInput.unitId,
          lessonId: item.lesson.id,
          title: item.lesson.title,
          durationMs: Date.now() - lessonStartedAt,
          error: error instanceof Error ? error.message : "Failed to generate lesson content."
        });
        errors.push({
          lessonId: item.lesson.id,
          title: item.lesson.title,
          error: error instanceof Error ? error.message : "Failed to generate lesson content."
        });
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
    const coreLessons = await this.getValidatedUnitPlan({
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
      existingUnitTitles: (await this.units.listByLanguage(input.language, planContext.unit.languageId || undefined))
        .map((item) => item.title)
        .filter(Boolean),
      existingLessonTitles: planMemory.existingLessonTitles,
      existingPhraseTexts: planMemory.existingPhraseTexts,
      existingProverbTexts: planMemory.existingProverbTexts,
      existingLessonsSummary: planMemory.existingLessonsSummary
    });
    const lessonSequence = buildAutoInsertedReviewLessonSequence(coreLessons, {
      autoInsertReviewLessons: planContext.unit.kind !== "review"
    });

    return {
      unitId: input.unitId,
      requestedLessons: input.lessonCount,
      actualLessonCount: lessonSequence.length,
      coreLessons,
      lessonSequence
    };
  }

  async previewRegeneratePlan(input: GenerateUnitAiContentInput): Promise<PreviewGenerateUnitPlanResult> {
    const planContext = await this.loadUnitPlanContext({ unitId: input.unitId });
    const planMemory = this.buildPlanMemoryInputs(planContext);
    const coreLessons = await this.getValidatedUnitPlan({
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
      existingUnitTitles: (await this.units.listByLanguage(input.language, planContext.unit.languageId || undefined))
        .map((item) => item.title)
        .filter(Boolean),
      existingLessonTitles: planMemory.existingLessonTitles,
      existingPhraseTexts: planMemory.existingPhraseTexts,
      existingProverbTexts: planMemory.existingProverbTexts,
      existingLessonsSummary: planMemory.existingLessonsSummary
    });
    const lessonSequence = buildAutoInsertedReviewLessonSequence(coreLessons, {
      autoInsertReviewLessons: planContext.unit.kind !== "review"
    });

    return {
      unitId: input.unitId,
      requestedLessons: input.lessonCount,
      actualLessonCount: lessonSequence.length,
      coreLessons,
      lessonSequence
    };
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
      planLessons: input.planLessons
    });

    return this.executeGenerateFromPlan({
      generateInput: {
        ...input,
        extraInstructions: [input.extraInstructions, planContext.chapterContextInstruction].filter(Boolean).join("\n") || undefined
      },
      unitKind: planContext.unit.kind,
      planLessons: normalizedPlanLessons,
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
      planLessons: input.planLessons
    });

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
      planLessons: normalizedPlanLessons,
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
      extraInstructions: [input.extraInstructions, chapterContextInstruction].filter(Boolean).join("\n"),
      existingLessons: [lesson],
      existingLessonsSnapshot
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
            reviewContext && reviewContext.sourceUnitIds.length > 0
              ? `Review source unit count: ${reviewContext.sourceUnitIds.length}.`
              : "No explicit review source units were set, so use earlier core units in scope."
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
      existingLessonsSnapshot
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
        lessonMode: item.plan.lessonMode || (item.lesson.kind === "review" ? "review" : "core")
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
