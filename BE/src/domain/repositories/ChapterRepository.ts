import type { Language, Status } from "../entities/Lesson.js";
import type { ChapterEntity } from "../entities/Chapter.js";

export type ChapterListFilter = {
  language?: Language;
  languageId?: string | null;
  status?: Status;
};

export type ChapterCreateInput = {
  title: string;
  description: string;
  language: Language;
  level: ChapterEntity["level"];
  orderIndex: number;
  status: ChapterEntity["status"];
  createdBy: string;
};

export type ChapterUpdateInput = Partial<
  Pick<ChapterEntity, "title" | "description" | "language" | "level" | "orderIndex" | "status">
>;

export interface ChapterRepository {
  findLastOrderIndex(language: Language, languageId?: string | null): Promise<number | null>;
  create(input: ChapterCreateInput): Promise<ChapterEntity>;
  list(filter: ChapterListFilter): Promise<ChapterEntity[]>;
  listByLanguage(language: Language, languageId?: string | null): Promise<ChapterEntity[]>;
  findById(id: string): Promise<ChapterEntity | null>;
  updateById(id: string, update: ChapterUpdateInput): Promise<ChapterEntity | null>;
  softDeleteById(id: string): Promise<ChapterEntity | null>;
  publishById(id: string, now: Date): Promise<ChapterEntity | null>;
  reorderByIds(ids: string[]): Promise<void>;
}
