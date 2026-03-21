import type { LessonContentItemEntity } from "../entities/LessonContentItem.js";
import type { ContentType } from "../entities/Content.js";

export type LessonContentItemListFilter = {
  lessonId?: string;
  unitId?: string;
  contentType?: ContentType;
  contentId?: string;
  role?: LessonContentItemEntity["role"];
};

export type LessonContentItemCreateInput = Omit<LessonContentItemEntity, "id" | "_id" | "createdAt" | "updatedAt">;
export type LessonContentItemUpdateInput = Partial<Pick<LessonContentItemEntity, "role" | "stageIndex" | "orderIndex">>;

export interface LessonContentItemRepository {
  create(input: LessonContentItemCreateInput): Promise<LessonContentItemEntity>;
  list(filter: LessonContentItemListFilter): Promise<LessonContentItemEntity[]>;
  listByContent(contentType: ContentType, contentIds: string[]): Promise<LessonContentItemEntity[]>;
  replaceForLesson(lessonId: string, items: LessonContentItemCreateInput[]): Promise<LessonContentItemEntity[]>;
  replaceForContent(
    contentType: ContentType,
    contentId: string,
    items: LessonContentItemCreateInput[]
  ): Promise<LessonContentItemEntity[]>;
  deleteByLessonId(lessonId: string): Promise<void>;
}
