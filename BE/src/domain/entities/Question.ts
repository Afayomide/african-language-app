export type QuestionType = "vocabulary" | "practice" | "listening" | "review";

export type QuestionReviewData = {
  sentence: string;
  words: string[];
  correctOrder: number[];
  meaning: string;
};

export type QuestionEntity = {
  id: string;
  _id?: string;
  lessonId: string;
  phraseId: string;
  type: QuestionType;
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionReviewData;
  explanation: string;
  status: "draft" | "finished" | "published";
  createdAt: Date;
  updatedAt: Date;
};
