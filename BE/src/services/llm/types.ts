import type { GlossRequest, GlossResult } from "./componentGloss.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";
import type { ToneReviewVerdict } from "./linguisticReview.js";

export type LlmPhraseExample = {
  original: string;
  translation: string;
};

export type LlmGeneratedPhrase = {
  text: string;
  translations: string[];
  pronunciation?: string;
  explanation?: string;
  examples?: LlmPhraseExample[];
  difficulty?: number;
};

export type LlmGeneratedWord = {
  text: string;
  translations: string[];
  lemma?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  explanation?: string;
  examples?: LlmPhraseExample[];
  difficulty?: number;
};

export type LlmGeneratedSentenceComponent = {
  type: "word" | "expression";
  text: string;
  translations: string[];
  fixed?: boolean;
  role?: "core" | "support";
};

export type LlmGeneratedSentenceMeaningSegment = {
  text: string;
  componentIndexes: number[];
};

export type LlmGeneratedSentence = {
  text: string;
  translations: string[];
  literalTranslation?: string;
  usageNotes?: string;
  explanation?: string;
  components: LlmGeneratedSentenceComponent[];
  meaningSegments?: LlmGeneratedSentenceMeaningSegment[];
};

export type LlmGeneratedContextScenarioQuestion = {
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

export type LlmGeneratedChapter = {
  title: string;
  description: string;
};

export type LlmLessonSuggestion = {
  title: string;
  description?: string;
  language: Language;
  level: Level;
  objectives: string[];
  seedExpressions: string[];
  proverbs?: Array<string | { text: string; translation?: string; contextNote?: string }>;
};

export type LlmGeneratedProverb = {
  text: string;
  translation: string;
  contextNote?: string;
};

export type LlmUnitPlanTarget = {
  text: string;
  translations?: string[];
};

export type LlmUnitPlanLesson = {
  title: string;
  description?: string;
  objectives: string[];
  conversationGoal: string;
  situations: string[];
  sentenceGoals: string[];
  focusSummary?: string;
  targetWords?: LlmUnitPlanTarget[];
  targetExpressions?: LlmUnitPlanTarget[];
  /**
   * How many sentences this lesson should generate, overriding the unit's setting.
   *
   * Absent means "use the unit's value", which keeps every existing plan behaving as before:
   * a target of 2, topped up by borrowing from the database, and a floor of 2 below which the
   * lesson fails. 0 is the exception a first lesson needs -- it isolates one new item
   * (`Ẹ káàárọ̀` is a greeting, not a sentence) and has no second item to combine it with.
   */
  sentences?: number;
};

export type LlmLessonRefactorOperation =
  | {
      type: "add_text_block";
      stageIndex: number;
      blockIndex?: number;
      content: string;
    }
  | {
      type: "move_block";
      fromStageIndex: number;
      fromBlockIndex: number;
      toStageIndex: number;
      toBlockIndex?: number;
    }
  | {
      type: "remove_block";
      stageIndex: number;
      blockIndex: number;
    }
  | {
      type: "add_word_bundle";
      wordText: string;
      translations?: string[];
      explanation?: string;
      pronunciation?: string;
    }
  | {
      type: "add_expression_bundle";
      expressionText: string;
      translations?: string[];
      explanation?: string;
      pronunciation?: string;
    }
  | {
      type: "add_sentence_bundle";
      sentenceText: string;
      translations: string[];
      literalTranslation?: string;
      usageNotes?: string;
      explanation?: string;
      components: LlmGeneratedSentenceComponent[];
    }
  | {
      type: "replace_word_bundle";
      oldWordText: string;
      newWordText: string;
      translations?: string[];
      explanation?: string;
      pronunciation?: string;
    }
  | {
      type: "replace_expression_bundle";
      oldExpressionText: string;
      newExpressionText: string;
      translations?: string[];
      explanation?: string;
      pronunciation?: string;
    }
  | {
      type: "replace_sentence_bundle";
      oldSentenceText: string;
      newSentenceText: string;
      translations: string[];
      literalTranslation?: string;
      usageNotes?: string;
      explanation?: string;
      components: LlmGeneratedSentenceComponent[];
    }
  | {
      type: "remove_word_bundle";
      wordText: string;
    }
  | {
      type: "remove_expression_bundle";
      expressionText: string;
    }
  | {
      type: "remove_sentence_bundle";
      sentenceText: string;
    }
  | {
      type: "add_match_translation_block";
      stageIndex: number;
      expressionTexts?: string[];
    };

export type LlmLessonRefactorPatch = {
  lessonId: string;
  lessonTitle?: string;
  rationale?: string;
  operations: LlmLessonRefactorOperation[];
};

export type LlmUnitRefactorPlan = {
  lessonPatches: LlmLessonRefactorPatch[];
  newLessons?: LlmUnitPlanLesson[];
};

export type GeneratePhrasesInput = {
  lessonId?: string;
  language: Language;
  level: Level;
  lessonTitle?: string;
  lessonDescription?: string;
  seedWords?: string[];
  extraInstructions?: string;
  existingPhrases?: string[];
};

export type GenerateExpressionsInput = GeneratePhrasesInput;

export type GenerateWordsInput = {
  lessonId?: string;
  language: Language;
  level: Level;
  lessonTitle?: string;
  lessonDescription?: string;
  seedWords?: string[];
  extraInstructions?: string;
  existingWords?: string[];
};

export type GenerateSentencesInput = {
  lessonId?: string;
  language: Language;
  level: Level;
  lessonTitle?: string;
  lessonDescription?: string;
  conversationGoal?: string;
  situations?: string[];
  sentenceGoals?: string[];
  anchorSentences?: Array<{ text: string; translations: string[] }>;
  allowedExpressions?: Array<{ text: string; translations: string[] }>;
  allowedWords?: Array<{ text: string; translations: string[] }>;
  maxSentences?: number;
  allowDerivedComponents?: boolean;
  extraInstructions?: string;
  existingSentences?: string[];
};

export type GenerateContextScenarioQuestionInput = {
  language: Language;
  level: Level;
  lessonTitle?: string;
  lessonDescription?: string;
  conversationGoal?: string;
  target: {
    type: "word" | "expression";
    text: string;
    translations: string[];
    explanation?: string;
  };
  candidateOptions: Array<{
    text: string;
    translations: string[];
    explanation?: string;
  }>;
};

export type GenerateChaptersInput = {
  language: Language;
  level: Level;
  count: number;
  topic?: string;
  extraInstructions?: string;
  existingChapterTitles?: string[];
};

export type EnhancePhraseInput = {
  text: string;
  translations: string[];
  language: Language;
  level: Level;
};

export type EnhanceExpressionInput = EnhancePhraseInput;

export type LlmClient = {
  /**
   * The model that actually handles sentence work, which is not always `modelName`.
   * `generateSentences` and `generateProverbs` can be routed to a different, stronger model
   * than the bulk tasks; without this the composed client still reports the BULK model, and
   * every sentence gets stamped with a model that never saw it.
   *
   * Undefined when nothing is routed away, in which case `modelName` is the truth.
   */
  sentenceModelName?: string;
  /**
   * The model that actually writes teaching metadata -- `enhanceExpression` and
   * `enhancePhrase` -- when it is routed away from the bulk model. Same reason
   * `sentenceModelName` exists: without it the composed client reports the bulk model for
   * prose it never wrote.
   *
   * Undefined when nothing is routed away, in which case `modelName` is the truth.
   */
  explanationModelName?: string;
  /**
   * Per-word meanings for components whose meaning segment covers several words at once, so
   * no per-word meaning can be derived from it. English only -- see componentGloss.ts.
   * Returns [] rather than throwing when the reply fails validation: a sentence with empty
   * glosses falls back to the dictionary entry, which is honest, whereas failing the call
   * would abort a lesson over a presentation detail.
   *
   * Optional, like reviewTonation: a provider that does not implement it simply leaves the
   * glosses empty, and the panel shows the dictionary entry. Callers must feature-check.
   */
  glossComponents?: (input: GlossRequest) => Promise<GlossResult[]>;
  generateWords: (input: GenerateWordsInput) => Promise<LlmGeneratedWord[]>;
  generateExpressions: (input: GenerateExpressionsInput) => Promise<LlmGeneratedPhrase[]>;
  generatePhrases: (input: GeneratePhrasesInput) => Promise<LlmGeneratedPhrase[]>;
  generateSentences: (input: GenerateSentencesInput) => Promise<LlmGeneratedSentence[]>;
  generateContextScenarioQuestion: (
    input: GenerateContextScenarioQuestionInput
  ) => Promise<LlmGeneratedContextScenarioQuestion | null>;
  generateChapters: (input: GenerateChaptersInput) => Promise<LlmGeneratedChapter[]>;
  generateProverbs: (input: {
    language: Language;
    level: Level;
    lessonTitle?: string;
    lessonDescription?: string;
    count?: number;
    extraInstructions?: string;
    existingProverbs?: string[];
  }) => Promise<LlmGeneratedProverb[]>;
  enhanceExpression: (input: EnhanceExpressionInput) => Promise<Partial<LlmGeneratedPhrase>>;
  enhancePhrase: (input: EnhancePhraseInput) => Promise<Partial<LlmGeneratedPhrase>>;
  suggestLesson: (input: {
    language: string;
    level: string;
    topic?: string;
    unitTitle?: string;
    unitDescription?: string;
    curriculumInstruction?: string;
    themeAnchors?: string[];
    existingUnitTitles?: string[];
    existingLessonTitles?: string[];
    existingPhraseTexts?: string[];
    existingProverbTexts?: string[];
  }) => Promise<LlmLessonSuggestion>;
  planUnitLessons: (input: {
    language: string;
    level: string;
    lessonCount: number;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    extraInstructions?: string;
    reviewMode?: boolean;
    reviewInventorySummary?: string;
    themeAnchors?: string[];
    existingUnitTitles?: string[];
    existingLessonTitles?: string[];
    existingPhraseTexts?: string[];
    existingProverbTexts?: string[];
    existingLessonsSummary?: string;
  }) => Promise<LlmUnitPlanLesson[]>;
  planUnitRefactor: (input: {
    language: string;
    level: string;
    lessonCount: number;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    extraInstructions?: string;
    themeAnchors?: string[];
    existingLessonsSnapshot: string;
    existingLessonTitles?: string[];
  }) => Promise<LlmUnitRefactorPlan>;
  modelName: string;
  /**
   * Second-opinion review of already-generated sentences. Optional: present only when a
   * reviewer model is configured (LLM_REVIEW_MODEL). Must be backed by a DIFFERENT model
   * than the one that generated the content -- see services/llm/linguisticReview.ts.
   */
  /**
   * Diacritics-only review of generated sentences. Optional: present only when a reviewer
   * model is configured (LLM_REVIEW_MODEL), and it must be a DIFFERENT model than the one
   * that generated the content. See services/llm/linguisticReview.ts.
   */
  reviewTonation?: (input: {
    language: string;
    sentences: Array<{ text: string; translations: string[] }>;
  }) => Promise<ToneReviewVerdict[]>;
};
