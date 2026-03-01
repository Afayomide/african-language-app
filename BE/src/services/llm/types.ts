export type LlmPhraseExample = {
  original: string;
  translation: string;
};

export type LlmGeneratedPhrase = {
  text: string;
  translation: string;
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
  translation: string;
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
  suggestLesson: (input: { language: string; level: string; topic?: string }) => Promise<LlmLessonSuggestion>;
  modelName: string;
};
