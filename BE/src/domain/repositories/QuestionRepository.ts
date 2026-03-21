import type { QuestionEntity } from "../entities/Question.js";

export type QuestionListFilter = {
  lessonId?: string;
  lessonIds?: string[];
  type?: QuestionEntity["type"];
  subtype?: QuestionEntity["subtype"];
  status?: QuestionEntity["status"];
};

export type QuestionCreateInput = {
  lessonId: string;
  sourceType?: QuestionEntity["sourceType"];
  sourceId?: string;
  relatedSourceRefs?: QuestionEntity["relatedSourceRefs"];
  translationIndex?: number;
  type: QuestionEntity["type"];
  subtype: QuestionEntity["subtype"];
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  interactionData?: QuestionEntity["interactionData"];
  explanation?: string;
  status: QuestionEntity["status"];
};

export type QuestionUpdateInput = Partial<{
  sourceType: QuestionEntity["sourceType"];
  sourceId: string;
  relatedSourceRefs: QuestionEntity["relatedSourceRefs"];
  translationIndex: number;
  type: QuestionEntity["type"];
  subtype: QuestionEntity["subtype"];
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  interactionData?: QuestionEntity["interactionData"];
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
  softDeleteBySource(sourceType: NonNullable<QuestionEntity["sourceType"]>, sourceId: string, now: Date): Promise<void>;
  restoreByLessonId(lessonId: string): Promise<void>;
  publishById(id: string): Promise<QuestionEntity | null>;
  finishById(id: string): Promise<QuestionEntity | null>;
  sendBackToTutorById(id: string): Promise<QuestionEntity | null>;
}
