import type { Language, Status } from "../entities/Lesson.js";
import type { ExpressionEntity } from "../entities/Expression.js";

export type ExpressionListFilter = {
  language?: Language;
  status?: Status;
  ids?: string[];
};

export type ExpressionCreateInput = Omit<ExpressionEntity, "id" | "_id" | "createdAt" | "updatedAt" | "deletedAt" | "kind">;
export type ExpressionUpdateInput = Partial<ExpressionCreateInput>;

export interface ExpressionRepository {
  create(input: ExpressionCreateInput): Promise<ExpressionEntity>;
  list(filter: ExpressionListFilter): Promise<ExpressionEntity[]>;
  listDeleted(filter?: { ids?: string[]; language?: Language }): Promise<ExpressionEntity[]>;
  findById(id: string): Promise<ExpressionEntity | null>;
  findByIds(ids: string[]): Promise<ExpressionEntity[]>;
  findByText(language: Language, text: string): Promise<ExpressionEntity | null>;
  updateById(id: string, update: ExpressionUpdateInput): Promise<ExpressionEntity | null>;
  softDeleteById(id: string): Promise<ExpressionEntity | null>;
  restoreById(id: string): Promise<ExpressionEntity | null>;
}
