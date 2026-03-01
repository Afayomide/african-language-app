import ProverbModel from "../../../../models/Proverb.js";
import type { ProverbEntity } from "../../../../domain/entities/Proverb.js";
import type {
  ProverbCreateInput,
  ProverbListFilter,
  ProverbRepository,
  ProverbUpdateInput
} from "../../../../domain/repositories/ProverbRepository.js";

function toEntity(doc: any): ProverbEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    lessonIds: Array.isArray(doc.lessonIds)
      ? doc.lessonIds.map((id: { toString(): string }) => id.toString())
      : [],
    language: doc.language,
    text: String(doc.text || ""),
    translation: String(doc.translation || ""),
    contextNote: String(doc.contextNote || ""),
    aiMeta: {
      generatedByAI: Boolean(doc.aiMeta?.generatedByAI),
      model: String(doc.aiMeta?.model || ""),
      reviewedByAdmin: Boolean(doc.aiMeta?.reviewedByAdmin)
    },
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseProverbRepository implements ProverbRepository {
  async create(input: ProverbCreateInput): Promise<ProverbEntity> {
    const lessonIds = Array.from(new Set(input.lessonIds.map(String).filter(Boolean)));
    const created = await ProverbModel.create({
      ...input,
      lessonIds
    });
    return toEntity(created);
  }

  async list(filter: ProverbListFilter): Promise<ProverbEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.status) query.status = filter.status;
    if (filter.language) query.language = filter.language;
    if (filter.lessonId) query.lessonIds = filter.lessonId;
    if (filter.lessonIds) query.lessonIds = { $in: filter.lessonIds };

    const proverbs = await ProverbModel.find(query).sort({ createdAt: -1 }).lean();
    return proverbs.map(toEntity);
  }

  async findById(id: string): Promise<ProverbEntity | null> {
    const proverb = await ProverbModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return proverb ? toEntity(proverb) : null;
  }

  async findByLessonId(lessonId: string): Promise<ProverbEntity[]> {
    const proverbs = await ProverbModel.find({
      lessonIds: lessonId,
      isDeleted: { $ne: true }
    })
      .sort({ createdAt: -1 })
      .lean();
    return proverbs.map(toEntity);
  }

  async findReusable(language: ProverbEntity["language"], text: string): Promise<ProverbEntity | null> {
    const normalizedText = String(text || "").trim().toLowerCase();
    if (!normalizedText) return null;
    const proverb = await ProverbModel.findOne({
      language,
      normalizedText,
      isDeleted: { $ne: true }
    });
    return proverb ? toEntity(proverb) : null;
  }

  async updateById(id: string, update: ProverbUpdateInput): Promise<ProverbEntity | null> {
    const payload: ProverbUpdateInput = { ...update };
    if (Array.isArray(update.lessonIds)) {
      payload.lessonIds = Array.from(new Set(update.lessonIds.map(String).filter(Boolean)));
    }
    const proverb = await ProverbModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      payload,
      { new: true }
    );
    return proverb ? toEntity(proverb) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<ProverbEntity | null> {
    const proverb = await ProverbModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return proverb ? toEntity(proverb) : null;
  }

  async softDeleteByLessonId(lessonId: string, now: Date): Promise<void> {
    await ProverbModel.updateMany(
      { lessonIds: lessonId, isDeleted: { $ne: true } },
      { $pull: { lessonIds: lessonId } }
    );
    await ProverbModel.updateMany(
      { lessonIds: { $size: 0 }, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }

  async publishById(id: string, reviewedByAdmin: boolean): Promise<ProverbEntity | null> {
    const proverb = await ProverbModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!proverb) return null;
    if (proverb.status !== "finished") return null;
    proverb.status = "published";
    if (proverb.aiMeta?.generatedByAI) proverb.aiMeta.reviewedByAdmin = reviewedByAdmin;
    await proverb.save();
    return toEntity(proverb);
  }

  async finishById(id: string): Promise<ProverbEntity | null> {
    const proverb = await ProverbModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return proverb ? toEntity(proverb) : null;
  }
}

