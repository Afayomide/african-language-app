import type { UnitContentItemEntity } from "../entities/UnitContentItem.js";
import type { ContentType } from "../entities/Content.js";

export type UnitContentItemListFilter = {
  unitId?: string;
  contentType?: ContentType;
  contentId?: string;
  role?: UnitContentItemEntity["role"];
};

export type UnitContentItemCreateInput = Omit<UnitContentItemEntity, "id" | "_id" | "createdAt" | "updatedAt">;
export type UnitContentItemUpdateInput = Partial<Pick<UnitContentItemEntity, "role" | "orderIndex" | "sourceUnitId">>;

export interface UnitContentItemRepository {
  create(input: UnitContentItemCreateInput): Promise<UnitContentItemEntity>;
  list(filter: UnitContentItemListFilter): Promise<UnitContentItemEntity[]>;
  replaceForUnit(unitId: string, items: UnitContentItemCreateInput[]): Promise<UnitContentItemEntity[]>;
  deleteByUnitId(unitId: string): Promise<void>;
}
