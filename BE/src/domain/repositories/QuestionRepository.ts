import type { QuestionEntity } from "../entities/Question.js";

export type QuestionListFilter = {
  lessonId?: string;
  lessonIds?: string[];
  type?: QuestionEntity["type"];
  status?: QuestionEntity["status"];
};

export type QuestionCreateInput = {
  lessonId: string;
  phraseId: string;
  type: QuestionEntity["type"];
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  explanation?: string;
  status: QuestionEntity["status"];
};

export type QuestionUpdateInput = Partial<{
  phraseId: string;
  type: QuestionEntity["type"];
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  explanation: string;
  status: QuestionEntity["status"];
}>;

export interface QuestionRepository {
  create(input: QuestionCreateInput): Promise<QuestionEntity>;
  list(filter: QuestionListFilter): Promise<QuestionEntity[]>;
  findById(id: string): Promise<QuestionEntity | null>;
  updateById(id: string, update: QuestionUpdateInput): Promise<QuestionEntity | null>;
  softDeleteById(id: string, now: Date): Promise<QuestionEntity | null>;
  softDeleteByLessonId(lessonId: string, now: Date): Promise<void>;
  softDeleteByPhraseId(phraseId: string, now: Date): Promise<void>;
  publishById(id: string): Promise<QuestionEntity | null>;
}
