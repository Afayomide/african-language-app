export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";

export type LessonBlock = 
  | { type: "text"; content: string }
  | { type: "phrase"; refId: string; translationIndex?: number }
  | { type: "proverb"; refId: string }
  | { type: "question"; refId: string };

export type PopulatedLessonBlock = 
  | { type: "text"; content: string }
  | { type: "phrase"; data: Phrase }
  | { type: "proverb"; data: Proverb }
  | { type: "question"; data: ExerciseQuestion };

export interface Phrase {
  _id: string;
  text: string;
  translations: string[];
  selectedTranslation?: string;
  selectedTranslationIndex?: number;
  pronunciation?: string;
  explanation?: string;
  audio?: {
    url?: string;
  };
}

export interface Proverb {
  _id: string;
  text: string;
  translation: string;
  contextNote?: string;
}

export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-missing-word"
  | "fg-word-order"
  | "fg-gap-fill"
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  | "ls-dictation"
  | "ls-tone-recognition";

export interface ExerciseQuestion {
  _id: string;
  lessonId: string;
  translationIndex?: number;
  phraseId: string | Phrase;
  type: QuestionType;
  subtype: QuestionSubtype;
  promptTemplate: string;
  text: string;
  options: string[];
  correctIndex: number;
  reviewData?: {
    sentence: string;
    words: string[];
    correctOrder: number[];
    meaning: string;
  };
  interactionData?: {
    sentence: string;
    words: string[];
    correctOrder: number[];
    meaning: string;
  };
  prompt?: string;
  phrase?: Phrase | null;
  explanation: string;
}

export interface Lesson {
  _id: string;
  title: string;
  language: Language;
  level: Level;
  description: string;
  topics: string[];
  proverbs: Array<{ text: string; translation: string; contextNote: string }>;
  blocks: LessonBlock[];
  status: Status;
}
