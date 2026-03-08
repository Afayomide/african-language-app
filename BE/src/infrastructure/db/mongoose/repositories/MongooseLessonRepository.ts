import LessonModel from "../../../../models/Lesson.js";
import type { Language, LessonEntity } from "../../../../domain/entities/Lesson.js";
import type {
  LessonCreateInput,
  LessonListFilter,
  LessonRepository,
  LessonUpdateInput
} from "../../../../domain/repositories/LessonRepository.js";

type LessonPersistenceDoc = {
  _id: { toString(): string };
  title: string;
  unitId?: { toString(): string } | string | null;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  orderIndex: number;
  description?: string | null;
  topics?: string[] | null;
  proverbs?: Array<{ text?: string | null; translation?: string | null; contextNote?: string | null }> | null;
  blocks?: Array<{
    type?: "text" | "phrase" | "proverb" | "question" | null;
    content?: string | null;
    refId?: { toString(): string } | string | null;
    translationIndex?: number | null;
  }> | null;
  status: LessonEntity["status"];
  createdBy: { toString(): string } | string;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toEntity(doc: LessonPersistenceDoc): LessonEntity {
  const proverbRows = Array.isArray(doc.proverbs)
    ? doc.proverbs.map((row) => {
        return {
          text: String(row.text || ""),
          translation: String(row.translation || ""),
          contextNote: String(row.contextNote || "")
        };
      })
    : [];

  const blockRows = Array.isArray(doc.blocks)
    ? doc.blocks.map((row) => {
        const blockType = String(row.type || "") as "text" | "phrase" | "proverb" | "question";
        if (blockType === "phrase") {
          const rawIndex = Number(row.translationIndex ?? 0);
          return {
            type: "phrase" as const,
            content: String(row.content || ""),
            refId: row.refId ? String(row.refId) : "",
            translationIndex: Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0
          };
        }
        return {
          type: blockType,
          content: String(row.content || ""),
          refId: row.refId ? String(row.refId) : ""
        };
      })
    : [];

  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    title: doc.title,
    unitId: doc.unitId ? String(doc.unitId) : "",
    language: doc.language,
    level: doc.level,
    orderIndex: doc.orderIndex,
    description: String(doc.description || ""),
    topics: Array.isArray(doc.topics) ? doc.topics.map(String) : [],
    proverbs: proverbRows,
    blocks: blockRows,
    status: doc.status,
    createdBy: String(doc.createdBy),
    publishedAt: doc.publishedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLessonRepository implements LessonRepository {
  async findLastOrderIndex(unitId: string): Promise<number | null> {
    const last = await LessonModel.findOne({ unitId, isDeleted: { $ne: true } }).sort({
      orderIndex: -1,
      createdAt: -1
    });
    return last?.orderIndex ?? null;
  }

  async create(input: LessonCreateInput): Promise<LessonEntity> {
    const created = await LessonModel.create(input);
    return toEntity(created);
  }

  async list(filter: LessonListFilter): Promise<LessonEntity[]> {
    const query: Record<string, string | object> = { isDeleted: { $ne: true } };
    if (filter.language) query.language = filter.language;
    if (filter.unitId) query.unitId = filter.unitId;
    if (filter.status) query.status = filter.status;

    const lessons = await LessonModel.find(query)
      .sort({ language: 1, orderIndex: 1, createdAt: 1 })
      .lean();
    return lessons.map(toEntity);
  }

  async findById(id: string): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return lesson ? toEntity(lesson) : null;
  }

  async findByIdAndLanguage(id: string, language: Language): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOne({ _id: id, language, isDeleted: { $ne: true } });
    return lesson ? toEntity(lesson) : null;
  }

  async updateById(id: string, update: LessonUpdateInput): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, update, { new: true });
    return lesson ? toEntity(lesson) : null;
  }

  async updateByIdAndLanguage(
    id: string,
    language: Language,
    update: LessonUpdateInput
  ): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, language, isDeleted: { $ne: true } },
      update,
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async softDeleteById(id: string): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async softDeleteByIdAndLanguage(id: string, language: Language): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, language, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async publishById(id: string, now: Date): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, status: "finished", isDeleted: { $ne: true } },
      { status: "published", publishedAt: now },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async finishByIdAndLanguage(id: string, language: Language): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, language, isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async findByIdsAndLanguage(ids: string[], language: Language): Promise<Array<{ id: string }>> {
    const lessons = await LessonModel.find({
      _id: { $in: ids },
      language,
      isDeleted: { $ne: true }
    }).select("_id");

    return lessons.map((lesson) => ({ id: lesson._id.toString() }));
  }

  async reorderByIds(ids: string[]): Promise<void> {
    await LessonModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id, isDeleted: { $ne: true } },
          update: { $set: { orderIndex: index } }
        }
      }))
    );
  }

  async listByLanguage(language: Language): Promise<LessonEntity[]> {
    const lessons = await LessonModel.find({ language, isDeleted: { $ne: true } })
      .sort({
        orderIndex: 1,
        createdAt: 1
      })
      .lean();
    return lessons.map(toEntity);
  }

  async compactOrderIndexes(language: Language): Promise<void> {
    const lessons = await LessonModel.find({ language, isDeleted: { $ne: true } })
      .sort({ orderIndex: 1, createdAt: 1 })
      .select("_id");

    if (lessons.length === 0) return;

    await LessonModel.bulkWrite(
      lessons.map((lesson, index) => ({
        updateOne: {
          filter: { _id: lesson._id, isDeleted: { $ne: true } },
          update: { $set: { orderIndex: index } }
        }
      }))
    );
  }

  async findByIdsAndUnit(ids: string[], unitId: string): Promise<Array<{ id: string }>> {
    const lessons = await LessonModel.find({
      _id: { $in: ids },
      unitId,
      isDeleted: { $ne: true }
    }).select("_id");

    return lessons.map((lesson) => ({ id: lesson._id.toString() }));
  }

  async listByUnitId(unitId: string): Promise<LessonEntity[]> {
    const lessons = await LessonModel.find({ unitId, isDeleted: { $ne: true } })
      .sort({ orderIndex: 1, createdAt: 1 })
      .lean();
    return lessons.map(toEntity);
  }

  async compactOrderIndexesByUnit(unitId: string): Promise<void> {
    const lessons = await LessonModel.find({ unitId, isDeleted: { $ne: true } })
      .sort({ orderIndex: 1, createdAt: 1 })
      .select("_id");

    if (lessons.length === 0) return;

    await LessonModel.bulkWrite(
      lessons.map((lesson, index) => ({
        updateOne: {
          filter: { _id: lesson._id, isDeleted: { $ne: true } },
          update: { $set: { orderIndex: index } }
        }
      }))
    );
  }
}
