import type { LanguageEntity, LanguageStatus } from "../entities/Language.js";
import type { Language } from "../entities/Lesson.js";

export type LanguageListFilter = {
  status?: LanguageStatus;
};

export type LanguageCreateInput = Pick<
  LanguageEntity,
  | "code"
  | "name"
  | "nativeName"
  | "status"
  | "orderIndex"
  | "locale"
  | "region"
  | "branding"
  | "speechConfig"
  | "learningConfig"
>;

export type LanguageUpdateInput = Partial<
  Pick<
    LanguageEntity,
    | "name"
    | "nativeName"
    | "status"
    | "orderIndex"
    | "locale"
    | "region"
    | "branding"
    | "speechConfig"
    | "learningConfig"
  >
>;

export interface LanguageRepository {
  create(input: LanguageCreateInput): Promise<LanguageEntity>;
  list(filter?: LanguageListFilter): Promise<LanguageEntity[]>;
  listActive(): Promise<LanguageEntity[]>;
  findById(id: string): Promise<LanguageEntity | null>;
  findByCode(code: Language): Promise<LanguageEntity | null>;
  updateById(id: string, update: LanguageUpdateInput): Promise<LanguageEntity | null>;
  upsertByCode(code: Language, input: LanguageCreateInput): Promise<LanguageEntity>;
}
