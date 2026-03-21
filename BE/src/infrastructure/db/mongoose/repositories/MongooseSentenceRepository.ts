import SentenceModel from "../../../../models/Sentence.js";
import type { SentenceEntity } from "../../../../domain/entities/Sentence.js";
import type { ContentComponentRef } from "../../../../domain/entities/Content.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  SentenceCreateInput,
  SentenceListFilter,
  SentenceRepository,
  SentenceUpdateInput
} from "../../../../domain/repositories/SentenceRepository.js";
import { mapContentAudio } from "./mapContentAudio.js";

function mapComponents(rows: Array<{ type?: string; refId?: { toString(): string } | string; orderIndex?: number; textSnapshot?: string }> | null | undefined): ContentComponentRef[] {
  return Array.isArray(rows)
    ? rows.map((row, index) => ({
        type: (row?.type === "expression" ? "expression" : "word") as ContentComponentRef["type"],
        refId: typeof row?.refId === "string" ? row.refId : String(row?.refId?.toString() || ""),
        orderIndex: Number.isInteger(row?.orderIndex) ? Number(row?.orderIndex) : index,
        textSnapshot: row?.textSnapshot ? String(row.textSnapshot) : undefined
      }))
    : [];
}

function toEntity(doc: any): SentenceEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    kind: "sentence",
    language: doc.language,
    text: String(doc.text || ""),
    textNormalized: String(doc.textNormalized || ""),
    translations: Array.isArray(doc.translations) ? doc.translations.map(String) : [],
    pronunciation: String(doc.pronunciation || ""),
    explanation: String(doc.explanation || ""),
    examples: Array.isArray(doc.examples)
      ? doc.examples.map((row: { original?: string; translation?: string }) => ({
          original: String(row.original || ""),
          translation: String(row.translation || "")
        }))
      : [],
    difficulty: Number(doc.difficulty || 1),
    aiMeta: {
      generatedByAI: Boolean(doc.aiMeta?.generatedByAI),
      model: String(doc.aiMeta?.model || ""),
      reviewedByAdmin: Boolean(doc.aiMeta?.reviewedByAdmin)
    },
    audio: mapContentAudio(doc.audio),
    literalTranslation: String(doc.literalTranslation || ""),
    usageNotes: String(doc.usageNotes || ""),
    components: mapComponents(doc.components),
    status: doc.status,
    deletedAt: doc.deletedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseSentenceRepository implements SentenceRepository {
  async create(input: SentenceCreateInput): Promise<SentenceEntity> {
    const created = await SentenceModel.create(input);
    return toEntity(created);
  }

  async list(filter: SentenceListFilter): Promise<SentenceEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.language) query.language = filter.language;
    if (filter.status) query.status = filter.status;
    const sentences = await SentenceModel.find(query).sort({ language: 1, text: 1, createdAt: 1 }).lean();
    return sentences.map(toEntity);
  }

  async findById(id: string): Promise<SentenceEntity | null> {
    const sentence = await SentenceModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return sentence ? toEntity(sentence) : null;
  }

  async findByIds(ids: string[]): Promise<SentenceEntity[]> {
    if (ids.length === 0) return [];
    const sentences = await SentenceModel.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).lean();
    return sentences.map(toEntity);
  }

  async findByText(language: Language, text: string): Promise<SentenceEntity | null> {
    const sentence = await SentenceModel.findOne({ language, textNormalized: text.trim().toLowerCase(), isDeleted: { $ne: true } });
    return sentence ? toEntity(sentence) : null;
  }

  async updateById(id: string, update: SentenceUpdateInput): Promise<SentenceEntity | null> {
    const sentence = await SentenceModel.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, update, { new: true });
    return sentence ? toEntity(sentence) : null;
  }

  async softDeleteById(id: string): Promise<SentenceEntity | null> {
    const sentence = await SentenceModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return sentence ? toEntity(sentence) : null;
  }
}
