import type { Language, Status } from "../entities/Lesson.js";
import type { UnitAiRunSummary, UnitEntity } from "../entities/Unit.js";

export type UnitListFilter = {
  chapterId?: string;
  language?: Language;
  languageId?: string | null;
  status?: Status;
  kind?: UnitEntity["kind"];
};

export type UnitCreateInput = {
  chapterId?: string | null;
  title: string;
  description: string;
  language: Language;
  level: UnitEntity["level"];
  kind?: UnitEntity["kind"];
  reviewStyle?: UnitEntity["reviewStyle"];
  reviewSourceUnitIds?: string[];
  orderIndex: number;
  status: UnitEntity["status"];
  createdBy: string;
};

export type UnitUpdateInput = Partial<
  Pick<UnitEntity, "chapterId" | "title" | "description" | "language" | "level" | "kind" | "reviewStyle" | "reviewSourceUnitIds" | "orderIndex" | "status">
>;

export type UnitAiRunUpdateInput = {
  lastAiRun: UnitAiRunSummary | null;
};

export interface UnitRepository {
  findLastOrderIndex(language: Language, chapterId?: string | null, languageId?: string | null): Promise<number | null>;
  create(input: UnitCreateInput): Promise<UnitEntity>;
  list(filter: UnitListFilter): Promise<UnitEntity[]>;
  findById(id: string): Promise<UnitEntity | null>;
  updateById(id: string, update: UnitUpdateInput): Promise<UnitEntity | null>;
  updateLastAiRun(id: string, update: UnitAiRunUpdateInput): Promise<UnitEntity | null>;
  softDeleteById(id: string): Promise<UnitEntity | null>;
  publishById(id: string, now: Date): Promise<UnitEntity | null>;
  findByIdsAndLanguage(ids: string[], language: Language, languageId?: string | null): Promise<Array<{ id: string }>>;
  reorderByIds(ids: string[]): Promise<void>;
  listByLanguage(language: Language, languageId?: string | null): Promise<UnitEntity[]>;
  listByChapterId(chapterId: string): Promise<UnitEntity[]>;
}
