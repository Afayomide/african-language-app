import LessonModel from "../../../../models/Lesson.js";
import type { Language, LessonEntity } from "../../../../domain/entities/Lesson.js";
import type {
  LessonCreateInput,
  LessonListFilter,
  LessonRepository,
  LessonUpdateInput
} from "../../../../domain/repositories/LessonRepository.js";

function toEntity(doc: {
  _id: { toString(): string };
  title: string;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  orderIndex: number;
  description: string;
  topics?: string[];
  status: LessonEntity["status"];
  createdBy: { toString(): string };
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LessonEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    title: doc.title,
    language: doc.language,
    level: doc.level,
    orderIndex: doc.orderIndex,
    description: doc.description,
    topics: Array.isArray(doc.topics) ? doc.topics.map(String) : [],
    status: doc.status,
    createdBy: doc.createdBy.toString(),
    publishedAt: doc.publishedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLessonRepository implements LessonRepository {
  async findLastOrderIndex(language: Language): Promise<number | null> {
    const last = await LessonModel.findOne({ language, isDeleted: { $ne: true } }).sort({
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
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.language) query.language = filter.language;
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
      { _id: id, isDeleted: { $ne: true } },
      { status: "published", publishedAt: now },
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
}
