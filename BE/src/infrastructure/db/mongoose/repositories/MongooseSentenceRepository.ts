import SentenceModel from "../../../../models/Sentence.js";
import type { SentenceEntity, SentenceMeaningSegment } from "../../../../domain/entities/Sentence.js";
import type { ContentComponentRef } from "../../../../domain/entities/Content.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  SentenceCreateInput,
  SentenceListFilter,
  SentencePageFilter,
  SentenceRepository,
  SentenceUpdateInput
} from "../../../../domain/repositories/SentenceRepository.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import { mapContentAudio } from "./mapContentAudio.js";
import { buildScopedLanguageQuery, findLanguageIdByCode } from "./languageRef.js";

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

function mapMeaningSegments(rows: Array<{
  text?: string;
  sourceWordIndexes?: unknown[];
  sourceComponentIndexes?: unknown[];
}> | null | undefined): SentenceMeaningSegment[] {
  return Array.isArray(rows)
    ? rows
        .map((row) => ({
          text: String(row?.text || "").trim(),
          sourceWordIndexes: Array.isArray(row?.sourceWordIndexes)
            ? row.sourceWordIndexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0)
            : [],
          sourceComponentIndexes: Array.isArray(row?.sourceComponentIndexes)
            ? row.sourceComponentIndexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0)
            : []
        }))
        .filter((row) => row.text && row.sourceWordIndexes.length > 0)
    : [];
}

function toEntity(doc: any): SentenceEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    kind: "sentence",
    languageId: doc.languageId ? String(doc.languageId) : null,
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
    meaningSegments: mapMeaningSegments(doc.meaningSegments),
    status: doc.status,
    deletedAt: doc.deletedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseSentenceRepository implements SentenceRepository {
  async create(input: SentenceCreateInput): Promise<SentenceEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const created = await SentenceModel.create({ ...input, languageId: languageId || null });
    return toEntity(created);
  }

  async list(filter: SentenceListFilter): Promise<SentenceEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.languageId || filter.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
    if (filter.status) query.status = filter.status;
    if (Array.isArray(filter.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    const sentences = await SentenceModel.find(query).sort({ language: 1, text: 1, createdAt: 1 }).lean();
    return sentences.map(toEntity);
  }


  async listPaged(filter: SentencePageFilter): Promise<PagedResult<SentenceEntity>> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.languageId || filter.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
    if (filter.status) query.status = filter.status;
    if (Array.isArray(filter.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    if (filter.search) {
      const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = ["text", "translations", "pronunciation", "explanation", "literalTranslation", "usageNotes"].map((field) => ({ [field]: regex }));
    }

    const total = await SentenceModel.countDocuments(query);
    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);
    const rows = await SentenceModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { items: rows.map(toEntity), total };
  }

  async listDeleted(filter?: { ids?: string[]; language?: Language; languageId?: string | null }): Promise<SentenceEntity[]> {
    const query: Record<string, unknown> = { isDeleted: true };
    if (filter?.languageId || filter?.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
    if (Array.isArray(filter?.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    const sentences = await SentenceModel.find(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
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

  async findByText(language: Language, text: string, languageId?: string | null): Promise<SentenceEntity | null> {
    const sentence = await SentenceModel.findOne({
      ...(await buildScopedLanguageQuery({ language, languageId })),
      textNormalized: text.trim().toLowerCase(),
      isDeleted: { $ne: true }
    });
    return sentence ? toEntity(sentence) : null;
  }

  async updateById(id: string, update: SentenceUpdateInput): Promise<SentenceEntity | null> {
    const languageId = update.language ? await findLanguageIdByCode(update.language) : undefined;
    const sentence = await SentenceModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      languageId === undefined ? update : { ...update, languageId: languageId || null },
      { new: true }
    );
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

  async restoreById(id: string): Promise<SentenceEntity | null> {
    const sentence = await SentenceModel.findOneAndUpdate(
      { _id: id, isDeleted: true },
      { isDeleted: false, deletedAt: null },
      { new: true }
    );
    return sentence ? toEntity(sentence) : null;
  }
}
