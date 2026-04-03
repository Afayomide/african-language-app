import type { Language, LessonEntity, LessonStage, Status } from "../entities/Lesson.js";

export type LessonListFilter = {
  language?: Language;
  languageId?: string | null;
  unitId?: string;
  status?: Status;
};

export type LessonCreateInput = {
  title: string;
  unitId: string;
  language: Language;
  level: LessonEntity["level"];
  kind?: LessonEntity["kind"];
  orderIndex: number;
  description: string;
  topics?: string[];
  proverbs?: Array<{ text: string; translation: string; contextNote: string }>;
  stages?: LessonStage[];
  status: LessonEntity["status"];
  createdBy: string;
};

export type LessonUpdateInput = Partial<
  Pick<LessonEntity, "title" | "unitId" | "language" | "level" | "kind" | "orderIndex" | "description" | "topics" | "proverbs" | "stages" | "status">
>;

export type LessonSummaryEntity = Pick<
  LessonEntity,
  | "id"
  | "_id"
  | "languageId"
  | "title"
  | "unitId"
  | "language"
  | "level"
  | "kind"
  | "orderIndex"
  | "description"
  | "status"
  | "createdBy"
  | "publishedAt"
  | "deletedAt"
  | "createdAt"
  | "updatedAt"
> & {
  stageCount: number;
};

export interface LessonRepository {
  findLastOrderIndex(unitId: string): Promise<number | null>;
  create(input: LessonCreateInput): Promise<LessonEntity>;
  list(filter: LessonListFilter): Promise<LessonEntity[]>;
  listSummaries(filter: LessonListFilter): Promise<LessonSummaryEntity[]>;
  findById(id: string): Promise<LessonEntity | null>;
  findByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null>;
  updateById(id: string, update: LessonUpdateInput): Promise<LessonEntity | null>;
  updateByIdAndLanguage(id: string, language: Language, update: LessonUpdateInput, languageId?: string | null): Promise<LessonEntity | null>;
  softDeleteById(id: string): Promise<LessonEntity | null>;
  softDeleteByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null>;
  restoreById(id: string, orderIndex: number): Promise<LessonEntity | null>;
  publishById(id: string, now: Date): Promise<LessonEntity | null>;
  finishByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null>;
  findByIdsAndLanguage(ids: string[], language: Language, languageId?: string | null): Promise<Array<{ id: string }>>;
  findByIdsAndUnit(ids: string[], unitId: string): Promise<Array<{ id: string }>>;
  reorderByIds(ids: string[]): Promise<void>;
  listByLanguage(language: Language, languageId?: string | null): Promise<LessonEntity[]>;
  listByUnitId(unitId: string): Promise<LessonEntity[]>;
  listDeletedByUnitId(unitId: string): Promise<LessonEntity[]>;
  compactOrderIndexes(language: Language, languageId?: string | null): Promise<void>;
  compactOrderIndexesByUnit(unitId: string): Promise<void>;
}
