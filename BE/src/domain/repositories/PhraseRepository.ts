import type { PhraseEntity, PhraseExample } from "../entities/Phrase.js";

export type PhraseListFilter = {
  status?: "draft" | "finished" | "published";
  language?: PhraseEntity["language"];
  lessonId?: string;
  lessonIds?: string[];
};

export type PhraseDeletedListFilter = {
  ids?: string[];
  lessonIds?: string[];
};

export type PhraseCreateInput = {
  lessonIds?: string[];
  language: PhraseEntity["language"];
  text: string;
  translations: string[];
  pronunciation?: string;
  explanation?: string;
  examples?: PhraseExample[];
  difficulty?: number;
  aiMeta?: Partial<PhraseEntity["aiMeta"]>;
  audio?: PhraseEntity["audio"];
  status: "draft" | "finished" | "published";
};

export type PhraseUpdateInput = Partial<{
  lessonIds: string[];
  language: PhraseEntity["language"];
  text: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  examples: PhraseExample[];
  difficulty: number;
  aiMeta: Partial<PhraseEntity["aiMeta"]>;
  audio: PhraseEntity["audio"];
  status: "draft" | "finished" | "published";
}>;

export interface PhraseRepository {
  create(input: PhraseCreateInput): Promise<PhraseEntity>;
  list(filter: PhraseListFilter): Promise<PhraseEntity[]>;
  findReusableByText(language: PhraseEntity["language"], text: string): Promise<PhraseEntity | null>;
  findById(id: string): Promise<PhraseEntity | null>;
  findByIds(ids: string[]): Promise<PhraseEntity[]>;
  findByLessonId(lessonId: string): Promise<PhraseEntity[]>;
  findByIdAndLessonId(id: string, lessonId: string): Promise<PhraseEntity | null>;
  listDeleted(filter: PhraseDeletedListFilter): Promise<PhraseEntity[]>;
  updateById(id: string, update: PhraseUpdateInput): Promise<PhraseEntity | null>;
  softDeleteById(id: string, now: Date): Promise<PhraseEntity | null>;
  softDeleteByLessonId(lessonId: string, now: Date): Promise<void>;
  restoreById(id: string, lessonIdsToAdd?: string[]): Promise<PhraseEntity | null>;
  restoreByLessonId(lessonId: string): Promise<void>;
  publishById(id: string, reviewedByAdmin: boolean): Promise<PhraseEntity | null>;
  finishById(id: string): Promise<PhraseEntity | null>;
}
