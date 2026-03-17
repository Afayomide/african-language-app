import type { LessonBlock, LessonEntity, LessonStage } from "../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../domain/entities/Phrase.js";
import type { QuestionEntity, QuestionSubtype, QuestionType } from "../../domain/entities/Question.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";
import type { LlmLessonRefactorPatch } from "../../services/llm/types.js";
import { buildLetterOrderReviewData } from "../../controllers/shared/spellingQuestion.js";
import { PhraseIntroductionService, wasPhraseIntroducedBeforeLesson } from "./PhraseIntroductionService.js";

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

export type LessonPatchApplySummary = {
  lessonId: string;
  title: string;
  phrasesGenerated: number;
  repeatedPhrasesLinked: number;
  newPhrasesSelected: number;
  reviewPhrasesSelected: number;
  phrasesDroppedFromCandidates: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
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

export function pickTranslation(phrase: PhraseEntity, translationIndex = 0) {
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

export function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPhraseOrderReviewData(phrase: PhraseEntity): NonNullable<QuestionEntity["reviewData"]> | null {
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

function buildPhraseGapFillReviewData(phrase: PhraseEntity): NonNullable<QuestionEntity["reviewData"]> | null {
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
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[],
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
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[]
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
  const base = makeUniqueOptions([currentTranslation, ...selectedDistractors]);
  const padded = [...base];
  const fallbackOptions = ["I am not sure", "Maybe later", "Try again"];
  for (const fallback of fallbackOptions) {
    if (padded.length >= 4) break;
    if (!padded.some((item) => item.toLowerCase() === fallback.toLowerCase())) {
      padded.push(fallback);
    }
  }

  const shuffled = shuffle(padded);
  const correctIndex = shuffled.findIndex((item) => item.toLowerCase() === currentTranslation.toLowerCase());
  return {
    options: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  };
}

function buildMissingWordOptions(
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[]
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

export function buildQuestionDrafts(
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[],
  alreadyIntroduced = false
): StageTaggedDraft[] {
  const mc = buildMcOptions(phrase, lessonPhrases, languagePool);
  const phraseOrderReviewData = buildPhraseOrderReviewData(phrase);
  const phraseGapFillReviewData = buildPhraseGapFillReviewData(phrase);
  const spellingReviewData = buildLetterOrderReviewData({
    phraseText: phrase.text,
    meaning: pickTranslation(phrase)
  });
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
    drafts.push(
      {
        stage: 2,
        type: "multiple-choice",
        subtype: "mc-select-translation",
        promptTemplate: "What does {phrase} mean?",
        options: mc.options,
        correctIndex: mc.correctIndex,
        explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
      },
      {
        stage: 2,
        type: "listening",
        subtype: "ls-mc-select-translation",
        promptTemplate: "Listen and choose the meaning of {phrase}.",
        options: mc.options,
        correctIndex: mc.correctIndex,
        explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
      }
    );
  }

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

  drafts.push(
    {
      stage: 3,
      type: "multiple-choice",
      subtype: "mc-select-translation",
      promptTemplate: "What is {phrase} in English?",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
    },
    {
      stage: 3,
      type: "listening",
      subtype: "ls-mc-select-translation",
      promptTemplate: "Listen and choose the correct translation for {phrase}.",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
    }
  );

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
  return [
    {
      id: `${lessonId}-stage-1`,
      title: "Stage 1: Foundations",
      description: "Learn core words and meanings.",
      orderIndex: 0,
      blocks: []
    },
    {
      id: `${lessonId}-stage-2`,
      title: "Stage 2: Practice",
      description: "Build sentence and usage confidence.",
      orderIndex: 1,
      blocks: []
    },
    {
      id: `${lessonId}-stage-3`,
      title: "Stage 3: Listening and Review",
      description: "Reinforce with audio and proverb context.",
      orderIndex: 2,
      blocks: []
    }
  ];
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

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
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

function buildLessonPhrasePool(languagePool: PhraseEntity[], lessonPhrases: PhraseEntity[]) {
  return Array.from(new Map([...lessonPhrases, ...languagePool].map((item) => [item.id, item])).values());
}

export class LessonRefactorService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly questions: QuestionRepository,
    private readonly phraseIntroductions: PhraseIntroductionService
  ) {}

  private async resolvePhraseForLesson(input: {
    lesson: LessonEntity;
    phraseText: string;
    translations?: string[];
    explanation?: string;
    pronunciation?: string;
  }) {
    const text = String(input.phraseText || "").trim();
    if (!text) throw new Error("phrase text is required");

    const existing = await this.phrases.findReusableByText(input.lesson.language, text);
    const createdOrUpdated = await this.phrases.create({
      lessonIds: [input.lesson.id],
      introducedLessonIds: existing?.introducedLessonIds || [],
      language: input.lesson.language,
      text,
      translations: Array.isArray(input.translations) && input.translations.length > 0
        ? input.translations.map((item) => String(item || "").trim()).filter(Boolean)
        : existing?.translations || [text],
      pronunciation: existing?.pronunciation || String(input.pronunciation || "").trim(),
      explanation: existing?.explanation || String(input.explanation || "").trim(),
      status: existing?.status || "draft"
    });

    return {
      phrase: createdOrUpdated,
      existedBefore: Boolean(existing)
    };
  }

  private async removePhraseBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    phraseText: string;
    lessonQuestions: Map<string, QuestionEntity>;
  }) {
    const textKey = normalizeText(input.phraseText);
    if (!textKey) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedPhraseId: null as string | null };
    }

    const lessonPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const phrase = lessonPhrases.find((item) => normalizeText(item.text) === textKey);
    if (!phrase) {
      return { removedQuestionCount: 0, removedBlockCount: 0, removedPhraseId: null as string | null };
    }

    const phraseQuestionIds = new Set(
      Array.from(input.lessonQuestions.values())
        .filter((question) => question.phraseId === phrase.id)
        .map((question) => question.id)
    );
    const now = new Date();
    let removedBlockCount = 0;

    for (const stage of input.stages) {
      const before = stage.blocks.length;
      stage.blocks = stage.blocks.filter((block) => {
        if (block.type === "phrase" && block.refId === phrase.id) return false;
        if (blockMatchesQuestionId(block, phraseQuestionIds)) return false;
        return true;
      });
      removedBlockCount += before - stage.blocks.length;
    }

    for (const questionId of phraseQuestionIds) {
      await this.questions.softDeleteById(questionId, now);
      input.lessonQuestions.delete(questionId);
    }

    await this.phrases.updateById(phrase.id, {
      lessonIds: phrase.lessonIds.filter((lessonId) => lessonId !== input.lesson.id),
      introducedLessonIds: phrase.introducedLessonIds.filter((lessonId) => lessonId !== input.lesson.id)
    });

    return {
      removedQuestionCount: phraseQuestionIds.size,
      removedBlockCount,
      removedPhraseId: phrase.id
    };
  }

  private async addPhraseBundle(input: {
    lesson: LessonEntity;
    stages: LessonStage[];
    lessonQuestions: Map<string, QuestionEntity>;
    phraseText: string;
    translations?: string[];
    explanation?: string;
    pronunciation?: string;
    languagePool: PhraseEntity[];
  }) {
    const { phrase, existedBefore } = await this.resolvePhraseForLesson({
      lesson: input.lesson,
      phraseText: input.phraseText,
      translations: input.translations,
      explanation: input.explanation,
      pronunciation: input.pronunciation
    });

    const existingBundleQuestion = Array.from(input.lessonQuestions.values()).some((question) => question.phraseId === phrase.id);
    const existingPhraseBlock = input.stages.some((stage) =>
      stage.blocks.some((block) => block.type === "phrase" && block.refId === phrase.id)
    );
    if (existingBundleQuestion || existingPhraseBlock) {
      return {
        phrase,
        existedBefore,
        treatedAsReview: wasPhraseIntroducedBeforeLesson(phrase, input.lesson.id, !existedBefore),
        questionsCreated: 0,
        blocksInserted: 0,
        linkedExistingPhrase: existedBefore ? 1 : 0,
        createdNewPhrase: existedBefore ? 0 : 1
      };
    }

    const lessonPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const lessonPhrasePool = buildLessonPhrasePool(input.languagePool, lessonPhrases);
    const alreadyIntroduced = wasPhraseIntroducedBeforeLesson(phrase, input.lesson.id, !existedBefore);
    const drafts = buildQuestionDrafts(phrase, lessonPhrases, lessonPhrasePool, alreadyIntroduced);
    let questionsCreated = 0;
    let blocksInserted = 0;
    const phraseInsertedByStage = new Set<number>();

    for (const draft of drafts) {
      const created = await this.questions.create({
        lessonId: input.lesson.id,
        phraseId: phrase.id,
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
      if (!alreadyIntroduced && !phraseInsertedByStage.has(stageIndex)) {
        stage.blocks.push({ type: "phrase", refId: phrase.id });
        blocksInserted += 1;
        phraseInsertedByStage.add(stageIndex);
      }
      stage.blocks.push({ type: "question", refId: created.id });
      blocksInserted += 1;
    }

    return {
      phrase,
      existedBefore,
      treatedAsReview: alreadyIntroduced,
      questionsCreated,
      blocksInserted,
      linkedExistingPhrase: existedBefore ? 1 : 0,
      createdNewPhrase: existedBefore ? 0 : 1
    };
  }

  async applyPatchPlan(input: {
    lesson: LessonEntity;
    patch: LlmLessonRefactorPatch;
    languagePool: PhraseEntity[];
  }): Promise<LessonPatchApplySummary> {
    const currentLesson = await this.lessons.findById(input.lesson.id);
    if (!currentLesson) throw new Error("Lesson not found.");

    const stages = ensureRefactorStages(currentLesson);
    const lessonQuestions = new Map((await this.questions.list({ lessonId: currentLesson.id })).map((item) => [item.id, item]));
    const initialQuestionCount = lessonQuestions.size;
    let createdNewPhraseCount = 0;
    let linkedExistingPhraseCount = 0;
    let reviewPhraseCount = 0;
    let newPhraseCount = 0;
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

      if (operation.type === "remove_phrase_bundle") {
        const removed = await this.removePhraseBundle({
          lesson: currentLesson,
          stages,
          phraseText: operation.phraseText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        continue;
      }

      if (operation.type === "replace_phrase_bundle") {
        const removed = await this.removePhraseBundle({
          lesson: currentLesson,
          stages,
          phraseText: operation.oldPhraseText,
          lessonQuestions
        });
        blocksInserted -= removed.removedBlockCount;
        const added = await this.addPhraseBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          phraseText: operation.newPhraseText,
          translations: operation.translations,
          explanation: operation.explanation,
          pronunciation: operation.pronunciation,
          languagePool: input.languagePool
        });
        createdNewPhraseCount += added.createdNewPhrase;
        linkedExistingPhraseCount += added.linkedExistingPhrase;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewPhraseCount += 1;
        else newPhraseCount += 1;
        continue;
      }

      if (operation.type === "add_phrase_bundle") {
        const added = await this.addPhraseBundle({
          lesson: currentLesson,
          stages,
          lessonQuestions,
          phraseText: operation.phraseText,
          translations: operation.translations,
          explanation: operation.explanation,
          pronunciation: operation.pronunciation,
          languagePool: input.languagePool
        });
        createdNewPhraseCount += added.createdNewPhrase;
        linkedExistingPhraseCount += added.linkedExistingPhrase;
        questionsCreated += added.questionsCreated;
        blocksInserted += added.blocksInserted;
        if (added.treatedAsReview) reviewPhraseCount += 1;
        else newPhraseCount += 1;
      }
    }

    const updated = await this.lessons.updateById(currentLesson.id, { stages });
    if (!updated) {
      throw new Error("Failed to update lesson stages.");
    }
    await this.phraseIntroductions.syncStageOneIntroductions(currentLesson.id, stages);

    return {
      lessonId: currentLesson.id,
      title: currentLesson.title,
      phrasesGenerated: createdNewPhraseCount,
      repeatedPhrasesLinked: linkedExistingPhraseCount,
      newPhrasesSelected: newPhraseCount,
      reviewPhrasesSelected: reviewPhraseCount,
      phrasesDroppedFromCandidates: 0,
      proverbsGenerated: 0,
      questionsGenerated: questionsCreated,
      blocksGenerated: stages.reduce((sum, stage) => sum + stage.blocks.length, 0) - (initialQuestionCount - lessonQuestions.size)
    };
  }
}
