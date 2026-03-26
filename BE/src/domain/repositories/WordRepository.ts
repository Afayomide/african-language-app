import type { Language, Status } from "../entities/Lesson.js";
import type { WordEntity } from "../entities/Word.js";

export type WordListFilter = {
  language?: Language;
  languageId?: string | null;
  status?: Status;
};

export type WordCreateInput = Omit<WordEntity, "id" | "_id" | "createdAt" | "updatedAt" | "deletedAt" | "kind">;
export type WordUpdateInput = Partial<WordCreateInput>;

export interface WordRepository {
  create(input: WordCreateInput): Promise<WordEntity>;
  list(filter: WordListFilter): Promise<WordEntity[]>;
  findById(id: string): Promise<WordEntity | null>;
  findByIds(ids: string[]): Promise<WordEntity[]>;
  findByText(language: Language, text: string, languageId?: string | null): Promise<WordEntity | null>;
  updateById(id: string, update: WordUpdateInput): Promise<WordEntity | null>;
  softDeleteById(id: string): Promise<WordEntity | null>;
}
