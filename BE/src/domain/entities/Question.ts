import type { ContentType } from "./Content.js";

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
  contentType?: ContentType;
  contentId?: string;
  contentText?: string;
  translationIndex: number;
  translation: string;
  image?: QuestionMatchingImage | null;
};

export type QuestionSourceRef = {
  type: ContentType;
  id: string;
};

export type QuestionInteractionData = {
  matchingPairs?: QuestionMatchingPair[];
};

export type QuestionEntity = {
  id: string;
  _id?: string;
  lessonId: string;
  sourceType?: ContentType;
  sourceId?: string;
  relatedSourceRefs?: QuestionSourceRef[];
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
