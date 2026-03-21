import type { ContentType } from "./Content.js";
import type { QuestionSubtype, QuestionType } from "./Question.js";

export type LearnerQuestionMissEntity = {
  id: string;
  _id?: string;
  userId: string;
  lessonId: string;
  questionId: string;
  questionType: QuestionType;
  questionSubtype: QuestionSubtype;
  sourceType?: ContentType;
  sourceId?: string;
  missCount: number;
  firstMissedAt: Date;
  lastMissedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
