import type { ProverbEntity } from "../entities/Proverb.js";

export type ProverbListFilter = {
  status?: "draft" | "finished" | "published";
  language?: ProverbEntity["language"];
  languageId?: string | null;
  lessonId?: string;
  lessonIds?: string[];
};

export type ProverbCreateInput = {
  lessonIds: string[];
  language: ProverbEntity["language"];
  text: string;
  translation?: string;
  contextNote?: string;
  aiMeta?: Partial<ProverbEntity["aiMeta"]>;
  status: "draft" | "finished" | "published";
};

export type ProverbUpdateInput = Partial<{
  lessonIds: string[];
  language: ProverbEntity["language"];
  text: string;
  translation: string;
  contextNote: string;
  aiMeta: Partial<ProverbEntity["aiMeta"]>;
  status: "draft" | "finished" | "published";
}>;

export interface ProverbRepository {
  create(input: ProverbCreateInput): Promise<ProverbEntity>;
  list(filter: ProverbListFilter): Promise<ProverbEntity[]>;
  findById(id: string): Promise<ProverbEntity | null>;
  findByLessonId(lessonId: string): Promise<ProverbEntity[]>;
  findReusable(language: ProverbEntity["language"], text: string, languageId?: string | null): Promise<ProverbEntity | null>;
  updateById(id: string, update: ProverbUpdateInput): Promise<ProverbEntity | null>;
  softDeleteById(id: string, now: Date): Promise<ProverbEntity | null>;
  softDeleteByLessonId(lessonId: string, now: Date): Promise<void>;
  restoreById(id: string, lessonIdsToAdd?: string[]): Promise<ProverbEntity | null>;
  restoreByLessonId(lessonId: string): Promise<void>;
  publishById(id: string, reviewedByAdmin: boolean): Promise<ProverbEntity | null>;
  finishById(id: string): Promise<ProverbEntity | null>;
}
