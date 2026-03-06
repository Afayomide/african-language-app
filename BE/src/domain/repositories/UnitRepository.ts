import type { Language, Status } from "../entities/Lesson.js";
import type { UnitEntity } from "../entities/Unit.js";

export type UnitListFilter = {
  language?: Language;
  status?: Status;
};

export type UnitCreateInput = {
  title: string;
  description: string;
  language: Language;
  level: UnitEntity["level"];
  orderIndex: number;
  status: UnitEntity["status"];
  createdBy: string;
};

export type UnitUpdateInput = Partial<
  Pick<UnitEntity, "title" | "description" | "language" | "level" | "orderIndex" | "status">
>;

export interface UnitRepository {
  findLastOrderIndex(language: Language): Promise<number | null>;
  create(input: UnitCreateInput): Promise<UnitEntity>;
  list(filter: UnitListFilter): Promise<UnitEntity[]>;
  findById(id: string): Promise<UnitEntity | null>;
  updateById(id: string, update: UnitUpdateInput): Promise<UnitEntity | null>;
  softDeleteById(id: string): Promise<UnitEntity | null>;
  publishById(id: string, now: Date): Promise<UnitEntity | null>;
  findByIdsAndLanguage(ids: string[], language: Language): Promise<Array<{ id: string }>>;
  reorderByIds(ids: string[]): Promise<void>;
  listByLanguage(language: Language): Promise<UnitEntity[]>;
}
