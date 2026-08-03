import type { Language, Status } from "../entities/Lesson.js";
import type { PageRequest, PagedResult } from "./pagination.js";
import type { ExpressionEntity } from "../entities/Expression.js";

export type ExpressionListFilter = {
  language?: Language;
  languageId?: string | null;
  status?: Status;
  ids?: string[];
};

/** Paginated + text-searched listing used by the admin/tutor list screens. */
export type ExpressionPageFilter = ExpressionListFilter & { search?: string } & PageRequest;

export type ExpressionCreateInput = Omit<ExpressionEntity, "id" | "_id" | "createdAt" | "updatedAt" | "deletedAt" | "kind">;
export type ExpressionUpdateInput = Partial<ExpressionCreateInput>;

export interface ExpressionRepository {
  create(input: ExpressionCreateInput): Promise<ExpressionEntity>;
  list(filter: ExpressionListFilter): Promise<ExpressionEntity[]>;
  listPaged(filter: ExpressionPageFilter): Promise<PagedResult<ExpressionEntity>>;
  listDeleted(filter?: { ids?: string[]; language?: Language; languageId?: string | null }): Promise<ExpressionEntity[]>;
  findById(id: string): Promise<ExpressionEntity | null>;
  findByIds(ids: string[]): Promise<ExpressionEntity[]>;
  findByText(language: Language, text: string, languageId?: string | null): Promise<ExpressionEntity | null>;
  updateById(id: string, update: ExpressionUpdateInput): Promise<ExpressionEntity | null>;
  softDeleteById(id: string): Promise<ExpressionEntity | null>;
  restoreById(id: string): Promise<ExpressionEntity | null>;
}
