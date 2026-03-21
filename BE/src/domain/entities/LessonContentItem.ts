import type { ContentType, CurriculumRole } from "./Content.js";

export type LessonContentItemEntity = {
  id: string;
  _id?: string;
  lessonId: string;
  unitId: string;
  contentType: ContentType;
  contentId: string;
  role: CurriculumRole;
  stageIndex?: number | null;
  orderIndex: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};
