import UnitContentItemModel from "../../../../models/UnitContentItem.js";
import type { UnitContentItemEntity } from "../../../../domain/entities/UnitContentItem.js";
import type {
  UnitContentItemCreateInput,
  UnitContentItemListFilter,
  UnitContentItemRepository
} from "../../../../domain/repositories/UnitContentItemRepository.js";

function toEntity(doc: any): UnitContentItemEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    unitId: String(doc.unitId),
    contentType: doc.contentType,
    contentId: String(doc.contentId),
    role: doc.role,
    orderIndex: Number(doc.orderIndex || 0),
    sourceUnitId: doc.sourceUnitId ? String(doc.sourceUnitId) : null,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseUnitContentItemRepository implements UnitContentItemRepository {
  async create(input: UnitContentItemCreateInput): Promise<UnitContentItemEntity> {
    const created = await UnitContentItemModel.create(input);
    return toEntity(created);
  }

  async list(filter: UnitContentItemListFilter): Promise<UnitContentItemEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.unitId) query.unitId = filter.unitId;
    if (filter.contentType) query.contentType = filter.contentType;
    if (filter.contentId) query.contentId = filter.contentId;
    if (filter.role) query.role = filter.role;
    const rows = await UnitContentItemModel.find(query).sort({ orderIndex: 1, createdAt: 1 }).lean();
    return rows.map(toEntity);
  }

  async replaceForUnit(unitId: string, items: UnitContentItemCreateInput[]): Promise<UnitContentItemEntity[]> {
    await UnitContentItemModel.deleteMany({ unitId });
    if (items.length === 0) return [];
    const created = await UnitContentItemModel.insertMany(items);
    return created.map(toEntity);
  }

  async deleteByUnitId(unitId: string): Promise<void> {
    await UnitContentItemModel.deleteMany({ unitId });
  }
}
