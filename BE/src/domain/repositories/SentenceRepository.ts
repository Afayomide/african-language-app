import type { Language, Status } from "../entities/Lesson.js";
import type { PageRequest, PagedResult } from "./pagination.js";
import type { SentenceEntity } from "../entities/Sentence.js";

export type SentenceListFilter = {
  language?: Language;
  languageId?: string | null;
  status?: Status;
  ids?: string[];
};

/** Paginated + text-searched listing used by the admin/tutor list screens. */
export type SentencePageFilter = SentenceListFilter & { search?: string } & PageRequest;

export type SentenceCreateInput = Omit<SentenceEntity, "id" | "_id" | "createdAt" | "updatedAt" | "deletedAt" | "kind">;
export type SentenceUpdateInput = Partial<SentenceCreateInput>;

export interface SentenceRepository {
  create(input: SentenceCreateInput): Promise<SentenceEntity>;
  list(filter: SentenceListFilter): Promise<SentenceEntity[]>;
  listPaged(filter: SentencePageFilter): Promise<PagedResult<SentenceEntity>>;
  listDeleted(filter?: { ids?: string[]; language?: Language; languageId?: string | null }): Promise<SentenceEntity[]>;
  findById(id: string): Promise<SentenceEntity | null>;
  findByIds(ids: string[]): Promise<SentenceEntity[]>;
  findByText(language: Language, text: string, languageId?: string | null): Promise<SentenceEntity | null>;
  updateById(id: string, update: SentenceUpdateInput): Promise<SentenceEntity | null>;
  softDeleteById(id: string): Promise<SentenceEntity | null>;
  restoreById(id: string): Promise<SentenceEntity | null>;
}
