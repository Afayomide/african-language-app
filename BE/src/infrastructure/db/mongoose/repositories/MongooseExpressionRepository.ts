import ExpressionModel from "../../../../models/Expression.js";
import type { ExpressionEntity } from "../../../../domain/entities/Expression.js";
import type { ContentComponentRef } from "../../../../domain/entities/Content.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  ExpressionCreateInput,
  ExpressionListFilter,
  ExpressionRepository,
  ExpressionUpdateInput
} from "../../../../domain/repositories/ExpressionRepository.js";
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

function toEntity(doc: any): ExpressionEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    kind: "expression",
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
    register: doc.register === "formal" || doc.register === "casual" ? doc.register : "neutral",
    components: mapComponents(doc.components),
    status: doc.status,
    deletedAt: doc.deletedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseExpressionRepository implements ExpressionRepository {
  async create(input: ExpressionCreateInput): Promise<ExpressionEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const created = await ExpressionModel.create({ ...input, languageId: languageId || null });
    return toEntity(created);
  }

  async list(filter: ExpressionListFilter): Promise<ExpressionEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.languageId || filter.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
    if (filter.status) query.status = filter.status;
    if (Array.isArray(filter.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    const expressions = await ExpressionModel.find(query).sort({ language: 1, text: 1, createdAt: 1 }).lean();
    return expressions.map(toEntity);
  }

  async listDeleted(filter?: { ids?: string[]; language?: Language; languageId?: string | null }): Promise<ExpressionEntity[]> {
    const query: Record<string, unknown> = { isDeleted: true };
    if (filter?.languageId || filter?.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter?.language, languageId: filter?.languageId }));
    }
    if (Array.isArray(filter?.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    const expressions = await ExpressionModel.find(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
    return expressions.map(toEntity);
  }

  async findById(id: string): Promise<ExpressionEntity | null> {
    const expression = await ExpressionModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return expression ? toEntity(expression) : null;
  }

  async findByIds(ids: string[]): Promise<ExpressionEntity[]> {
    if (ids.length === 0) return [];
    const expressions = await ExpressionModel.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).lean();
    return expressions.map(toEntity);
  }

  async findByText(language: Language, text: string, languageId?: string | null): Promise<ExpressionEntity | null> {
    const expression = await ExpressionModel.findOne({
      ...(await buildScopedLanguageQuery({ language, languageId })),
      textNormalized: text.trim().toLowerCase(),
      isDeleted: { $ne: true }
    });
    return expression ? toEntity(expression) : null;
  }

  async updateById(id: string, update: ExpressionUpdateInput): Promise<ExpressionEntity | null> {
    const languageId = update.language ? await findLanguageIdByCode(update.language) : undefined;
    const expression = await ExpressionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      languageId === undefined ? update : { ...update, languageId: languageId || null },
      { new: true }
    );
    return expression ? toEntity(expression) : null;
  }

  async softDeleteById(id: string): Promise<ExpressionEntity | null> {
    const expression = await ExpressionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return expression ? toEntity(expression) : null;
  }

  async restoreById(id: string): Promise<ExpressionEntity | null> {
    const expression = await ExpressionModel.findOneAndUpdate(
      { _id: id, isDeleted: true },
      { isDeleted: false, deletedAt: null },
      { new: true }
    );
    return expression ? toEntity(expression) : null;
  }
}
