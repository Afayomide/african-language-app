import LessonModel from "../../../../models/Lesson.js";
import type { Language, LessonBlock, LessonEntity } from "../../../../domain/entities/Lesson.js";
import type {
  LessonCreateInput,
  LessonListFilter,
  LessonRepository,
  LessonUpdateInput
} from "../../../../domain/repositories/LessonRepository.js";
import { buildScopedLanguageQuery, findLanguageIdByCode } from "./languageRef.js";

type LessonPersistenceDoc = {
  _id: { toString(): string };
  title: string;
  unitId?: { toString(): string } | string | null;
  languageId?: { toString(): string } | string | null;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  orderIndex: number;
  description?: string | null;
  topics?: string[] | null;
  kind?: LessonEntity["kind"] | null;
  proverbs?: Array<{ text?: string | null; translation?: string | null; contextNote?: string | null }> | null;
  stages?: Array<{
    _id?: { toString(): string } | string | null;
    title?: string | null;
    description?: string | null;
    orderIndex?: number | null;
    blocks?: Array<{
      type?: "text" | "content" | "proverb" | "question" | null;
      content?: string | null;
      contentType?: "word" | "expression" | "sentence" | null;
      refId?: { toString(): string } | string | null;
      translationIndex?: number | null;
    }> | null;
  }> | null;
  status: LessonEntity["status"];
  createdBy: { toString(): string } | string;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
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

  const mapBlocks = (rows: Array<{
    type?: "text" | "content" | "proverb" | "question" | null;
    content?: string | null;
    contentType?: "word" | "expression" | "sentence" | null;
    refId?: { toString(): string } | string | null;
    translationIndex?: number | null;
  }> | null | undefined): LessonBlock[] =>
    Array.isArray(rows)
      ? rows.map((row) => {
        const blockType = String(row.type || "") as "text" | "content" | "proverb" | "question";
        if (blockType === "content") {
          const rawIndex = Number(row.translationIndex ?? 0);
          return {
            type: "content" as const,
            contentType: row.contentType === "sentence" || row.contentType === "word" ? row.contentType : "expression",
            refId: row.refId ? String(row.refId) : "",
            translationIndex: Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0
          };
        }
        if (blockType === "text") {
          return {
            type: "text" as const,
            content: String(row.content || "")
          };
        }
        return {
          type: blockType as "proverb" | "question",
          refId: row.refId ? String(row.refId) : ""
        };
      })
      : [];

  const stageRows = Array.isArray(doc.stages)
    ? doc.stages
      .map((row, index) => ({
        id: row._id ? String(row._id) : `${doc._id.toString()}-stage-${index}`,
        title: String(row.title || ""),
        description: String(row.description || ""),
        orderIndex: Number(row.orderIndex ?? index),
        blocks: mapBlocks(row.blocks)
      }))
      .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    languageId: doc.languageId ? String(doc.languageId) : null,
    title: doc.title,
    unitId: doc.unitId ? String(doc.unitId) : "",
    language: doc.language,
    level: doc.level,
    orderIndex: doc.orderIndex,
    description: String(doc.description || ""),
    topics: Array.isArray(doc.topics) ? doc.topics.map(String) : [],
    kind: doc.kind === "review" ? "review" : "core",
    proverbs: proverbRows,
    stages: stageRows,
    status: doc.status,
    createdBy: String(doc.createdBy),
    publishedAt: doc.publishedAt || null,
    deletedAt: doc.deletedAt || null,
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
    const languageId = await findLanguageIdByCode(input.language);
    const created = await LessonModel.create({ ...input, languageId: languageId || null });
    return toEntity(created);
  }

  async list(filter: LessonListFilter): Promise<LessonEntity[]> {
    const query: Record<string, string | object> = { isDeleted: { $ne: true } };
    if (filter.languageId || filter.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
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

  async findByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOne({
      _id: id,
      ...(await buildScopedLanguageQuery({ language, languageId })),
      isDeleted: { $ne: true }
    });
    return lesson ? toEntity(lesson) : null;
  }

  async updateById(id: string, update: LessonUpdateInput): Promise<LessonEntity | null> {
    const languageId = update.language ? await findLanguageIdByCode(update.language) : undefined;
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      languageId === undefined ? update : { ...update, languageId: languageId || null },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async updateByIdAndLanguage(
    id: string,
    language: Language,
    update: LessonUpdateInput,
    scopedLanguageId?: string | null
  ): Promise<LessonEntity | null> {
    const languageId = update.language ? await findLanguageIdByCode(update.language) : undefined;
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, ...(await buildScopedLanguageQuery({ language, languageId: scopedLanguageId })), isDeleted: { $ne: true } },
      languageId === undefined ? update : { ...update, languageId: languageId || null },
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

  async softDeleteByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, ...(await buildScopedLanguageQuery({ language, languageId })), isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async restoreById(id: string, orderIndex: number): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, isDeleted: true },
      { isDeleted: false, deletedAt: null, orderIndex },
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

  async finishByIdAndLanguage(id: string, language: Language, languageId?: string | null): Promise<LessonEntity | null> {
    const lesson = await LessonModel.findOneAndUpdate(
      { _id: id, ...(await buildScopedLanguageQuery({ language, languageId })), isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return lesson ? toEntity(lesson) : null;
  }

  async findByIdsAndLanguage(ids: string[], language: Language, languageId?: string | null): Promise<Array<{ id: string }>> {
    const lessons = await LessonModel.find({
      _id: { $in: ids },
      ...(await buildScopedLanguageQuery({ language, languageId })),
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

  async listByLanguage(language: Language, languageId?: string | null): Promise<LessonEntity[]> {
    const lessons = await LessonModel.find({ ...(await buildScopedLanguageQuery({ language, languageId })), isDeleted: { $ne: true } })
      .sort({
        orderIndex: 1,
        createdAt: 1
      })
      .lean();
    return lessons.map(toEntity);
  }

  async compactOrderIndexes(language: Language, languageId?: string | null): Promise<void> {
    const lessons = await LessonModel.find({ ...(await buildScopedLanguageQuery({ language, languageId })), isDeleted: { $ne: true } })
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

  async listDeletedByUnitId(unitId: string): Promise<LessonEntity[]> {
    const lessons = await LessonModel.find({ unitId, isDeleted: true })
      .sort({ deletedAt: -1, updatedAt: -1 })
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
