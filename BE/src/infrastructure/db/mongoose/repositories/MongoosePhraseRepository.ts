import PhraseModel from "../../../../models/Phrase.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type {
  PhraseCreateInput,
  PhraseListFilter,
  PhraseRepository,
  PhraseUpdateInput
} from "../../../../domain/repositories/PhraseRepository.js";

function toEntity(doc: any): PhraseEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    lessonIds: Array.isArray(doc.lessonIds) && doc.lessonIds.length > 0
      ? doc.lessonIds.map((id: { toString(): string }) => id.toString())
      : doc.lessonId
        ? [doc.lessonId.toString()]
        : [],
    language: String(doc.language || "yoruba") as PhraseEntity["language"],
    text: doc.text,
    translation: doc.translation,
    pronunciation: doc.pronunciation || "",
    explanation: doc.explanation || "",
    examples: (doc.examples || []).map((item: { original?: string; translation?: string }) => ({
      original: String(item.original || ""),
      translation: String(item.translation || "")
    })),
    difficulty: doc.difficulty ?? 1,
    aiMeta: {
      generatedByAI: Boolean(doc.aiMeta?.generatedByAI),
      model: String(doc.aiMeta?.model || ""),
      reviewedByAdmin: Boolean(doc.aiMeta?.reviewedByAdmin)
    },
    audio: {
      provider: String(doc.audio?.provider || ""),
      model: String(doc.audio?.model || ""),
      voice: String(doc.audio?.voice || ""),
      locale: String(doc.audio?.locale || ""),
      format: String(doc.audio?.format || ""),
      url: String(doc.audio?.url || ""),
      s3Key: String(doc.audio?.s3Key || "")
    },
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongoosePhraseRepository implements PhraseRepository {
  async create(input: PhraseCreateInput): Promise<PhraseEntity> {
    const lessonIds = Array.from(
      new Set(
        (input.lessonIds || []).map(String).filter(Boolean)
      )
    );
    const created = await PhraseModel.create({
      ...input,
      lessonIds
    });
    return toEntity(created);
  }

  async list(filter: PhraseListFilter): Promise<PhraseEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.status) query.status = filter.status;
    if (filter.language) query.language = filter.language;
    if (filter.lessonId) query.lessonIds = filter.lessonId;
    if (filter.lessonIds) query.lessonIds = { $in: filter.lessonIds };
    const phrases = await PhraseModel.find(query).sort({ createdAt: -1 }).lean();
    return phrases.map(toEntity);
  }

  async findById(id: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return phrase ? toEntity(phrase) : null;
  }

  async findByIds(ids: string[]): Promise<PhraseEntity[]> {
    const phrases = await PhraseModel.find({
      _id: { $in: ids },
      isDeleted: { $ne: true }
    }).lean();
    return phrases.map(toEntity);
  }

  async findByLessonId(lessonId: string): Promise<PhraseEntity[]> {
    const phrases = await PhraseModel.find({ lessonIds: lessonId, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .lean();
    return phrases.map(toEntity);
  }

  async findByIdAndLessonId(id: string, lessonId: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, lessonIds: lessonId, isDeleted: { $ne: true } });
    return phrase ? toEntity(phrase) : null;
  }

  async updateById(id: string, update: PhraseUpdateInput): Promise<PhraseEntity | null> {
    const payload: PhraseUpdateInput = { ...update };
    if (Array.isArray(update.lessonIds)) {
      payload.lessonIds = Array.from(new Set(update.lessonIds.map(String).filter(Boolean)));
    }
    const phrase = await PhraseModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      payload,
      { new: true }
    );
    return phrase ? toEntity(phrase) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return phrase ? toEntity(phrase) : null;
  }

  async softDeleteByLessonId(lessonId: string, now: Date): Promise<void> {
    await PhraseModel.updateMany(
      { lessonIds: lessonId, isDeleted: { $ne: true } },
      { $pull: { lessonIds: lessonId } }
    );
    await PhraseModel.updateMany(
      { lessonIds: { $size: 0 }, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }

  async publishById(id: string, reviewedByAdmin: boolean): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!phrase) return null;
    if (phrase.status !== "finished") return null;

    phrase.status = "published";
    if (phrase.aiMeta?.generatedByAI) {
      phrase.aiMeta.reviewedByAdmin = reviewedByAdmin;
    }
    await phrase.save();
    return toEntity(phrase);
  }

  async finishById(id: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return phrase ? toEntity(phrase) : null;
  }
}
