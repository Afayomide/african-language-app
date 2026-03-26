import ChapterModel from "../../../../models/Chapter.js";
import type { ChapterEntity } from "../../../../domain/entities/Chapter.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  ChapterCreateInput,
  ChapterListFilter,
  ChapterRepository,
  ChapterUpdateInput
} from "../../../../domain/repositories/ChapterRepository.js";
import { buildScopedLanguageQuery, findLanguageIdByCode } from "./languageRef.js";

function toEntity(doc: {
  _id: { toString(): string };
  languageId?: { toString(): string } | string | null;
  title: string;
  description?: string | null;
  language: ChapterEntity["language"];
  level: ChapterEntity["level"];
  orderIndex: number;
  status: ChapterEntity["status"];
  createdBy: { toString(): string } | string;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChapterEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    languageId: doc.languageId ? String(doc.languageId) : null,
    title: doc.title,
    description: String(doc.description || ""),
    language: doc.language,
    level: doc.level,
    orderIndex: doc.orderIndex,
    status: doc.status,
    createdBy: String(doc.createdBy),
    publishedAt: doc.publishedAt || null,
    deletedAt: doc.deletedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseChapterRepository implements ChapterRepository {
  async findLastOrderIndex(language: Language, languageId?: string | null): Promise<number | null> {
    const last = await ChapterModel.findOne({
      ...(await buildScopedLanguageQuery({ language, languageId })),
      isDeleted: { $ne: true }
    }).sort({ orderIndex: -1, createdAt: -1 });
    return last?.orderIndex ?? null;
  }

  async create(input: ChapterCreateInput): Promise<ChapterEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const created = await ChapterModel.create({ ...input, languageId: languageId || null });
    return toEntity(created);
  }

  async list(filter: ChapterListFilter): Promise<ChapterEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.languageId || filter.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
    if (filter.status) query.status = filter.status;
    const chapters = await ChapterModel.find(query).sort({ language: 1, orderIndex: 1, createdAt: 1 }).lean();
    return chapters.map(toEntity);
  }

  async listByLanguage(language: Language, languageId?: string | null): Promise<ChapterEntity[]> {
    const chapters = await ChapterModel.find({
      ...(await buildScopedLanguageQuery({ language, languageId })),
      isDeleted: { $ne: true }
    }).sort({ orderIndex: 1, createdAt: 1 }).lean();
    return chapters.map(toEntity);
  }

  async findById(id: string): Promise<ChapterEntity | null> {
    const chapter = await ChapterModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return chapter ? toEntity(chapter) : null;
  }

  async updateById(id: string, update: ChapterUpdateInput): Promise<ChapterEntity | null> {
    const languageId = update.language ? await findLanguageIdByCode(update.language) : undefined;
    const chapter = await ChapterModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      languageId === undefined ? update : { ...update, languageId: languageId || null },
      { new: true }
    );
    return chapter ? toEntity(chapter) : null;
  }

  async softDeleteById(id: string): Promise<ChapterEntity | null> {
    const chapter = await ChapterModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return chapter ? toEntity(chapter) : null;
  }

  async publishById(id: string, now: Date): Promise<ChapterEntity | null> {
    const chapter = await ChapterModel.findOneAndUpdate(
      { _id: id, status: "finished", isDeleted: { $ne: true } },
      { status: "published", publishedAt: now },
      { new: true }
    );
    return chapter ? toEntity(chapter) : null;
  }

  async reorderByIds(ids: string[]): Promise<void> {
    await ChapterModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id, isDeleted: { $ne: true } },
          update: { $set: { orderIndex: index } }
        }
      }))
    );
  }
}
