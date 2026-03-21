import type { ContentType } from "../entities/Content.js";
import type { QuestionSubtype, QuestionType } from "../entities/Question.js";
import type { LearnerQuestionMissEntity } from "../entities/LearnerQuestionMiss.js";

export type LearnerQuestionMissUpsertInput = {
  userId: string;
  lessonId: string;
  questionId: string;
  questionType: QuestionType;
  questionSubtype: QuestionSubtype;
  sourceType?: ContentType;
  sourceId?: string;
  missIncrement: number;
  seenAt: Date;
};

export interface LearnerQuestionMissRepository {
  listByUserAndLessonIds(userId: string, lessonIds: string[]): Promise<LearnerQuestionMissEntity[]>;
  upsertMany(rows: LearnerQuestionMissUpsertInput[]): Promise<void>;
}
