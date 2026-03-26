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
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  objectives: string[];
  seedExpressions: string[];
  proverbs?: Array<string | { text: string; translation?: string; contextNote?: string }>;
};

export type LlmGeneratedProverb = {
  text: string;
  translation: string;
  contextNote?: string;
};

export type LlmUnitPlanLesson = {
  title: string;
  description?: string;
  objectives: string[];
  conversationGoal: string;
  situations: string[];
  sentenceGoals: string[];
  focusSummary?: string;
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
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  lessonTitle?: string;
  lessonDescription?: string;
  seedWords?: string[];
  extraInstructions?: string;
  existingPhrases?: string[];
};

export type GenerateExpressionsInput = GeneratePhrasesInput;

export type GenerateWordsInput = {
  lessonId?: string;
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  lessonTitle?: string;
  lessonDescription?: string;
  seedWords?: string[];
  extraInstructions?: string;
  existingWords?: string[];
};

export type GenerateSentencesInput = {
  lessonId?: string;
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  lessonTitle?: string;
  lessonDescription?: string;
  conversationGoal?: string;
  situations?: string[];
  sentenceGoals?: string[];
  allowedExpressions?: Array<{ text: string; translations: string[] }>;
  allowedWords?: Array<{ text: string; translations: string[] }>;
  maxSentences?: number;
  allowDerivedComponents?: boolean;
  extraInstructions?: string;
  existingSentences?: string[];
};

export type GenerateContextScenarioQuestionInput = {
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
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
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  count: number;
  topic?: string;
  extraInstructions?: string;
  existingChapterTitles?: string[];
};

export type EnhancePhraseInput = {
  text: string;
  translations: string[];
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
};

export type EnhanceExpressionInput = EnhancePhraseInput;

export type LlmClient = {
  generateWords: (input: GenerateWordsInput) => Promise<LlmGeneratedWord[]>;
  generateExpressions: (input: GenerateExpressionsInput) => Promise<LlmGeneratedPhrase[]>;
  generatePhrases: (input: GeneratePhrasesInput) => Promise<LlmGeneratedPhrase[]>;
  generateSentences: (input: GenerateSentencesInput) => Promise<LlmGeneratedSentence[]>;
  generateContextScenarioQuestion: (
    input: GenerateContextScenarioQuestionInput
  ) => Promise<LlmGeneratedContextScenarioQuestion | null>;
  generateChapters: (input: GenerateChaptersInput) => Promise<LlmGeneratedChapter[]>;
  generateProverbs: (input: {
    language: "yoruba" | "igbo" | "hausa";
    level: "beginner" | "intermediate" | "advanced";
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
};
