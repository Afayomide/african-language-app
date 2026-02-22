import type { PhraseEntity, PhraseExample } from "../entities/Phrase.js";

export type PhraseListFilter = {
  status?: "draft" | "published";
  lessonId?: string;
  lessonIds?: string[];
};

export type PhraseCreateInput = {
  lessonId: string;
  text: string;
  translation: string;
  pronunciation?: string;
  explanation?: string;
  examples?: PhraseExample[];
  difficulty?: number;
  aiMeta?: Partial<PhraseEntity["aiMeta"]>;
  status: "draft" | "published";
};

export type PhraseUpdateInput = Partial<{
  lessonId: string;
  text: string;
  translation: string;
  pronunciation: string;
  explanation: string;
  examples: PhraseExample[];
  difficulty: number;
  aiMeta: Partial<PhraseEntity["aiMeta"]>;
  audio: PhraseEntity["audio"];
  status: "draft" | "published";
}>;

export interface PhraseRepository {
  create(input: PhraseCreateInput): Promise<PhraseEntity>;
  list(filter: PhraseListFilter): Promise<PhraseEntity[]>;
  findById(id: string): Promise<PhraseEntity | null>;
  findByIds(ids: string[]): Promise<PhraseEntity[]>;
  findByLessonId(lessonId: string): Promise<PhraseEntity[]>;
  findByIdAndLessonId(id: string, lessonId: string): Promise<PhraseEntity | null>;
  updateById(id: string, update: PhraseUpdateInput): Promise<PhraseEntity | null>;
  softDeleteById(id: string, now: Date): Promise<PhraseEntity | null>;
  softDeleteByLessonId(lessonId: string, now: Date): Promise<void>;
  publishById(id: string, reviewedByAdmin: boolean): Promise<PhraseEntity | null>;
}
