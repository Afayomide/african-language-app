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
};

export type GeneratePhrasesInput = {
  lessonId: string;
  language: "yoruba" | "igbo" | "hausa";
  level: "beginner" | "intermediate" | "advanced";
  lessonTitle?: string;
  lessonDescription?: string;
  seedWords?: string[];
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
  enhancePhrase: (input: EnhancePhraseInput) => Promise<Partial<LlmGeneratedPhrase>>;
  suggestLesson: (input: { language: string; level: string; topic?: string }) => Promise<LlmLessonSuggestion>;
  modelName: string;
};
