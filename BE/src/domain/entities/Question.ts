export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening" | "matching";

export type QuestionSubtype =
  // Multiple Choice Interactions (Text-based)
  | "mc-select-translation"
  | "mc-select-missing-word"
  // Fill in the Gap Interactions (Text-based)
  | "fg-word-order"
  | "fg-gap-fill"
  // Listening Interactions (Audio-based, nested from MC and FG)
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  // Matching interactions
  | "mt-match-image"
  | "mt-match-translation"
  | "ls-dictation"
  | "ls-tone-recognition";

export type QuestionReviewData = {
  sentence: string;
  words: string[];
  correctOrder: number[];
  meaning: string;
};

export type QuestionMatchingImage = {
  imageAssetId: string;
  url: string;
  thumbnailUrl?: string;
  altText: string;
};

export type QuestionMatchingPair = {
  pairId: string;
  phraseId: string;
  phraseText: string;
  translationIndex: number;
  translation: string;
  image?: QuestionMatchingImage | null;
};

export type QuestionInteractionData = {
  matchingPairs?: QuestionMatchingPair[];
};

export type QuestionEntity = {
  id: string;
  _id?: string;
  lessonId: string;
  phraseId: string;
  relatedPhraseIds?: string[];
  translationIndex: number;
  type: QuestionType;
  subtype: QuestionSubtype;
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionReviewData;
  interactionData?: QuestionInteractionData;
  explanation: string;
  status: "draft" | "finished" | "published";
  createdAt: Date;
  updatedAt: Date;
};
