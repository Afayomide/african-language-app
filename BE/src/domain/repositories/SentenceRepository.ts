import type { Language, Status } from "../entities/Lesson.js";
import type { SentenceEntity } from "../entities/Sentence.js";

export type SentenceListFilter = {
  language?: Language;
  languageId?: string | null;
  status?: Status;
};

export type SentenceCreateInput = Omit<SentenceEntity, "id" | "_id" | "createdAt" | "updatedAt" | "deletedAt" | "kind">;
export type SentenceUpdateInput = Partial<SentenceCreateInput>;

export interface SentenceRepository {
  create(input: SentenceCreateInput): Promise<SentenceEntity>;
  list(filter: SentenceListFilter): Promise<SentenceEntity[]>;
  findById(id: string): Promise<SentenceEntity | null>;
  findByIds(ids: string[]): Promise<SentenceEntity[]>;
  findByText(language: Language, text: string, languageId?: string | null): Promise<SentenceEntity | null>;
  updateById(id: string, update: SentenceUpdateInput): Promise<SentenceEntity | null>;
  softDeleteById(id: string): Promise<SentenceEntity | null>;
}
