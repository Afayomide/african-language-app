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

export type LlmLessonSuggestion = {
  title: string;
  description?: string;
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  objectives: string[];
  seedPhrases: string[];
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
  seedPhrases: string[];
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
      type: "add_phrase_bundle";
      phraseText: string;
      translations?: string[];
      explanation?: string;
      pronunciation?: string;
    }
  | {
      type: "replace_phrase_bundle";
      oldPhraseText: string;
      newPhraseText: string;
      translations?: string[];
      explanation?: string;
      pronunciation?: string;
    }
  | {
      type: "remove_phrase_bundle";
      phraseText: string;
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

export type EnhancePhraseInput = {
  text: string;
  translations: string[];
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
};

export type LlmClient = {
  generatePhrases: (input: GeneratePhrasesInput) => Promise<LlmGeneratedPhrase[]>;
  generateProverbs: (input: {
    language: "yoruba" | "igbo" | "hausa";
    level: "beginner" | "intermediate" | "advanced";
    lessonTitle?: string;
    lessonDescription?: string;
    count?: number;
    extraInstructions?: string;
    existingProverbs?: string[];
  }) => Promise<LlmGeneratedProverb[]>;
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
