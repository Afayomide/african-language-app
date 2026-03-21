import LessonContentItemModel from "../../../../models/LessonContentItem.js";
import type { LessonContentItemEntity } from "../../../../domain/entities/LessonContentItem.js";
import type {
  LessonContentItemCreateInput,
  LessonContentItemListFilter,
  LessonContentItemRepository
} from "../../../../domain/repositories/LessonContentItemRepository.js";

function toEntity(doc: any): LessonContentItemEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    lessonId: String(doc.lessonId),
    unitId: String(doc.unitId),
    contentType: doc.contentType,
    contentId: String(doc.contentId),
    role: doc.role,
    stageIndex: doc.stageIndex == null ? null : Number(doc.stageIndex),
    orderIndex: Number(doc.orderIndex || 0),
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLessonContentItemRepository implements LessonContentItemRepository {
  async create(input: LessonContentItemCreateInput): Promise<LessonContentItemEntity> {
    const created = await LessonContentItemModel.create(input);
    return toEntity(created);
  }

  async list(filter: LessonContentItemListFilter): Promise<LessonContentItemEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.lessonId) query.lessonId = filter.lessonId;
    if (filter.unitId) query.unitId = filter.unitId;
    if (filter.contentType) query.contentType = filter.contentType;
    if (filter.contentId) query.contentId = filter.contentId;
    if (filter.role) query.role = filter.role;
    const rows = await LessonContentItemModel.find(query).sort({ orderIndex: 1, createdAt: 1 }).lean();
    return rows.map(toEntity);
  }

  async listByContent(contentType: LessonContentItemEntity["contentType"], contentIds: string[]): Promise<LessonContentItemEntity[]> {
    if (contentIds.length === 0) return [];
    const rows = await LessonContentItemModel.find({
      contentType,
      contentId: { $in: contentIds }
    })
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();
    return rows.map(toEntity);
  }

  async replaceForLesson(lessonId: string, items: LessonContentItemCreateInput[]): Promise<LessonContentItemEntity[]> {
    await LessonContentItemModel.deleteMany({ lessonId });
    if (items.length === 0) return [];
    const created = await LessonContentItemModel.insertMany(items);
    return created.map(toEntity);
  }

  async replaceForContent(
    contentType: LessonContentItemEntity["contentType"],
    contentId: string,
    items: LessonContentItemCreateInput[]
  ): Promise<LessonContentItemEntity[]> {
    await LessonContentItemModel.deleteMany({ contentType, contentId });
    if (items.length === 0) return [];
    const created = await LessonContentItemModel.insertMany(items);
    return created.map(toEntity);
  }

  async deleteByLessonId(lessonId: string): Promise<void> {
    await LessonContentItemModel.deleteMany({ lessonId });
  }
}
