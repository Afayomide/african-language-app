export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";

export type LessonStageProgress = {
  stageId: string;
  stageIndex: number;
  status: "not_started" | "in_progress" | "completed";
  completedAt?: string | Date;
};

export type LessonStage = {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  blocks: Array<
    | { type: "text"; content: string }
    | { type: "content"; contentType: "word" | "expression" | "sentence"; refId: string; translationIndex?: number }
    | { type: "proverb"; refId: string }
    | { type: "question"; refId: string }
  >;
};

export type Lesson = {
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
};

export interface LearningContentComponent {
  id: string;
  kind: "word" | "expression";
  text: string;
  translations: string[];
  selectedTranslation: string;
  selectedTranslationIndex: number;
  pronunciation?: string;
  explanation?: string;
  audio?: {
    url?: string;
  };
}

export interface LearningContent {
  id?: string;
  _id: string;
  kind?: "word" | "expression" | "sentence";
  text: string;
  translations: string[];
  selectedTranslation?: string;
  selectedTranslationIndex?: number;
  pronunciation?: string;
  explanation?: string;
  audio?: {
    url?: string;
  };
  components?: LearningContentComponent[];
}

export interface Proverb {
  _id: string;
  text: string;
  translation: string;
  contextNote?: string;
}

export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening" | "matching" | "speaking";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-context-response"
  | "mc-select-missing-word"
  | "fg-word-order"
  | "fg-letter-order"
  | "fg-gap-fill"
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  | "mt-match-image"
  | "mt-match-translation"
  | "ls-dictation"
  | "ls-tone-recognition"
  | "sp-pronunciation-compare";

export interface QuestionMatchingPair {
  pairId: string;
  translationIndex: number;
  translation: string;
  contentType?: "word" | "expression" | "sentence";
  contentId?: string;
  contentText?: string;
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
  sourceType?: "word" | "expression" | "sentence";
  sourceId?: string;
  relatedSourceRefs?: Array<{ type: "word" | "expression" | "sentence"; id: string }>;
  translationIndex?: number;
  type: QuestionType;
  subtype: QuestionSubtype;
  promptTemplate: string;
  text?: string;
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
  source?: LearningContent | null;
  explanation: string;
}

export type PopulatedLessonBlock =
  | { type: "text"; content: string }
  | { type: "content"; contentType: "word" | "expression" | "sentence"; data: LearningContent }
  | { type: "proverb"; data: Proverb }
  | { type: "question"; data: ExerciseQuestion };

export type LessonFlowData = {
  lesson: Lesson;
  blocks: PopulatedLessonBlock[];
  progress?: {
    currentStageIndex?: number;
    stageProgress?: LessonStageProgress[];
    progressPercent?: number;
    status?: "not_started" | "in_progress" | "completed";
  };
};

export type StageCompletionResult = {
  currentStageIndex: number;
  stageProgress: LessonStageProgress[];
  progressPercent: number;
  status?: "not_started" | "in_progress" | "completed";
};

export type StageQuestionResult = {
  questionId?: string;
  sourceType?: "word" | "expression" | "sentence";
  sourceId?: string;
  questionType?: QuestionType;
  questionSubtype?: QuestionSubtype;
  attempts?: number;
  incorrectAttempts?: number;
  correct?: boolean;
};

export type AdaptiveReviewSuggestion =
  | {
      kind: "personalized";
      title: string;
      description: string;
      sourceLessonIds: string[];
      weakItemCount: number;
    }
  | {
      kind: "fallback";
      lesson: {
        id: string;
        title: string;
      };
      reason: "no_struggle_data";
    };
