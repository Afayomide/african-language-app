import UnitModel from "../../../../models/Unit.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { UnitAiRunSummary, UnitEntity } from "../../../../domain/entities/Unit.js";
import type {
  UnitAiRunUpdateInput,
  UnitCreateInput,
  UnitListFilter,
  UnitRepository,
  UnitUpdateInput
} from "../../../../domain/repositories/UnitRepository.js";

function normalizeAiRun(value: unknown): UnitAiRunSummary | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  return {
    mode: String(input.mode || "generate") as UnitAiRunSummary["mode"],
    createdBy: String(input.createdBy || ""),
    createdAt: input.createdAt instanceof Date ? input.createdAt : new Date(String(input.createdAt || new Date().toISOString())),
    requestedLessons: Number(input.requestedLessons || 0),
    createdLessons: Number(input.createdLessons || 0),
    updatedLessons: input.updatedLessons == null ? undefined : Number(input.updatedLessons),
    clearedLessons: input.clearedLessons == null ? undefined : Number(input.clearedLessons),
    skippedLessons: Array.isArray(input.skippedLessons)
      ? input.skippedLessons.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            reason: String(row.reason || ""),
            topic: row.topic ? String(row.topic) : undefined,
            title: row.title ? String(row.title) : undefined
          };
        })
      : [],
    lessonGenerationErrors: Array.isArray(input.lessonGenerationErrors)
      ? input.lessonGenerationErrors.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            topic: row.topic ? String(row.topic) : undefined,
            error: String(row.error || "")
          };
        })
      : [],
    contentErrors: Array.isArray(input.contentErrors)
      ? input.contentErrors.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            lessonId: row.lessonId ? String(row.lessonId) : undefined,
            title: row.title ? String(row.title) : undefined,
            error: String(row.error || "")
          };
        })
      : [],
    lessons: Array.isArray(input.lessons)
      ? input.lessons.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            lessonId: String(row.lessonId || ""),
            title: String(row.title || ""),
            phrasesGenerated: Number(row.phrasesGenerated || 0),
            repeatedPhrasesLinked: Number(row.repeatedPhrasesLinked || 0),
            newPhrasesSelected: Number(row.newPhrasesSelected || 0),
            reviewPhrasesSelected: Number(row.reviewPhrasesSelected || 0),
            phrasesDroppedFromCandidates: Number(row.phrasesDroppedFromCandidates || 0),
            proverbsGenerated: Number(row.proverbsGenerated || 0),
            questionsGenerated: Number(row.questionsGenerated || 0),
            blocksGenerated: Number(row.blocksGenerated || 0)
          };
        })
      : []
  };
}

function toEntity(doc: {
  _id: { toString(): string };
  title: string;
  description: string;
  language: UnitEntity["language"];
  level: UnitEntity["level"];
  orderIndex: number;
  status: UnitEntity["status"];
  createdBy: { toString(): string };
  lastAiRun?: unknown;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UnitEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    language: doc.language,
    level: doc.level,
    orderIndex: doc.orderIndex,
    status: doc.status,
    createdBy: doc.createdBy.toString(),
    lastAiRun: normalizeAiRun(doc.lastAiRun),
    publishedAt: doc.publishedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseUnitRepository implements UnitRepository {
  async findLastOrderIndex(language: Language): Promise<number | null> {
    const last = await UnitModel.findOne({ language, isDeleted: { $ne: true } }).sort({
      orderIndex: -1,
      createdAt: -1
    });
    return last?.orderIndex ?? null;
  }

  async create(input: UnitCreateInput): Promise<UnitEntity> {
    const created = await UnitModel.create(input);
    return toEntity(created);
  }

  async list(filter: UnitListFilter): Promise<UnitEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.language) query.language = filter.language;
    if (filter.status) query.status = filter.status;

    const units = await UnitModel.find(query).sort({ language: 1, orderIndex: 1, createdAt: 1 }).lean();
    return units.map(toEntity);
  }

  async findById(id: string): Promise<UnitEntity | null> {
    const unit = await UnitModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return unit ? toEntity(unit) : null;
  }

  async updateById(id: string, update: UnitUpdateInput): Promise<UnitEntity | null> {
    const unit = await UnitModel.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, update, { new: true });
    return unit ? toEntity(unit) : null;
  }

  async updateLastAiRun(id: string, update: UnitAiRunUpdateInput): Promise<UnitEntity | null> {
    const unit = await UnitModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { lastAiRun: update.lastAiRun },
      { new: true }
    );
    return unit ? toEntity(unit) : null;
  }

  async softDeleteById(id: string): Promise<UnitEntity | null> {
    const unit = await UnitModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return unit ? toEntity(unit) : null;
  }

  async publishById(id: string, now: Date): Promise<UnitEntity | null> {
    const unit = await UnitModel.findOneAndUpdate(
      { _id: id, status: "finished", isDeleted: { $ne: true } },
      { status: "published", publishedAt: now },
      { new: true }
    );
    return unit ? toEntity(unit) : null;
  }

  async findByIdsAndLanguage(ids: string[], language: Language): Promise<Array<{ id: string }>> {
    const units = await UnitModel.find({
      _id: { $in: ids },
      language,
      isDeleted: { $ne: true }
    }).select("_id");

    return units.map((unit) => ({ id: unit._id.toString() }));
  }

  async reorderByIds(ids: string[]): Promise<void> {
    await UnitModel.bulkWrite(
      ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id, isDeleted: { $ne: true } },
          update: { $set: { orderIndex: index } }
        }
      }))
    );
  }

  async listByLanguage(language: Language): Promise<UnitEntity[]> {
    const units = await UnitModel.find({ language, isDeleted: { $ne: true } }).sort({
      orderIndex: 1,
      createdAt: 1
    }).lean();
    return units.map(toEntity);
  }
}
