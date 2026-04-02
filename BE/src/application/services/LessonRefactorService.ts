import type { LessonBlock, LessonEntity, LessonStage } from "../../domain/entities/Lesson.js";
import type { ContentType } from "../../domain/entities/Content.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type {
  QuestionEntity,
  QuestionMatchingPair,
  QuestionSubtype,
  QuestionType
} from "../../domain/entities/Question.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { LessonContentItemRepository } from "../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type { LlmClient, LlmLessonRefactorPatch } from "../../services/llm/types.js";
import { buildLetterOrderReviewData } from "../../controllers/shared/spellingQuestion.js";
import { ContentCurriculumService } from "./ContentCurriculumService.js";
import {
  buildAiContextScenarioQuestionDraft,
  contentSupportsContextScenario
} from "./contextScenarioQuestions.js";
import { buildPedagogicalStages } from "./defaultLessonStages.js";
import { selectBundleQuestionDrafts } from "./lessonQuestionSelection.js";

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

type TeachingContent = Pick<
  WordEntity | ExpressionEntity | SentenceEntity,
  "id" | "text" | "translations" | "explanation" | "difficulty" | "audio"
>;

export type LessonPatchApplySummary = {
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

type TranslationSource = {
  id: string;
  text: string;
  translations: string[];
  explanation?: string;
};

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

function sanitizePairId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function pickTranslation(source: Pick<TranslationSource, "translations">, translationIndex = 0) {
  if (!Array.isArray(source.translations) || source.translations.length === 0) return "";
  if (
    Number.isInteger(translationIndex) &&
    translationIndex >= 0 &&
    translationIndex < source.translations.length
  ) {
    return String(source.translations[translationIndex] || "").trim();
  }
  return String(source.translations[0] || "").trim();
}

export function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildPhraseOrderReviewData(phrase: TeachingContent): NonNullable<QuestionEntity["reviewData"]> | null {
  const sentence = String(phrase.text || "").trim();
  const words = splitWords(sentence);
  if (words.length < 2) return null;

  return {
    sentence,
    words,
    correctOrder: words.map((_, index) => index),
    meaning: pickTranslation(phrase)
  };
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
  lessonExpressions: TeachingContent[],
  languagePool: TeachingContent[],
  reviewData: NonNullable<QuestionEntity["reviewData"]>
) {
  const blankIndex = reviewData.words.length > 2 ? 1 : 0;
  const answer = reviewData.words[blankIndex];
  const promptSentence = reviewData.words
    .map((word, index) => (index === blankIndex ? "____" : word))
    .join(" ");

  const distractorPool = lessonExpressions
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
  expression: TeachingContent,
  lessonExpressions: TeachingContent[],
  languagePool: TeachingContent[]
) {
  const currentTranslation = pickTranslation(expression);
  const distractorPool = lessonExpressions
    .filter((item) => item.id !== expression.id)
    .map((item) => pickTranslation(item))
    .concat(languagePool.filter((item) => item.id !== expression.id).map((item) => pickTranslation(item)));

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
  lessonExpressions: TeachingContent[],
  languagePool: TeachingContent[]
) {
  const phraseWord = String(phrase.text || "").trim().split(/\s+/).filter(Boolean)[0] || phrase.text;
  const distractorWords = lessonExpressions
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

function buildMatchTranslationPairs(
  expressions: TranslationSource[],
  preferredExpressionTexts?: string[]
): QuestionMatchingPair[] {
  const preferred = Array.isArray(preferredExpressionTexts)
    ? preferredExpressionTexts.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const preferredSet = new Set(preferred);
  const orderedExpressions = preferred.length > 0
    ? expressions.filter((expression) => preferredSet.has(normalizeText(expression.text)))
    : [...expressions];

  const pairs: QuestionMatchingPair[] = [];
  const usedExpressionIds = new Set<string>();
  const usedTranslations = new Set<string>();

  for (const expression of orderedExpressions) {
    const translation = pickTranslation(expression);
    const translationKey = normalizeText(translation);
    if (
      !expression.id ||
      !translationKey ||
      usedExpressionIds.has(expression.id) ||
      usedTranslations.has(translationKey)
    ) {
      continue;
    }

    pairs.push({
      pairId: sanitizePairId(`${expression.id}-0-${pairs.length + 1}`),
      contentType: "expression",
      contentId: expression.id,
      contentText: expression.text,
      translationIndex: 0,
      translation,
      image: null
    });
    usedExpressionIds.add(expression.id);
    usedTranslations.add(translationKey);

    if (pairs.length >= 4) break;
  }

  return pairs.length >= 4 ? pairs : [];
}

export function buildMatchTranslationQuestionDraft(
  lessonId: string,
  expressions: TranslationSource[],
  preferredExpressionTexts?: string[]
) {
  const matchingPairs = buildMatchTranslationPairs(expressions, preferredExpressionTexts);
  if (matchingPairs.length < 4) return null;
  const primaryContentId = matchingPairs[0].contentId;
  const relatedSourceRefs = Array.from(
    new Set(matchingPairs.map((pair) => pair.contentId).filter((item): item is string => Boolean(item)))
  ).map((id) => ({ type: "expression" as const, id }));
  if (!primaryContentId || relatedSourceRefs.length < 4) return null;

  return {
    lessonId,
    sourceType: "expression" as const,
    sourceId: primaryContentId,
    relatedSourceRefs,
    translationIndex: matchingPairs[0].translationIndex,
    type: "matching" as const,
    subtype: "mt-match-translation" as const,
    promptTemplate: "Match each phrase to the correct translation.",
    options: [],
    correctIndex: 0,
    interactionData: {
      matchingPairs
    },
    explanation: "Match each phrase to its English meaning.",
    status: "draft" as const
  };
}

export function buildQuestionDrafts(
  expression: TeachingContent,
  lessonExpressions: TeachingContent[],
  languagePool: TeachingContent[],
  alreadyIntroduced = false
): StageTaggedDraft[] {
  const mc = buildMcOptions(expression, lessonExpressions, languagePool);
  const expressionOrderReviewData = buildPhraseOrderReviewData(expression);
  const expressionGapFillReviewData = buildPhraseGapFillReviewData(expression);
  const spellingReviewData = buildLetterOrderReviewData({
    phraseText: expression.text,
    meaning: pickTranslation(expression)
  });
  const gapFill = expressionGapFillReviewData
    ? buildGapFillQuestion(expression, lessonExpressions, languagePool, expressionGapFillReviewData)
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
        explanation: expression.explanation || `The correct meaning is ${pickTranslation(expression)}.`
      },
      {
        stage: 1,
        type: "listening",
        subtype: "ls-mc-select-translation",
        promptTemplate: "Listen to {phrase} and choose the meaning.",
        options: mc.options,
        correctIndex: mc.correctIndex,
        explanation: expression.explanation || `The correct meaning is ${pickTranslation(expression)}.`
      }
    );

    if (expressionOrderReviewData) {
      drafts.push({
        stage: 1,
        type: "fill-in-the-gap",
        subtype: "fg-word-order",
        promptTemplate: "Arrange the words to mean: {meaning}",
        options: expressionOrderReviewData.words,
        correctIndex: 0,
        reviewData: expressionOrderReviewData,
        explanation: `Correct order: ${expressionOrderReviewData.words.join(" ")}`
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
        explanation: expression.explanation || `Correct spelling: ${spellingReviewData.sentence}`
      });
    }

  }

  if (gapFill && expressionGapFillReviewData) {
    drafts.push(
      {
        stage: 2,
        type: "multiple-choice",
        subtype: "mc-select-missing-word",
        promptTemplate: "Select the missing word: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...expressionGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: expression.explanation || `The correct word is ${expressionGapFillReviewData.sentence}.`
      },
      {
        stage: 2,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...expressionGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: expression.explanation || `Correct completion: ${expressionGapFillReviewData.sentence}.`
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
      explanation: expression.explanation || `The correct meaning is ${pickTranslation(expression)}.`
    });
  }

  drafts.push({
    stage: 2,
    type: "speaking",
    subtype: "sp-pronunciation-compare",
    promptTemplate: "Say {phrase} aloud. Match the tutor's tone and pronunciation.",
    options: [],
    correctIndex: 0,
    explanation: expression.explanation || `Say ${expression.text} aloud and match the tutor reference.`
  });

  if (spellingReviewData && expressionOrderReviewData) {
    drafts.push({
      stage: 2,
      type: "fill-in-the-gap",
      subtype: "fg-letter-order",
      promptTemplate: "Arrange the letters to spell the phrase for: {meaning}",
      options: spellingReviewData.words,
      correctIndex: 0,
      reviewData: spellingReviewData,
      explanation: expression.explanation || `Correct spelling: ${spellingReviewData.sentence}`
    });
  }

  drafts.push({
    stage: 3,
    type: "listening",
    subtype: "ls-mc-select-translation",
    promptTemplate: "Listen and choose the correct translation for {phrase}.",
    options: mc.options,
    correctIndex: mc.correctIndex,
    explanation: expression.explanation || `The correct meaning is ${pickTranslation(expression)}.`
  });

  if (expressionOrderReviewData) {
    drafts.push({
      stage: 3,
      type: "listening",
      subtype: "ls-fg-word-order",
      promptTemplate: "Listen and arrange the words to match: {meaning}",
      options: expressionOrderReviewData.words,
      correctIndex: 0,
      reviewData: expressionOrderReviewData,
      explanation: `Correct order: ${expressionOrderReviewData.words.join(" ")}`
    });
  }

  if (gapFill && expressionGapFillReviewData) {
    drafts.push(
      {
        stage: 3,
        type: "listening",
        subtype: "ls-mc-select-missing-word",
        promptTemplate: "Listen and choose the missing word: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...expressionGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: expression.explanation || `The correct word completes ${expressionGapFillReviewData.sentence}.`
      },
      {
        stage: 3,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...expressionGapFillReviewData, sentence: gapFill.promptSentence },
        explanation: expression.explanation || `Correct completion: ${expressionGapFillReviewData.sentence}.`
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
      explanation: expression.explanation || `The correct meaning is ${pickTranslation(expression)}.`
    });
  }

  return drafts;
}

function buildSentenceQuestionDrafts(
  sentence: SentenceEntity,
  sentencePool: Array<SentenceEntity | ExpressionEntity | WordEntity>,
  languagePool: Array<ExpressionEntity | WordEntity>
): StageTaggedDraft[] {
  const mc = buildMcOptions(sentence as unknown as ExpressionEntity, sentencePool as ExpressionEntity[], languagePool as ExpressionEntity[]);
  const sentenceOrderReviewData = buildPhraseOrderReviewData(sentence as unknown as ExpressionEntity);
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

export function cloneStage(stage: LessonStage): LessonStage {
  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    orderIndex: stage.orderIndex,
    blocks: [...stage.blocks]
  };
}

export function buildDefaultRefactorStages(lessonId: string): LessonStage[] {
  return buildPedagogicalStages((index) => `${lessonId}-stage-${index + 1}`);
}

function ensureRefactorStages(lesson: LessonEntity) {
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

function blockMatchesQuestionId(block: LessonBlock, questionIds: Set<string>) {
  return block.type === "question" && block.refId && questionIds.has(String(block.refId));
}

function insertBlock(stage: LessonStage, block: LessonBlock, blockIndex?: number) {
  if (Number.isInteger(blockIndex) && Number(blockIndex) >= 0 && Number(blockIndex) <= stage.blocks.length) {
    stage.blocks.splice(Number(blockIndex), 0, block);
    return;
  }
  stage.blocks.push(block);
}

function buildLessonExpressionPool(languagePool: ExpressionEntity[], lessonExpressions: ExpressionEntity[]) {
  return Array.from(new Map([...lessonExpressions, ...languagePool].map((item) => [item.id, item])).values());
}

function buildLessonWordPool(languagePool: WordEntity[], lessonWords: WordEntity[]) {
  return Array.from(new Map([...lessonWords, ...languagePool].map((item) => [item.id, item])).values());
}

export class LessonRefactorService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly questions: QuestionRepository,
    private readonly contentCurriculum: ContentCurriculumService,
    private readonly llm: LlmClient
  ) {}

  private async listLessonWords(lessonId: string, stages?: LessonStage[]) {
    const items = await this.lessonContentItems.list({ lessonId, contentType: "word" });
    const stageIds = (stages || []).flatMap((stage) =>
      (stage.blocks || []).flatMap((block) =>
        block.type === "content" && block.contentType === "word" && block.refId
          ? [String(block.refId)]
          : []
      )
    );
    const ids = Array.from(new Set([...items.map((item) => item.contentId), ...stageIds].filter(Boolean)));
    if (ids.length === 0) return [];
    const words = await this.words.findByIds(ids);
    const byId = new Map(words.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is WordEntity => Boolean(item));
  }

  private async listLessonExpressions(lessonId: string, stages?: LessonStage[]) {
    const items = await this.lessonContentItems.list({ lessonId, contentType: "expression" });
    const stageIds = (stages || []).flatMap((stage) =>
      (stage.blocks || []).flatMap((block) =>
        block.type === "content" && block.contentType === "expression" && block.refId
          ? [String(block.refId)]
          : []
      )
    );
    const ids = Array.from(new Set([...items.map((item) => item.contentId), ...stageIds].filter(Boolean)));
    if (ids.length === 0) return [];
    const expressions = await this.expressions.findByIds(ids);
    const byId = new Map(expressions.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is ExpressionEntity => Boolean(item));
  }

  private async listLessonSentences(lessonId: string, stages?: LessonStage[]) {
    const items = await this.lessonContentItems.list({ lessonId, contentType: "sentence" });
    const stageIds = (stages || []).flatMap((stage) =>
      (stage.blocks || []).flatMap((block) =>
        block.type === "content" && block.contentType === "sentence" && block.refId
          ? [String(block.refId)]
          : []
      )
    );
    const ids = Array.from(new Set([...items.map((item) => item.contentId), ...stageIds].filter(Boolean)));
    if (ids.length === 0) return [];
    const sentences = await this.sentences.findByIds(ids);
    const byId = new Map(sentences.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is SentenceEntity => Boolean(item));
  }

  private async maybeAddLessonScenarioQuestion(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    lessonQuestions: Map<string, QuestionEntity>;
    contentType: "word" | "expression";
    content: WordEntity | ExpressionEntity;
    lessonPool: TeachingContent[];
    languagePool: TeachingContent[];
  }) {
    if (input.lesson.kind === "review") return null;
    if (Array.from(input.lessonQuestions.values()).some((question) => question.subtype === "mc-select-context-response")) {
      return null;
    }
    if (!contentSupportsContextScenario(input.content)) return null;

    const draft = await buildAiContextScenarioQuestionDraft({
      llm: this.llm,
      language: input.lesson.language,
      level: input.lesson.level,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      contentType: input.contentType,
      content: input.content,
      lessonPool: input.lessonPool,
      languagePool: input.languagePool
    });
    if (!draft) return null;

    const stage = input.stages[0];
    if (!stage) return null;

    const created = await this.questions.create({
      lessonId: input.lesson.id,
      sourceType: input.contentType,
      sourceId: input.content.id,
      relatedSourceRefs: [],
      translationIndex: 0,
      type: draft.type,
      subtype: draft.subtype,
      promptTemplate: draft.promptTemplate,
      options: draft.options,
      correctIndex: draft.correctIndex,
      reviewData: draft.reviewData,
      explanation: draft.explanation,
      status: "draft"
    });
    input.lessonQuestions.set(created.id, created);
    stage.blocks.push({ type: "question", refId: created.id });
    return created;
  }

  private collectStageContentRefs(stage?: LessonStage) {
    if (!stage) return [];
    const rows: Array<{ contentType: ContentType; contentId: string }> = [];
    const seen = new Set<string>();
    for (const block of stage.blocks || []) {
      if (block.type !== "content" || !block.contentType || !block.refId) continue;
      const key = `${block.contentType}:${block.refId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ contentType: block.contentType, contentId: block.refId });
    }
    return rows;
  }

  private async syncLessonContentItems(lesson: LessonEntity, stages: LessonStage[], createdBy: string) {
    const introduced = this.collectStageContentRefs(stages[0]);
    const review = this.collectStageContentRefs(stages[1]);
    const practice = this.collectStageContentRefs(stages[2]);
    await this.contentCurriculum.replaceLessonContentItems({
      lesson,
      createdBy,
      introduced,
      review,
      practice
    });
  }

  private async resolveExpressionForLesson(input: {
    lesson: LessonEntity;
    expressionText: string;
    translations?: string[];
    explanation?: string;
    pronunciation?: string;
  }) {
    const text = String(input.expressionText || "").trim();
    if (!text) throw new Error("expression text is required");

    const existing = await this.expressions.findByText(input.lesson.language, text);
    const mergedTranslations = Array.from(
      new Set(
        [
          ...(existing?.translations || []),
          ...(Array.isArray(input.translations) ? input.translations : [])
        ]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
    if (existing) {
      const updated = await this.expressions.updateById(existing.id, {
        translations: mergedTranslations.length > 0 ? mergedTranslations : existing.translations,
        pronunciation: existing.pronunciation || String(input.pronunciation || "").trim(),
        explanation: existing.explanation || String(input.explanation || "").trim()
      });
      return {
        expression: updated || existing,
        existedBefore: true
      };
    }

    const created = await this.expressions.create({
      language: input.lesson.language,
      text,
      textNormalized: text.trim().toLowerCase(),
      translations: mergedTranslations.length > 0 ? mergedTranslations : [text],
      pronunciation: String(input.pronunciation || "").trim(),
      explanation: String(input.explanation || "").trim(),
      examples: [],
      difficulty: 1,
      aiMeta: {
        generatedByAI: false,
        model: "",
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
      components: [],
      status: "draft"
    });

    return {
      expression: created,
      existedBefore: false
    };
  }

  private async resolveWordForLesson(input: {
    lesson: LessonEntity;
    wordText: string;
    translations?: string[];
    explanation?: string;
    pronunciation?: string;
  }) {
    const text = String(input.wordText || "").trim();
    if (!text) throw new Error("word text is required");

    const existing = await this.words.findByText(input.lesson.language, text);
    const mergedTranslations = Array.from(
      new Set(
        [ ...(existing?.translations || []), ...(Array.isArray(input.translations) ? input.translations : []) ]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
    if (existing) {
      const updated = await this.words.updateById(existing.id, {
        translations: mergedTranslations.length > 0 ? mergedTranslations : existing.translations,
        pronunciation: existing.pronunciation || String(input.pronunciation || "").trim(),
        explanation: existing.explanation || String(input.explanation || "").trim()
      });
      return {
        word: updated || existing,
        existedBefore: true
      };
    }

    const created = await this.words.create({
      language: input.lesson.language,
      text,
      textNormalized: text.toLowerCase(),
      translations: mergedTranslations.length > 0 ? mergedTranslations : [text],
      pronunciation: String(input.pronunciation || "").trim(),
      explanation: String(input.explanation || "").trim(),
      examples: [],
      difficulty: 1,
      aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
      audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
      lemma: text,
      partOfSpeech: "unknown",
      status: "draft"
    });

    return {
      word: created,
      existedBefore: false
    };
  }

  private async upsertWordFromSentenceComponent(input: {
    lesson: LessonEntity;
    text: string;
    translations: string[];
  }) {
    const { word } = await this.resolveWordForLesson({
      lesson: input.lesson,
      wordText: input.text,
      translations: input.translations
    });
    return word;
  }

  private async resolveSentenceForLesson(input: {
    lesson: LessonEntity;
    sentenceText: string;
    translations: string[];
    literalTranslation?: string;
    usageNotes?: string;
    explanation?: string;
    components: Array<{ type: "word" | "expression"; text: string; translations: string[] }>;
  }) {
    const text = String(input.sentenceText || "").trim();
    if (!text) throw new Error("sentence text is required");

    const wordByText = new Map<string, WordEntity>();
    const expressionByText = new Map<string, ExpressionEntity>();
    for (const component of input.components) {
      const key = normalizeText(component.text);
      if (!key) continue;
      if (component.type === "word") {
        const word = await this.upsertWordFromSentenceComponent({
          lesson: input.lesson,
          text: component.text,
          translations: component.translations
        });
        wordByText.set(key, word);
        continue;
      }
      const { expression } = await this.resolveExpressionForLesson({
        lesson: input.lesson,
        expressionText: component.text,
        translations: component.translations
      });
      expressionByText.set(key, expression);
    }

    const componentRefs = input.components
      .map((component, index) => {
        const content =
          component.type === "word"
            ? wordByText.get(normalizeText(component.text))
            : expressionByText.get(normalizeText(component.text));
        if (!content) return null;
        return {
          type: component.type,
          refId: content.id,
          orderIndex: index,
          textSnapshot: content.text
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (componentRefs.length !== input.components.length) {
      throw new Error("sentence components could not be resolved");
    }

    const existing = await this.sentences.findByText(input.lesson.language, text);
    const mergedTranslations = Array.from(new Set(input.translations.map((item) => String(item || "").trim()).filter(Boolean)));
    if (existing) {
      const updated = await this.sentences.updateById(existing.id, {
        translations: Array.from(new Set([...existing.translations, ...mergedTranslations])),
        literalTranslation: existing.literalTranslation || String(input.literalTranslation || "").trim(),
        usageNotes: existing.usageNotes || String(input.usageNotes || "").trim(),
        explanation: existing.explanation || String(input.explanation || "").trim(),
        components: existing.components.length > 0 ? existing.components : componentRefs
      });
      return {
        sentence: updated || existing,
        existedBefore: true
      };
    }

    const created = await this.sentences.create({
      language: input.lesson.language,
      text,
      textNormalized: text.toLowerCase(),
      translations: mergedTranslations.length > 0 ? mergedTranslations : [text],
      pronunciation: "",
      explanation: String(input.explanation || "").trim(),
      examples: [],
      difficulty: 1,
      aiMeta: { generatedByAI: false, model: "", reviewedByAdmin: false },
      audio: { provider: "", model: "", voice: "", locale: "", format: "", url: "", s3Key: "" },
      literalTranslation: String(input.literalTranslation || "").trim(),
      usageNotes: String(input.usageNotes || "").trim(),
      components: componentRefs,
      status: "draft"
    });
    return {
      sentence: created,
      existedBefore: false
    };
  }

  private async removeWordBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    wordText: string;
    lessonQuestions: Map<string, QuestionEntity>;
  }) {
    const textKey = normalizeText(input.wordText);
    if (!textKey) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedWordId: null as string | null };
    }

    const lessonWords = await this.listLessonWords(input.lesson.id, input.stages);
    const word = lessonWords.find((item) => normalizeText(item.text) === textKey);
    if (!word) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedWordId: null as string | null };
    }

    const wordQuestionIds = new Set(
      Array.from(input.lessonQuestions.values())
        .filter((question) => {
          if (question.sourceType === "word" && question.sourceId === word.id) return true;
          return Array.isArray(question.relatedSourceRefs)
            ? question.relatedSourceRefs.some((ref) => ref.type === "word" && ref.id === word.id)
            : false;
        })
        .map((question) => question.id)
    );
    const now = new Date();
    let removedBlockCount = 0;

    for (const stage of input.stages) {
      const before = stage.blocks.length;
      stage.blocks = stage.blocks.filter((block) => {
        if (block.type === "content" && block.contentType === "word" && block.refId === word.id) return false;
        if (blockMatchesQuestionId(block, wordQuestionIds)) return false;
        return true;
      });
      removedBlockCount += before - stage.blocks.length;
    }

    for (const questionId of wordQuestionIds) {
      await this.questions.softDeleteById(questionId, now);
      input.lessonQuestions.delete(questionId);
    }

    return {
      removedQuestionCount: wordQuestionIds.size,
      removedBlockCount,
      removedWordId: word.id
    };
  }

  private async addWordBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    lessonQuestions: Map<string, QuestionEntity>;
    wordText: string;
    translations?: string[];
    explanation?: string;
    pronunciation?: string;
    languagePool: WordEntity[];
  }) {
    const { word, existedBefore } = await this.resolveWordForLesson({
      lesson: input.lesson,
      wordText: input.wordText,
      translations: input.translations,
      explanation: input.explanation,
      pronunciation: input.pronunciation
    });

    const existingBundleQuestion = Array.from(input.lessonQuestions.values()).some(
      (question) => question.sourceType === "word" && question.sourceId === word.id
    );
    const existingWordBlock = input.stages.some((stage) =>
      stage.blocks.some((block) => block.type === "content" && block.contentType === "word" && block.refId === word.id)
    );
    const alreadyIntroduced = await this.contentCurriculum.wasContentIntroducedBeforeLesson({
      lesson: input.lesson,
      contentType: "word",
      contentId: word.id
    });
    if (existingBundleQuestion || existingWordBlock) {
      return {
        word,
        existedBefore,
        treatedAsReview: alreadyIntroduced,
        questionsCreated: 0,
        blocksInserted: 0,
        linkedExistingWord: existedBefore ? 1 : 0,
        createdNewWord: existedBefore ? 0 : 1
      };
    }

    const lessonWords = await this.listLessonWords(input.lesson.id, input.stages);
    const lessonWordPool = buildLessonWordPool(input.languagePool, lessonWords);
    const drafts = selectBundleQuestionDrafts(
      "target",
      `word:${word.id}`,
      filterDraftsForLesson(
        input.lesson,
        "word",
        buildQuestionDrafts(word, lessonWords, lessonWordPool, alreadyIntroduced)
      )
    );
    let questionsCreated = 0;
    let blocksInserted = 0;
    const wordInsertedByStage = new Set<number>();

    for (const draft of drafts) {
      if (alreadyIntroduced && draft.stage === 1) continue;
      const created = await this.questions.create({
        lessonId: input.lesson.id,
        sourceType: "word",
        sourceId: word.id,
        relatedSourceRefs: [],
        translationIndex: 0,
        type: draft.type,
        subtype: draft.subtype,
        promptTemplate: draft.promptTemplate,
        options: draft.options,
        correctIndex: draft.correctIndex,
        reviewData: draft.reviewData,
        explanation: draft.explanation,
        status: "draft"
      });
      input.lessonQuestions.set(created.id, created);
      questionsCreated += 1;

      const stageIndex = draft.stage - 1;
      const stage = input.stages[stageIndex];
      if (!stage) continue;
      if (!alreadyIntroduced && stageIndex === 0 && !wordInsertedByStage.has(stageIndex)) {
        stage.blocks.push({ type: "content", contentType: "word", refId: word.id });
        blocksInserted += 1;
        wordInsertedByStage.add(stageIndex);
      }
      stage.blocks.push({ type: "question", refId: created.id });
      blocksInserted += 1;
    }

    const scenarioQuestion = await this.maybeAddLessonScenarioQuestion({
      lesson: input.lesson,
      stages: input.stages,
      lessonQuestions: input.lessonQuestions,
      contentType: "word",
      content: word,
      lessonPool: lessonWords,
      languagePool: lessonWordPool
    });
    if (scenarioQuestion) {
      questionsCreated += 1;
      blocksInserted += 1;
    }

    return {
      word,
      existedBefore,
      treatedAsReview: alreadyIntroduced,
      questionsCreated,
      blocksInserted,
      linkedExistingWord: existedBefore ? 1 : 0,
      createdNewWord: existedBefore ? 0 : 1
    };
  }

  private async removeExpressionBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    expressionText: string;
    lessonQuestions: Map<string, QuestionEntity>;
  }) {
    const textKey = normalizeText(input.expressionText);
    if (!textKey) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedExpressionId: null as string | null };
    }

    const lessonExpressions = await this.listLessonExpressions(input.lesson.id, input.stages);
    const expression = lessonExpressions.find((item) => normalizeText(item.text) === textKey);
    if (!expression) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedExpressionId: null as string | null };
    }

    const expressionQuestionIds = new Set(
      Array.from(input.lessonQuestions.values())
        .filter((question) => {
          if (question.sourceType === "expression" && question.sourceId === expression.id) return true;
          return Array.isArray(question.relatedSourceRefs)
            ? question.relatedSourceRefs.some((ref) => ref.type === "expression" && ref.id === expression.id)
            : false;
        })
        .map((question) => question.id)
    );
    const now = new Date();
    let removedBlockCount = 0;

    for (const stage of input.stages) {
      const before = stage.blocks.length;
      stage.blocks = stage.blocks.filter((block) => {
        if (block.type === "content" && block.contentType === "expression" && block.refId === expression.id) return false;
        if (blockMatchesQuestionId(block, expressionQuestionIds)) return false;
        return true;
      });
      removedBlockCount += before - stage.blocks.length;
    }

    for (const questionId of expressionQuestionIds) {
      await this.questions.softDeleteById(questionId, now);
      input.lessonQuestions.delete(questionId);
    }

    return {
      removedQuestionCount: expressionQuestionIds.size,
      removedBlockCount,
      removedExpressionId: expression.id
    };
  }

  private async addExpressionBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    lessonQuestions: Map<string, QuestionEntity>;
    expressionText: string;
    translations?: string[];
    explanation?: string;
    pronunciation?: string;
    languagePool: ExpressionEntity[];
  }) {
    const { expression, existedBefore } = await this.resolveExpressionForLesson({
      lesson: input.lesson,
      expressionText: input.expressionText,
      translations: input.translations,
      explanation: input.explanation,
      pronunciation: input.pronunciation
    });

    const existingBundleQuestion = Array.from(input.lessonQuestions.values()).some(
      (question) => question.sourceType === "expression" && question.sourceId === expression.id
    );
    const existingExpressionBlock = input.stages.some((stage) =>
      stage.blocks.some((block) => block.type === "content" && block.contentType === "expression" && block.refId === expression.id)
    );
    const alreadyIntroduced = await this.contentCurriculum.wasContentIntroducedBeforeLesson({
      lesson: input.lesson,
      contentType: "expression",
      contentId: expression.id
    });
    if (existingBundleQuestion || existingExpressionBlock) {
      return {
        expression,
        existedBefore,
        treatedAsReview: alreadyIntroduced,
        questionsCreated: 0,
        blocksInserted: 0,
        linkedExistingExpression: existedBefore ? 1 : 0,
        createdNewExpression: existedBefore ? 0 : 1
      };
    }

    const lessonExpressions = await this.listLessonExpressions(input.lesson.id, input.stages);
    const lessonExpressionPool = buildLessonExpressionPool(input.languagePool, lessonExpressions);
    const drafts = selectBundleQuestionDrafts(
      "target",
      `expression:${expression.id}`,
      filterDraftsForLesson(
        input.lesson,
        "expression",
        buildQuestionDrafts(expression, lessonExpressions, lessonExpressionPool, alreadyIntroduced)
      )
    );
    let questionsCreated = 0;
    let blocksInserted = 0;
    const expressionInsertedByStage = new Set<number>();

    for (const draft of drafts) {
      if (alreadyIntroduced && draft.stage === 1) continue;
      const created = await this.questions.create({
        lessonId: input.lesson.id,
        sourceType: "expression",
        sourceId: expression.id,
        relatedSourceRefs: [],
        translationIndex: 0,
        type: draft.type,
        subtype: draft.subtype,
        promptTemplate: draft.promptTemplate,
        options: draft.options,
        correctIndex: draft.correctIndex,
        reviewData: draft.reviewData,
        explanation: draft.explanation,
        status: "draft"
      });
      input.lessonQuestions.set(created.id, created);
      questionsCreated += 1;

      const stageIndex = draft.stage - 1;
      const stage = input.stages[stageIndex];
      if (!stage) continue;
      if (!alreadyIntroduced && stageIndex === 0 && !expressionInsertedByStage.has(stageIndex)) {
        stage.blocks.push({ type: "content", contentType: "expression", refId: expression.id });
        blocksInserted += 1;
        expressionInsertedByStage.add(stageIndex);
      }
      stage.blocks.push({ type: "question", refId: created.id });
      blocksInserted += 1;
    }

    const scenarioQuestion = await this.maybeAddLessonScenarioQuestion({
      lesson: input.lesson,
      stages: input.stages,
      lessonQuestions: input.lessonQuestions,
      contentType: "expression",
      content: expression,
      lessonPool: lessonExpressions,
      languagePool: lessonExpressionPool
    });
    if (scenarioQuestion) {
      questionsCreated += 1;
      blocksInserted += 1;
    }

    return {
      expression,
      existedBefore,
      treatedAsReview: alreadyIntroduced,
      questionsCreated,
      blocksInserted,
      linkedExistingExpression: existedBefore ? 1 : 0,
      createdNewExpression: existedBefore ? 0 : 1
    };
  }

  private async removeReviewPhraseTranslationQuestions(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    lessonQuestions: Map<string, QuestionEntity>;
  }) {
    const removableQuestionIds = new Set(
      Array.from(input.lessonQuestions.values())
        .filter(
          (question) =>
            question.subtype === "mc-select-translation" &&
            (question.sourceType === "word" || question.sourceType === "expression")
        )
        .map((question) => question.id)
    );
    if (removableQuestionIds.size === 0) {
      return { removedQuestionCount: 0, removedBlockCount: 0 };
    }

    let removedBlockCount = 0;
    const now = new Date();

    for (const stage of input.stages) {
      const before = stage.blocks.length;
      stage.blocks = stage.blocks.filter((block) => !blockMatchesQuestionId(block, removableQuestionIds));
      removedBlockCount += before - stage.blocks.length;
    }

    for (const questionId of removableQuestionIds) {
      await this.questions.softDeleteById(questionId, now);
      input.lessonQuestions.delete(questionId);
    }

    return {
      removedQuestionCount: removableQuestionIds.size,
      removedBlockCount
    };
  }

  private async removeSentenceBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    sentenceText: string;
    lessonQuestions: Map<string, QuestionEntity>;
  }) {
    const textKey = normalizeText(input.sentenceText);
    if (!textKey) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedSentenceId: null as string | null };
    }

    const lessonSentences = await this.listLessonSentences(input.lesson.id, input.stages);
    const sentence = lessonSentences.find((item) => normalizeText(item.text) === textKey);
    if (!sentence) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedSentenceId: null as string | null };
    }

    const sentenceQuestionIds = new Set(
      Array.from(input.lessonQuestions.values())
        .filter((question) => question.sourceType === "sentence" && question.sourceId === sentence.id)
        .map((question) => question.id)
    );
    const now = new Date();
    let removedBlockCount = 0;

    for (const stage of input.stages) {
      const before = stage.blocks.length;
      stage.blocks = stage.blocks.filter((block) => {
        if (block.type === "content" && block.contentType === "sentence" && block.refId === sentence.id) return false;
        if (blockMatchesQuestionId(block, sentenceQuestionIds)) return false;
        return true;
      });
      removedBlockCount += before - stage.blocks.length;
    }

    for (const questionId of sentenceQuestionIds) {
      await this.questions.softDeleteById(questionId, now);
      input.lessonQuestions.delete(questionId);
    }

    return {
      removedQuestionCount: sentenceQuestionIds.size,
      removedBlockCount,
      removedSentenceId: sentence.id
    };
  }

  private async addSentenceBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    lessonQuestions: Map<string, QuestionEntity>;
    sentenceText: string;
    translations: string[];
    literalTranslation?: string;
    usageNotes?: string;
    explanation?: string;
    components: Array<{ type: "word" | "expression"; text: string; translations: string[] }>;
  }) {
    const { sentence, existedBefore } = await this.resolveSentenceForLesson({
      lesson: input.lesson,
      sentenceText: input.sentenceText,
      translations: input.translations,
      literalTranslation: input.literalTranslation,
      usageNotes: input.usageNotes,
      explanation: input.explanation,
      components: input.components
    });

    const existingSentenceBlock = input.stages.some((stage) =>
      stage.blocks.some((block) => block.type === "content" && block.contentType === "sentence" && block.refId === sentence.id)
    );
    const existingSentenceQuestion = Array.from(input.lessonQuestions.values()).some(
      (question) => question.sourceType === "sentence" && question.sourceId === sentence.id
    );
    const alreadyIntroduced = await this.contentCurriculum.wasContentIntroducedBeforeLesson({
      lesson: input.lesson,
      contentType: "sentence",
      contentId: sentence.id
    });

    if (existingSentenceBlock || existingSentenceQuestion) {
      return {
        sentence,
        existedBefore,
        treatedAsReview: alreadyIntroduced,
        questionsCreated: 0,
        blocksInserted: 0,
        linkedExistingSentence: existedBefore ? 1 : 0,
        createdNewSentence: existedBefore ? 0 : 1
      };
    }


    const sentencePool = await this.listLessonSentences(input.lesson.id, input.stages);
    const sentenceQuestionPool =
      sentencePool.length > 0
        ? Array.from(new Map([...sentencePool, sentence].map((item) => [item.id, item])).values())
        : [sentence];

    const drafts = selectBundleQuestionDrafts(
      "sentence",
      `sentence:${sentence.id}`,
      buildSentenceQuestionDrafts(sentence, sentenceQuestionPool, [])
    );
    let questionsCreated = 0;
    let blocksInserted = 0;

    for (const draft of drafts) {
      const created = await this.questions.create({
        lessonId: input.lesson.id,
        sourceType: "sentence",
        sourceId: sentence.id,
        relatedSourceRefs: [],
        translationIndex: 0,
        type: draft.type,
        subtype: draft.subtype,
        promptTemplate: draft.promptTemplate,
        options: draft.options,
        correctIndex: draft.correctIndex,
        reviewData: draft.reviewData,
        explanation: draft.explanation,
        status: "draft"
      });
      input.lessonQuestions.set(created.id, created);
      questionsCreated += 1;
      const stageIndex = draft.stage - 1;
      input.stages[stageIndex]?.blocks.push({ type: "question", refId: created.id });
      blocksInserted += 1;
    }

    return {
      sentence,
      existedBefore,
      treatedAsReview: alreadyIntroduced,
      questionsCreated,
      blocksInserted,
      linkedExistingSentence: existedBefore ? 1 : 0,
      createdNewSentence: existedBefore ? 0 : 1
    };
  }

  async applyPatchPlan(input: {
    lesson: LessonEntity;
    patch: LlmLessonRefactorPatch;
    languagePool: ExpressionEntity[];
    wordLanguagePool: WordEntity[];
    createdBy: string;
  }): Promise<LessonPatchApplySummary> {
    const currentLesson = await this.lessons.findById(input.lesson.id);
    if (!currentLesson) throw new Error("Lesson not found.");

    const stages = ensureRefactorStages(currentLesson);
    const lessonQuestions = new Map((await this.questions.list({ lessonId: currentLesson.id })).map((item) => [item.id, item]));
    if (currentLesson.kind === "review") {
      await this.removeReviewPhraseTranslationQuestions({
        lesson: currentLesson,
        stages,
        lessonQuestions
      });
    }
    const initialQuestionCount = lessonQuestions.size;
    let createdNewWordCount = 0;
    let linkedExistingWordCount = 0;
    let createdNewExpressionCount = 0;
    let linkedExistingExpressionCount = 0;
    let createdNewSentenceCount = 0;
    let linkedExistingSentenceCount = 0;
    let reviewWordCount = 0;
    let newWordCount = 0;
    let reviewExpressionCount = 0;
    let newExpressionCount = 0;
    let reviewSentenceCount = 0;
    let newSentenceCount = 0;
    let questionsCreated = 0;
    let blocksInserted = 0;

    for (const operation of input.patch.operations) {
      if (operation.type === "add_text_block") {
        const stage = stages[operation.stageIndex];
        if (!stage) continue;
        const content = String(operation.content || "").trim();
        if (!content) continue;
        insertBlock(stage, { type: "text", content }, operation.blockIndex);
        blocksInserted += 1;
        continue;
      }

      if (operation.type === "remove_block") {
        const stage = stages[operation.stageIndex];
        if (!stage) continue;
        if (!Number.isInteger(operation.blockIndex) || operation.blockIndex < 0 || operation.blockIndex >= stage.blocks.length) {
          continue;
        }
        const [removed] = stage.blocks.splice(operation.blockIndex, 1);
        if (!removed) continue;
        blocksInserted -= 1;
        if (removed.type === "question" && removed.refId) {
          const questionId = String(removed.refId);
          const stillReferenced = stages.some((candidateStage) =>
            candidateStage.blocks.some((block) => block.type === "question" && block.refId === questionId)
          );
          if (!stillReferenced) {
            await this.questions.softDeleteById(questionId, new Date());
            lessonQuestions.delete(questionId);
          }
        }
        continue;
      }

      if (operation.type === "move_block") {
        const fromStage = stages[operation.fromStageIndex];
        const toStage = stages[operation.toStageIndex];
        if (!fromStage || !toStage) continue;
        if (
          !Number.isInteger(operation.fromBlockIndex) ||
          operation.fromBlockIndex < 0 ||
          operation.fromBlockIndex >= fromStage.blocks.length
        ) {
          continue;
        }
        const [moved] = fromStage.blocks.splice(operation.fromBlockIndex, 1);
        if (!moved) continue;
        insertBlock(toStage, moved, operation.toBlockIndex);
        continue;
      }

      if (operation.type === "remove_expression_bundle") {
        const removed = await this.removeExpressionBundle({
          lesson: currentLesson,
          stages,
          expressionText: operation.expressionText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        continue;
      }

      if (operation.type === "remove_word_bundle") {
        const removed = await this.removeWordBundle({
          lesson: currentLesson,
          stages,
          wordText: operation.wordText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        continue;
      }

      if (operation.type === "remove_sentence_bundle") {
        const removed = await this.removeSentenceBundle({
          lesson: currentLesson,
          stages,
          sentenceText: operation.sentenceText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        continue;
      }

      if (operation.type === "replace_word_bundle") {
        const removed = await this.removeWordBundle({
          lesson: currentLesson,
          stages,
          wordText: operation.oldWordText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        const added = await this.addWordBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          wordText: operation.newWordText,
          translations: operation.translations,
          explanation: operation.explanation,
          pronunciation: operation.pronunciation,
          languagePool: input.wordLanguagePool
        });
        createdNewWordCount += added.createdNewWord;
        linkedExistingWordCount += added.linkedExistingWord;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewWordCount += 1;
        else newWordCount += 1;
        continue;
      }

      if (operation.type === "replace_expression_bundle") {
        const removed = await this.removeExpressionBundle({
          lesson: currentLesson,
          stages,
          expressionText: operation.oldExpressionText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        const added = await this.addExpressionBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          expressionText: operation.newExpressionText,
          translations: operation.translations,
          explanation: operation.explanation,
          pronunciation: operation.pronunciation,
          languagePool: input.languagePool
        });
        createdNewExpressionCount += added.createdNewExpression;
        linkedExistingExpressionCount += added.linkedExistingExpression;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewExpressionCount += 1;
        else newExpressionCount += 1;
        continue;
      }

      if (operation.type === "replace_sentence_bundle") {
        const removed = await this.removeSentenceBundle({
          lesson: currentLesson,
          stages,
          sentenceText: operation.oldSentenceText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        const added = await this.addSentenceBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          sentenceText: operation.newSentenceText,
          translations: operation.translations,
          literalTranslation: operation.literalTranslation,
          usageNotes: operation.usageNotes,
          explanation: operation.explanation,
          components: operation.components.map((component) => ({
            type: component.type,
            text: component.text,
            translations: component.translations
          }))
        });
        createdNewSentenceCount += added.createdNewSentence;
        linkedExistingSentenceCount += added.linkedExistingSentence;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewSentenceCount += 1;
        else newSentenceCount += 1;
        continue;
      }

      if (operation.type === "add_word_bundle") {
        const added = await this.addWordBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          wordText: operation.wordText,
          translations: operation.translations,
          explanation: operation.explanation,
          pronunciation: operation.pronunciation,
          languagePool: input.wordLanguagePool
        });
        createdNewWordCount += added.createdNewWord;
        linkedExistingWordCount += added.linkedExistingWord;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewWordCount += 1;
        else newWordCount += 1;
        continue;
      }

      if (operation.type === "add_expression_bundle") {
        const added = await this.addExpressionBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          expressionText: operation.expressionText,
          translations: operation.translations,
          explanation: operation.explanation,
          pronunciation: operation.pronunciation,
          languagePool: input.languagePool
        });
        createdNewExpressionCount += added.createdNewExpression;
        linkedExistingExpressionCount += added.linkedExistingExpression;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewExpressionCount += 1;
        else newExpressionCount += 1;
        continue;
      }

      if (operation.type === "add_sentence_bundle") {
        const added = await this.addSentenceBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          sentenceText: operation.sentenceText,
          translations: operation.translations,
          literalTranslation: operation.literalTranslation,
          usageNotes: operation.usageNotes,
          explanation: operation.explanation,
          components: operation.components.map((component) => ({
            type: component.type,
            text: component.text,
            translations: component.translations
          }))
        });
        createdNewSentenceCount += added.createdNewSentence;
        linkedExistingSentenceCount += added.linkedExistingSentence;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewSentenceCount += 1;
        else newSentenceCount += 1;
        continue;
      }

      if (operation.type === "add_match_translation_block") {
        const stage = stages[operation.stageIndex];
        if (!stage) continue;

        const lessonExpressions = await this.listLessonExpressions(currentLesson.id, stages);
        const stageExpressionIds = new Set(
          stage.blocks
            .flatMap((block) =>
              block.type === "content" && block.contentType === "expression" && block.refId
                ? [String(block.refId)]
                : []
            )
        );
        const candidateExpressions =
          stageExpressionIds.size > 0
            ? lessonExpressions.filter((expression) => stageExpressionIds.has(expression.id))
            : lessonExpressions;
        const matchingDraft = buildMatchTranslationQuestionDraft(
          currentLesson.id,
          candidateExpressions,
          operation.expressionTexts
        );
        if (!matchingDraft) continue;

        const matchingSourceKey = (matchingDraft.relatedSourceRefs || []).map((item) => item.id).join("|");
        const alreadyExistsInStage = stage.blocks.some((block) => {
          if (block.type !== "question" || !block.refId) return false;
          const existingQuestion = lessonQuestions.get(String(block.refId));
          return (
            existingQuestion?.subtype === "mt-match-translation" &&
            Array.isArray(existingQuestion.relatedSourceRefs) &&
            existingQuestion.relatedSourceRefs.map((item) => item.id).join("|") === matchingSourceKey
          );
        });
        if (alreadyExistsInStage) continue;

        const created = await this.questions.create(matchingDraft);
        lessonQuestions.set(created.id, created);
        stage.blocks.push({ type: "question", refId: created.id });
        questionsCreated += 1;
        blocksInserted += 1;
      }
    }

    const updated = await this.lessons.updateById(currentLesson.id, { stages });
    if (!updated) {
      throw new Error("Failed to update lesson stages.");
    }
    await this.syncLessonContentItems(currentLesson, stages, input.createdBy);

    return {
      lessonId: currentLesson.id,
      title: currentLesson.title,
      contentGenerated: createdNewWordCount + createdNewExpressionCount + createdNewSentenceCount,
      sentencesGenerated: createdNewSentenceCount,
      existingContentLinked: linkedExistingWordCount + linkedExistingExpressionCount + linkedExistingSentenceCount,
      newContentSelected: newWordCount + newExpressionCount + newSentenceCount,
      reviewContentSelected: reviewWordCount + reviewExpressionCount + reviewSentenceCount,
      contentDroppedFromCandidates: 0,
      proverbsGenerated: 0,
      questionsGenerated: questionsCreated,
      blocksGenerated: stages.reduce((sum, stage) => sum + stage.blocks.length, 0) - (initialQuestionCount - lessonQuestions.size)
    };
  }
}
