export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";

export type LearnerAuthUser = {
  id: string;
  email: string;
  role: "learner";
  roles?: Array<"admin" | "learner" | "tutor" | "voice_artist">;
};

export type LearnerProfile = {
  id: string;
  userId: string;
  displayName: string;
  proficientLanguage: string;
  countryOfOrigin: string;
  onboardingCompleted: boolean;
  currentLanguage: Language;
  dailyGoalMinutes: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  completedLessonsCount: number;
};

export type LessonBlock = 
  | { type: "text"; content: string }
  | { type: "phrase"; refId: string; translationIndex?: number }
  | { type: "proverb"; refId: string }
  | { type: "question"; refId: string };

export type LessonStage = {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  blocks: LessonBlock[];
};

export type LessonStageProgress = {
  stageId: string;
  stageIndex: number;
  status: "not_started" | "in_progress" | "completed";
  completedAt?: string | Date;
};

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

export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening" | "matching";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-missing-word"
  | "fg-word-order"
  | "fg-gap-fill"
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  | "mt-match-image"
  | "mt-match-translation"
  | "ls-dictation"
  | "ls-tone-recognition";

export interface QuestionMatchingPair {
  pairId: string;
  phraseId: string;
  phraseText: string;
  translationIndex: number;
  translation: string;
  image?: {
    imageAssetId?: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
}

export interface QuestionMatchingDisplayItem {
  id: string;
  label: string;
  phraseId?: string;
  translationIndex?: number;
  image?: {
    imageAssetId?: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
}

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
    sentence?: string;
    words?: string[];
    correctOrder?: number[];
    meaning?: string;
    matchingPairs?: QuestionMatchingPair[];
    leftItems?: QuestionMatchingDisplayItem[];
    rightItems?: QuestionMatchingDisplayItem[];
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
  stages: LessonStage[];
  status: Status;
  progressPercent?: number;
  currentStageIndex?: number;
  stageProgress?: LessonStageProgress[];
}
