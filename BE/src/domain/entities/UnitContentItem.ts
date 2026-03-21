import type { ContentType, CurriculumRole } from "./Content.js";

export type UnitContentItemEntity = {
  id: string;
  _id?: string;
  unitId: string;
  contentType: ContentType;
  contentId: string;
  role: Extract<CurriculumRole, "introduce" | "review">;
  orderIndex: number;
  sourceUnitId?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};
