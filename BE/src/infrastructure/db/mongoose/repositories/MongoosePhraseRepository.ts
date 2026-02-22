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
    lessonId: doc.lessonId.toString(),
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
    const created = await PhraseModel.create(input);
    return toEntity(created);
  }

  async list(filter: PhraseListFilter): Promise<PhraseEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.status) query.status = filter.status;
    if (filter.lessonId) query.lessonId = filter.lessonId;
    if (filter.lessonIds) query.lessonId = { $in: filter.lessonIds };
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
    const phrases = await PhraseModel.find({ lessonId, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .lean();
    return phrases.map(toEntity);
  }

  async findByIdAndLessonId(id: string, lessonId: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, lessonId, isDeleted: { $ne: true } });
    return phrase ? toEntity(phrase) : null;
  }

  async updateById(id: string, update: PhraseUpdateInput): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      update,
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
      { lessonId, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }

  async publishById(id: string, reviewedByAdmin: boolean): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!phrase) return null;

    phrase.status = "published";
    if (phrase.aiMeta?.generatedByAI) {
      phrase.aiMeta.reviewedByAdmin = reviewedByAdmin;
    }
    await phrase.save();
    return toEntity(phrase);
  }
}
