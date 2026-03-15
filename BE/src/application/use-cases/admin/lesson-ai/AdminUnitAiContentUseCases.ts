import type { LessonBlock, LessonEntity, LessonStage } from "../../../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type { QuestionEntity, QuestionSubtype, QuestionType } from "../../../../domain/entities/Question.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type { LlmClient, LlmUnitPlanLesson } from "../../../../services/llm/types.js";
import { AiPhraseOrchestrator } from "../../../services/AiPhraseOrchestrator.js";
import { AdminLessonAiUseCases, buildInitialStages } from "./AdminLessonAiUseCases.js";
import { LESSON_GENERATION_LIMITS, clampPhrasesPerLesson } from "../../../../config/lessonGeneration.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../../../services/llm/aiGenerationLogger.js";
import { extractThemeAnchors } from "../../../../services/llm/unitTheme.js";
import { validateLessonSuggestion } from "../../../../services/llm/outputQuality.js";
import { buildLetterOrderReviewData } from "../../../../controllers/shared/spellingQuestion.js";
import {
  PhraseIntroductionService,
  wasPhraseIntroducedBeforeLesson
} from "../../../services/PhraseIntroductionService.js";

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

export type GenerateUnitAiContentInput = {
  unitId: string;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  createdBy: string;
  lessonCount: number;
  phrasesPerLesson: number;
  proverbsPerLesson: number;
  topics?: string[];
  extraInstructions?: string;
  lessonGenerationInstruction?: string;
};

type LessonGenerationSummary = {
  lessonId: string;
  title: string;
  phrasesGenerated: number;
  repeatedPhrasesLinked: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
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
      seedPhrases: string[];
      focusSummary: string;
      reasons: string[];
      validationDetails: ReturnType<typeof validateLessonSuggestion>["details"];
    }>;
    actualLessonCount: number;
  };
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

function pickTranslation(phrase: PhraseEntity, translationIndex = 0) {
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

function getExerciseSentence(phrase: PhraseEntity) {
  const exampleSentence = String(phrase.examples[0]?.original || "").trim();
  if (splitWords(exampleSentence).length >= 2) return exampleSentence;

  const phraseText = String(phrase.text || "").trim();
  if (splitWords(phraseText).length >= 2) return phraseText;

  return "";
}

function buildSentenceReviewData(phrase: PhraseEntity): NonNullable<QuestionEntity["reviewData"]> | null {
  const translation = pickTranslation(phrase);
  const sentence = getExerciseSentence(phrase);
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

function buildQuestionDrafts(
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[],
  alreadyIntroduced = false
): StageTaggedDraft[] {
  const mc = buildMcOptions(phrase, lessonPhrases, languagePool);
  const phraseOrderReviewData = buildPhraseOrderReviewData(phrase);
  const sentenceReviewData = buildSentenceReviewData(phrase);
  const spellingReviewData = buildLetterOrderReviewData({
    phraseText: phrase.text,
    meaning: pickTranslation(phrase)
  });
  const heardWordMc = buildMissingWordOptions(phrase, lessonPhrases, languagePool);
  const gapFill = sentenceReviewData
    ? buildGapFillQuestion(phrase, lessonPhrases, languagePool, sentenceReviewData)
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

  if (gapFill && sentenceReviewData) {
    drafts.push(
      {
        stage: 2,
        type: "multiple-choice",
        subtype: "mc-select-missing-word",
        promptTemplate: "Select the missing word: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...sentenceReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `The correct word is ${sentenceReviewData.sentence}.`
      },
      {
        stage: 2,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...sentenceReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `Correct completion: ${sentenceReviewData.sentence}.`
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
        subtype: "ls-mc-select-missing-word",
        promptTemplate: "Listen and choose the word you heard.",
        options: heardWordMc.options,
        correctIndex: heardWordMc.correctIndex,
        explanation: phrase.explanation || `The correct word is ${phrase.text}.`
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

  if (gapFill && sentenceReviewData) {
    drafts.push(
      {
        stage: 3,
        type: "listening",
        subtype: "ls-mc-select-missing-word",
        promptTemplate: "Listen and choose the missing word: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...sentenceReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `The correct word completes ${sentenceReviewData.sentence}.`
      },
      {
        stage: 3,
        type: "listening",
        subtype: "ls-fg-gap-fill",
        promptTemplate: "Listen and fill in the blank: {sentence}",
        options: gapFill.options,
        correctIndex: gapFill.correctIndex,
        reviewData: { ...sentenceReviewData, sentence: gapFill.promptSentence },
        explanation: phrase.explanation || `Correct completion: ${sentenceReviewData.sentence}.`
      }
    );
  } else {
    drafts.push({
      stage: 3,
      type: "listening",
      subtype: "ls-mc-select-missing-word",
      promptTemplate: "Listen and choose the word you heard.",
      options: heardWordMc.options,
      correctIndex: heardWordMc.correctIndex,
      explanation: phrase.explanation || `The correct word is ${phrase.text}.`
    });
  }

  return drafts;
}

function pickRepetitionTarget(phrasesPerLesson: number) {
  if (phrasesPerLesson <= 1) return 0;
  return Math.max(1, Math.floor(phrasesPerLesson * 0.35));
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

function blockKey(block: LessonBlock) {
  if (block.type === "text") return `text:${block.content.trim()}`;
  if (block.type === "phrase") return `phrase:${block.refId}:${block.translationIndex ?? 0}`;
  return `${block.type}:${block.refId}`;
}

function normalize(value: string) {
  return String(value || "").trim().toLowerCase();
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
    if (titleKey) {
      titleCounts.set(titleKey, (titleCounts.get(titleKey) || 0) + 1);
    }

    const validation = validateLessonSuggestion(
      {
        title: lesson.title,
        description: lesson.description || "",
        language: input.language,
        level: input.level,
        objectives: Array.isArray(lesson.objectives) ? lesson.objectives : [],
        seedPhrases: Array.isArray(lesson.seedPhrases) ? lesson.seedPhrases : [],
        proverbs: []
      },
      {
        language: input.language,
        level: input.level,
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction,
        themeAnchors: input.themeAnchors
      }
    );

    if (!validation.ok) {
      invalidLessonIndexes.push(index);
      invalidLessons.push({
        index,
        title: String(lesson.title || "").trim(),
        description: String(lesson.description || "").trim(),
        objectives: Array.isArray(lesson.objectives) ? lesson.objectives.map((item) => String(item || "").trim()) : [],
        seedPhrases: Array.isArray(lesson.seedPhrases) ? lesson.seedPhrases.map((item) => String(item || "").trim()) : [],
        focusSummary: String(lesson.focusSummary || "").trim(),
        reasons: validation.reasons,
        validationDetails: validation.details
      });
    }
  });

  for (const [title, count] of titleCounts.entries()) {
    if (count > 1) duplicateTitles.push(title);
  }
  if (duplicateTitles.length > 0) reasons.push("duplicate lesson titles in unit plan");

  for (let left = 0; left < lessons.length; left += 1) {
    const leftSeedSet = new Set(lessons[left].seedPhrases.map(normalize).filter(Boolean));
    for (let right = left + 1; right < lessons.length; right += 1) {
      const rightSeedSet = new Set(lessons[right].seedPhrases.map(normalize).filter(Boolean));
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


export class AdminUnitAiContentUseCases {
  private readonly phraseOrchestrator: AiPhraseOrchestrator;
  private readonly lessonAi: AdminLessonAiUseCases;
  private readonly llm: LlmClient;
  private readonly phraseIntroductions: PhraseIntroductionService;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository,
    private readonly units: UnitRepository,
    llm: LlmClient
  ) {
    this.llm = llm;
    this.phraseOrchestrator = new AiPhraseOrchestrator(this.lessons, this.phrases, llm);
    this.lessonAi = new AdminLessonAiUseCases(this.lessons, this.phrases, this.proverbs, this.units, llm);
    this.phraseIntroductions = new PhraseIntroductionService(this.phrases);
  }

  private async getValidatedUnitPlan(input: {
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

      if (validation.ok) return lessons;

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

    throw new Error("Failed to generate a valid unit plan.");
  }

  private async createPlannedLessons(input: {
    unitId: string;
    language: LessonEntity["language"];
    level: LessonEntity["level"];
    createdBy: string;
    planLessons: LlmUnitPlanLesson[];
  }) {
    const existingLessons = await this.lessons.list({ unitId: input.unitId });
    const existingTitleSet = new Set(existingLessons.map((lesson) => normalize(lesson.title)));
    const created: Array<{ lesson: LessonEntity; plan: LlmUnitPlanLesson }> = [];
    const skipped: { reason: string; title?: string }[] = [];
    const errors: { title?: string; error: string }[] = [];
    let nextOrderIndex = (await this.lessons.findLastOrderIndex(input.unitId)) ?? -1;

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
          orderIndex: nextOrderIndex,
          description: String(planLesson.description || "").trim(),
          topics: planLesson.focusSummary ? [String(planLesson.focusSummary).trim()] : [],
          proverbs: [],
          stages: buildInitialStages(Array.isArray(planLesson.objectives) ? planLesson.objectives : []),
          status: "draft",
          createdBy: input.createdBy
        });
        existingTitleSet.add(titleKey);
        created.push({ lesson, plan: planLesson });
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

  private async refactorExistingLesson(input: {
    lesson: LessonEntity;
    plan: LlmUnitPlanLesson;
    phrasesPerLesson: number;
    proverbsPerLesson: number;
    extraInstructions?: string;
    languagePool: PhraseEntity[];
  }): Promise<LessonGenerationSummary> {
    const targetPhraseCount = clampPhrasesPerLesson(input.phrasesPerLesson);
    const currentLessonPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const currentLessonProverbs = await this.proverbs.findByLessonId(input.lesson.id);
    const missingPhraseCount = Math.max(0, targetPhraseCount - currentLessonPhrases.length);
    const missingProverbCount = Math.max(0, input.proverbsPerLesson - currentLessonProverbs.length);

    const generatedPhrases =
      missingPhraseCount > 0
        ? await this.phraseOrchestrator.generateForLesson({
            lesson: input.lesson,
            seedWords: input.plan.seedPhrases.length > 0 ? input.plan.seedPhrases : input.lesson.topics.length > 0 ? input.lesson.topics : undefined,
            extraInstructions: [
              input.extraInstructions?.trim() || "",
              "This is a non-destructive refactor. Keep existing content and only add missing phrases where they genuinely strengthen the lesson.",
              `Add at most ${missingPhraseCount} phrases to bring the lesson closer to ${targetPhraseCount} phrases total.`,
              input.plan.focusSummary ? `Lesson focus: ${input.plan.focusSummary}` : "",
              input.plan.objectives.length > 0 ? `Lesson objectives: ${input.plan.objectives.join(" | ")}` : "",
              input.plan.seedPhrases.length > 0 ? `Primary seed phrases for this lesson: ${input.plan.seedPhrases.join(" | ")}` : "",
              "Teach the standard form of the target language first.",
              "Do not replace or rename existing phrases."
            ]
              .filter(Boolean)
              .join(" ")
          })
        : [];

    const ensuredProverbs =
      missingProverbCount > 0
        ? await this.lessonAi.generateLessonProverbs({
            lesson: input.lesson,
            count: missingProverbCount,
            extraInstructions: [
              input.extraInstructions?.trim() || "",
              input.plan.focusSummary ? `Lesson focus: ${input.plan.focusSummary}` : "",
              "This is a non-destructive refactor. Keep existing lesson content and only add proverb content when it improves the lesson."
            ]
              .filter(Boolean)
              .join(" ")
          })
        : [];

    const refreshedPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const refreshedProverbs = await this.proverbs.findByLessonId(input.lesson.id);
    const generatedPhraseIdSet = new Set(generatedPhrases.map((item) => item.id));
    const stage1Questions: QuestionEntity[] = [];
    const stage2Questions: QuestionEntity[] = [];
    const stage3Questions: QuestionEntity[] = [];
    const generatedLessonPhrases = refreshedPhrases.filter((item) => generatedPhraseIdSet.has(item.id));

    for (const phrase of generatedLessonPhrases) {
      const alreadyIntroduced = wasPhraseIntroducedBeforeLesson(
        phrase,
        input.lesson.id,
        generatedPhraseIdSet.has(phrase.id)
      );
      const drafts = buildQuestionDrafts(phrase, refreshedPhrases, input.languagePool, alreadyIntroduced);
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
        if (draft.stage === 1) stage1Questions.push(created);
        if (draft.stage === 2) stage2Questions.push(created);
        if (draft.stage === 3) stage3Questions.push(created);
      }
    }

    const nextStages = this.ensureRefactorStages(input.lesson);
    const stageBlockKeys = nextStages.map((stage) => new Set(stage.blocks.map(blockKey)));

    const pushBlock = (stageIndex: number, block: LessonBlock) => {
      const key = blockKey(block);
      if (stageBlockKeys[stageIndex].has(key)) return;
      stageBlockKeys[stageIndex].add(key);
      nextStages[stageIndex].blocks.push(block);
    };

    const description = input.lesson.description.trim();
    if (description) {
      pushBlock(0, { type: "text", content: description });
    }

    for (const phrase of generatedLessonPhrases) {
      const alreadyIntroduced = wasPhraseIntroducedBeforeLesson(
        phrase,
        input.lesson.id,
        generatedPhraseIdSet.has(phrase.id)
      );
      if (!alreadyIntroduced) {
        pushBlock(0, { type: "phrase", refId: phrase.id });
        for (const question of stage1Questions.filter((item) => item.phraseId === phrase.id)) {
          pushBlock(0, { type: "question", refId: question.id });
        }
      }

      if (!alreadyIntroduced) {
        pushBlock(1, { type: "phrase", refId: phrase.id });
      }
      for (const question of stage2Questions.filter((item) => item.phraseId === phrase.id)) {
        pushBlock(1, { type: "question", refId: question.id });
      }

      if (!alreadyIntroduced) {
        pushBlock(2, { type: "phrase", refId: phrase.id });
      }
      for (const question of stage3Questions.filter((item) => item.phraseId === phrase.id)) {
        pushBlock(2, { type: "question", refId: question.id });
      }
    }

    for (const proverb of refreshedProverbs) {
      pushBlock(2, { type: "proverb", refId: proverb.id });
    }

    await this.lessons.updateById(input.lesson.id, {
      stages: nextStages,
      proverbs: refreshedProverbs.map((item) => ({
        text: item.text,
        translation: item.translation,
        contextNote: item.contextNote
      }))
    });
    await this.phraseIntroductions.syncStageOneIntroductions(input.lesson.id, nextStages);

    return {
      lessonId: input.lesson.id,
      title: input.lesson.title,
      phrasesGenerated: generatedPhrases.length,
      repeatedPhrasesLinked: 0,
      proverbsGenerated: ensuredProverbs.length,
      questionsGenerated: stage1Questions.length + stage2Questions.length + stage3Questions.length,
      blocksGenerated:
        generatedPhrases.length * 3 +
        stage1Questions.length +
        stage2Questions.length +
        stage3Questions.length +
        ensuredProverbs.length
    };
  }

  private async populateGeneratedLessonFromPlan(input: {
    lesson: LessonEntity;
    plan: LlmUnitPlanLesson;
    phrasesPerLesson: number;
    proverbsPerLesson: number;
    extraInstructions?: string;
    languagePool: PhraseEntity[];
    repetitionPool: PhraseEntity[];
  }): Promise<LessonGenerationSummary> {
    const targetNewPhrases = clampPhrasesPerLesson(input.phrasesPerLesson);
    const phrases = await this.phraseOrchestrator.generateForLesson({
      lesson: input.lesson,
      seedWords:
        input.plan.seedPhrases.length > 0
          ? input.plan.seedPhrases
          : input.lesson.topics.length > 0
            ? input.lesson.topics
            : undefined,
      extraInstructions: [
        input.extraInstructions ? input.extraInstructions.trim() : "",
        "Generate practical conversational phrases learners can use in real life.",
        "Teach for retention, not coverage.",
        "Prioritize high-frequency greetings, introductions, politeness, simple questions, short responses, and daily-need vocabulary.",
        `Generate at most ${targetNewPhrases} new phrases for this lesson.`,
        `Do not introduce more than ${LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE} new phrases per stage.`,
        "Recycle and repeat phrases across stages for retention.",
        "If the lesson is beginner, prefer single words and short chunks over full sentences.",
        input.plan.focusSummary ? `Lesson focus: ${input.plan.focusSummary}` : "",
        input.plan.objectives.length > 0 ? `Lesson objectives: ${input.plan.objectives.join(" | ")}` : "",
        input.plan.seedPhrases.length > 0 ? `Primary seed phrases for this lesson: ${input.plan.seedPhrases.join(" | ")}` : "",
        "Teach the standard form of the target language first."
      ]
        .filter(Boolean)
        .join(" ")
    });

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

    let repeatedPhrasesLinked = 0;
    const targetRepetition = pickRepetitionTarget(targetNewPhrases);
    if (targetRepetition > 0 && input.repetitionPool.length > 0) {
      const currentLessonPhrases = await this.phrases.findByLessonId(input.lesson.id);
      const currentLessonPhraseIds = new Set(currentLessonPhrases.map((item) => item.id));

      const repetitionCandidates = input.repetitionPool
        .filter((item) => !currentLessonPhraseIds.has(item.id))
        .sort((a, b) => a.difficulty - b.difficulty)
        .slice(0, targetRepetition);

      for (const phrase of repetitionCandidates) {
        const nextLessonIds = Array.from(new Set([...phrase.lessonIds, input.lesson.id]));
        const updated = await this.phrases.updateById(phrase.id, { lessonIds: nextLessonIds });
        if (updated) {
          repeatedPhrasesLinked += 1;
          currentLessonPhraseIds.add(updated.id);
        }
      }
    }

    const lessonPhrases = await this.phrases.findByLessonId(input.lesson.id);
    const generatedPhraseIdSet = new Set(phrases.map((item) => item.id));
    const newToLesson = lessonPhrases.filter(
      (item) => !wasPhraseIntroducedBeforeLesson(item, input.lesson.id, generatedPhraseIdSet.has(item.id))
    );
    const recycled = lessonPhrases.filter((item) =>
      wasPhraseIntroducedBeforeLesson(item, input.lesson.id, generatedPhraseIdSet.has(item.id))
    );
    const generatedFirst = newToLesson.filter((item) => generatedPhraseIdSet.has(item.id));
    const focusedLessonPhrases = [...newToLesson, ...recycled].slice(
      0,
      LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON
    );

    for (const phrase of lessonPhrases) {
      if (!input.repetitionPool.some((item) => item.id === phrase.id)) {
        input.repetitionPool.push(phrase);
      }
    }

    const stage1PhraseSet = new Set(
      generatedFirst
        .slice(0, LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE)
        .map((item) => item.id)
    );
    const stage2PhraseSet = new Set(
      [
        ...focusedLessonPhrases
          .slice(0, Math.min(2, focusedLessonPhrases.length))
          .map((item) => item.id),
        ...focusedLessonPhrases
          .slice(LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE)
          .slice(0, LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE - Math.min(2, focusedLessonPhrases.length))
          .map((item) => item.id)
      ].slice(0, LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE)
    );
    const stage3PhraseSet = new Set(
      [
        ...focusedLessonPhrases
          .slice(0, Math.min(2, focusedLessonPhrases.length))
          .map((item) => item.id),
        ...focusedLessonPhrases
          .slice(LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE)
          .slice(0, LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE - Math.min(2, focusedLessonPhrases.length))
          .map((item) => item.id)
      ].slice(0, LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE)
    );

    const stage1Questions: QuestionEntity[] = [];
    const stage2Questions: QuestionEntity[] = [];
    const stage3Questions: QuestionEntity[] = [];
    const createdQuestions: QuestionEntity[] = [];

    for (const phrase of focusedLessonPhrases) {
      const isPreviouslyIntroduced = wasPhraseIntroducedBeforeLesson(
        phrase,
        input.lesson.id,
        generatedPhraseIdSet.has(phrase.id)
      );
      const drafts = buildQuestionDrafts(phrase, focusedLessonPhrases, input.languagePool, isPreviouslyIntroduced);
      for (const draft of drafts) {
        const stageTarget =
          draft.stage === 1
            ? stage1PhraseSet
            : draft.stage === 2
              ? stage2PhraseSet
              : stage3PhraseSet;
        if (!stageTarget.has(phrase.id)) continue;
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
        createdQuestions.push(created);
        if (draft.stage === 1) stage1Questions.push(created);
        if (draft.stage === 2) stage2Questions.push(created);
        if (draft.stage === 3) stage3Questions.push(created);
      }
    }

    const updatedProverbs = ensuredProverbs.map((item) => ({
      text: item.text,
      translation: item.translation,
      contextNote: item.contextNote
    }));
    const nextStages = this.ensureRefactorStages(input.lesson);
    const stage1Blocks: LessonBlock[] = [];
    if (input.lesson.description.trim()) stage1Blocks.push({ type: "text", content: input.lesson.description.trim() });
    for (const phrase of focusedLessonPhrases.filter((item) => stage1PhraseSet.has(item.id))) {
      stage1Blocks.push({ type: "phrase", refId: phrase.id });
      for (const question of stage1Questions.filter((q) => q.phraseId === phrase.id)) {
        stage1Blocks.push({ type: "question", refId: question.id });
      }
    }

    const stage2Blocks: LessonBlock[] = [];
    for (const phrase of focusedLessonPhrases.filter((item) => stage2PhraseSet.has(item.id))) {
      if (!wasPhraseIntroducedBeforeLesson(phrase, input.lesson.id, generatedPhraseIdSet.has(phrase.id))) {
        stage2Blocks.push({ type: "phrase", refId: phrase.id });
      }
      for (const question of stage2Questions.filter((q) => q.phraseId === phrase.id)) {
        stage2Blocks.push({ type: "question", refId: question.id });
      }
    }

    const stage3Blocks: LessonBlock[] = [];
    for (const phrase of focusedLessonPhrases.filter((item) => stage3PhraseSet.has(item.id))) {
      if (!wasPhraseIntroducedBeforeLesson(phrase, input.lesson.id, generatedPhraseIdSet.has(phrase.id))) {
        stage3Blocks.push({ type: "phrase", refId: phrase.id });
      }
      for (const question of stage3Questions.filter((q) => q.phraseId === phrase.id)) {
        stage3Blocks.push({ type: "question", refId: question.id });
      }
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
    await this.phraseIntroductions.syncStageOneIntroductions(
      input.lesson.id,
      nextStages.filter((stage) => stage.blocks.length > 0)
    );

    return {
      lessonId: input.lesson.id,
      title: input.lesson.title,
      phrasesGenerated: focusedLessonPhrases.length,
      repeatedPhrasesLinked,
      proverbsGenerated: ensuredProverbs.length,
      questionsGenerated: createdQuestions.length,
      blocksGenerated:
        stage1Questions.length + stage2Questions.length + stage3Questions.length + focusedLessonPhrases.length
    };
  }

  async generate(input: GenerateUnitAiContentInput) {
    const unit = await this.units.findById(input.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }

    const existingLessonsInUnit = (await this.lessons.list({ unitId: input.unitId }))
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex);
    const existingLessonIdsInUnit = existingLessonsInUnit.map((lesson) => lesson.id);
    const existingUnitPhrases = existingLessonIdsInUnit.length
      ? await this.phrases.list({ lessonIds: existingLessonIdsInUnit })
      : [];
    const existingUnitProverbs = existingLessonIdsInUnit.length
      ? (await Promise.all(existingLessonIdsInUnit.map((lessonId) => this.proverbs.findByLessonId(lessonId)))).flat()
      : [];
    const planLessons = await this.getValidatedUnitPlan({
      language: input.language,
      level: input.level,
      lessonCount: input.lessonCount,
      unitTitle: unit.title,
      unitDescription: unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: input.lessonGenerationInstruction,
      extraInstructions: input.extraInstructions,
      existingUnitTitles: (await this.units.listByLanguage(input.language)).map((item) => item.title).filter(Boolean),
      existingLessonTitles: existingLessonsInUnit.map((item) => item.title).filter(Boolean),
      existingPhraseTexts: existingUnitPhrases.map((item) => item.text).filter(Boolean),
      existingProverbTexts: existingUnitProverbs.map((item) => item.text).filter(Boolean),
      existingLessonsSummary: buildExistingLessonSummary(existingLessonsInUnit)
    });
    const lessonResult = await this.createPlannedLessons({
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      createdBy: input.createdBy,
      planLessons
    });

    const languagePool = await this.phrases.list({ language: input.language });
    const repetitionPool: PhraseEntity[] = [...existingUnitPhrases];
    const lessonSummaries: LessonGenerationSummary[] = [];
    const errors: Array<{ lessonId?: string; title?: string; error: string }> = [];

    for (const item of lessonResult.created) {
      try {
        const summary = await this.populateGeneratedLessonFromPlan({
          lesson: item.lesson,
          plan: item.plan,
          phrasesPerLesson: input.phrasesPerLesson,
          proverbsPerLesson: input.proverbsPerLesson,
          extraInstructions: input.extraInstructions,
          languagePool,
          repetitionPool
        });
        lessonSummaries.push(summary);
      } catch (error) {
        errors.push({
          lessonId: item.lesson.id,
          title: item.lesson.title,
          error: error instanceof Error ? error.message : "Failed to generate lesson content."
        });
      }
    }

    return {
      unitId: input.unitId,
      requestedLessons: input.lessonCount,
      createdLessons: lessonResult.created.length,
      skippedLessons: lessonResult.skipped,
      lessonGenerationErrors: lessonResult.errors,
      contentErrors: errors,
      lessons: lessonSummaries
    };
  }

  async revise(input: GenerateUnitAiContentInput & { mode: "refactor" | "regenerate" }) {
    const unit = await this.units.findById(input.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }

    const existingLessonsInUnit = (await this.lessons.list({ unitId: input.unitId }))
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex);
    const existingSummary = buildExistingLessonSummary(existingLessonsInUnit);
    if (input.mode === "regenerate") {
      for (const lesson of existingLessonsInUnit) {
        await this.lessons.softDeleteById(lesson.id);
        const now = new Date();
        await this.phrases.softDeleteByLessonId(lesson.id, now);
        await this.proverbs.softDeleteByLessonId(lesson.id, now);
        await this.questions.softDeleteByLessonId(lesson.id, now);
      }
      await this.lessons.compactOrderIndexesByUnit(input.unitId);

      const result = await this.generate({
        ...input,
        lessonGenerationInstruction: [
          [
            "Regenerate the unit from scratch while staying within the same unit theme and level.",
            "Do not repeat weak lesson breakdowns or weak titles from the previous draft unless they are clearly the best fit.",
            existingSummary ? `Previous unit draft summary to avoid shallow repetition:\n${existingSummary}` : ""
          ].join("\n"),
          input.lessonGenerationInstruction,
          input.extraInstructions
        ]
          .filter(Boolean)
          .join("\n\n"),
        extraInstructions: input.extraInstructions
      });

      return {
        ...result,
        revisionMode: input.mode,
        updatedLessons: 0,
        clearedLessons: existingLessonsInUnit.length
      };
    }

    const languagePool = await this.phrases.list({ language: input.language });
    const existingLessonIdsInUnit = existingLessonsInUnit.map((lesson) => lesson.id);
    const existingUnitPhrases = existingLessonIdsInUnit.length
      ? await this.phrases.list({ lessonIds: existingLessonIdsInUnit })
      : [];
    const existingUnitProverbs = existingLessonIdsInUnit.length
      ? (await Promise.all(existingLessonIdsInUnit.map((lessonId) => this.proverbs.findByLessonId(lessonId)))).flat()
      : [];
    const desiredLessonCount = Math.max(existingLessonsInUnit.length, input.lessonCount);
    const planLessons = await this.getValidatedUnitPlan({
      language: input.language,
      level: input.level,
      lessonCount: desiredLessonCount,
      unitTitle: unit.title,
      unitDescription: unit.description,
      topic: Array.isArray(input.topics) && input.topics.length > 0 ? input.topics.join(", ") : undefined,
      curriculumInstruction: input.lessonGenerationInstruction,
      extraInstructions: [
        input.extraInstructions?.trim() || "",
        "This is a non-destructive unit refactor.",
        "Preserve existing lessons and distribute the requested coverage across the lesson sequence."
      ]
        .filter(Boolean)
        .join(" "),
      existingUnitTitles: (await this.units.listByLanguage(input.language)).map((item) => item.title).filter(Boolean),
      existingLessonTitles: existingLessonsInUnit.map((item) => item.title).filter(Boolean),
      existingPhraseTexts: existingUnitPhrases.map((item) => item.text).filter(Boolean),
      existingProverbTexts: existingUnitProverbs.map((item) => item.text).filter(Boolean),
      existingLessonsSummary: existingSummary
    });
    const lessonSummaries: LessonGenerationSummary[] = [];
    const contentErrors: Array<{ lessonId?: string; title?: string; error: string }> = [];
    const repetitionPool: PhraseEntity[] = [...existingUnitPhrases];

    for (const [index, lesson] of existingLessonsInUnit.entries()) {
      const plan = planLessons[index];
      if (!plan) continue;
      try {
        const summary = await this.refactorExistingLesson({
          lesson,
          plan,
          phrasesPerLesson: input.phrasesPerLesson,
          proverbsPerLesson: input.proverbsPerLesson,
          extraInstructions: [
            input.extraInstructions?.trim() || "",
            "This is a non-destructive unit refactor.",
            "Preserve existing lessons, phrases, and blocks. Only add missing content and strengthen stage flow."
          ]
            .filter(Boolean)
            .join(" "),
          languagePool
        });
        lessonSummaries.push(summary);
        const refreshedLessonPhrases = await this.phrases.findByLessonId(lesson.id);
        for (const phrase of refreshedLessonPhrases) {
          if (!repetitionPool.some((item) => item.id === phrase.id)) {
            repetitionPool.push(phrase);
          }
        }
      } catch (error) {
        contentErrors.push({
          lessonId: lesson.id,
          title: lesson.title,
          error: error instanceof Error ? error.message : "Failed to refactor lesson content."
        });
      }
    }
    const updatedLessonCount = lessonSummaries.length;

    const newPlanLessons = planLessons.slice(existingLessonsInUnit.length);
    const createdResult =
      newPlanLessons.length > 0
        ? await this.createPlannedLessons({
            unitId: input.unitId,
            language: input.language,
            level: input.level,
            createdBy: input.createdBy,
            planLessons: newPlanLessons
          })
        : {
            created: [],
            skipped: [],
            errors: []
          };

    for (const item of createdResult.created) {
      try {
        const summary = await this.populateGeneratedLessonFromPlan({
          lesson: item.lesson,
          plan: item.plan,
          phrasesPerLesson: input.phrasesPerLesson,
          proverbsPerLesson: input.proverbsPerLesson,
          extraInstructions: [
            input.extraInstructions?.trim() || "",
            "This is a non-destructive refactor. Keep existing content intact and only add genuinely missing content."
          ]
            .filter(Boolean)
            .join(" "),
          languagePool,
          repetitionPool
        });
        lessonSummaries.push(summary);
      } catch (error) {
        contentErrors.push({
          lessonId: item.lesson.id,
          title: item.lesson.title,
          error: error instanceof Error ? error.message : "Failed to generate lesson content."
        });
      }
    }

    return {
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
  }
}
