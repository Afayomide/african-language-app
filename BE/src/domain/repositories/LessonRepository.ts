import type { Language, LessonEntity, Status } from "../entities/Lesson.js";

export type LessonListFilter = {
  language?: Language;
  status?: Status;
};

export type LessonCreateInput = {
  title: string;
  language: Language;
  level: LessonEntity["level"];
  orderIndex: number;
  description: string;
  topics?: string[];
  status: LessonEntity["status"];
  createdBy: string;
};

export type LessonUpdateInput = Partial<
  Pick<LessonEntity, "title" | "language" | "level" | "orderIndex" | "description" | "topics" | "status">
>;

export interface LessonRepository {
  findLastOrderIndex(language: Language): Promise<number | null>;
  create(input: LessonCreateInput): Promise<LessonEntity>;
  list(filter: LessonListFilter): Promise<LessonEntity[]>;
  findById(id: string): Promise<LessonEntity | null>;
  findByIdAndLanguage(id: string, language: Language): Promise<LessonEntity | null>;
  updateById(id: string, update: LessonUpdateInput): Promise<LessonEntity | null>;
  updateByIdAndLanguage(id: string, language: Language, update: LessonUpdateInput): Promise<LessonEntity | null>;
  softDeleteById(id: string): Promise<LessonEntity | null>;
  softDeleteByIdAndLanguage(id: string, language: Language): Promise<LessonEntity | null>;
  publishById(id: string, now: Date): Promise<LessonEntity | null>;
  finishByIdAndLanguage(id: string, language: Language): Promise<LessonEntity | null>;
  findByIdsAndLanguage(ids: string[], language: Language): Promise<Array<{ id: string }>>;
  reorderByIds(ids: string[]): Promise<void>;
  listByLanguage(language: Language): Promise<LessonEntity[]>;
  compactOrderIndexes(language: Language): Promise<void>;
}
