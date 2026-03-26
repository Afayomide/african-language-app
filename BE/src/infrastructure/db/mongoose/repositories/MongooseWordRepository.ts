import WordModel from "../../../../models/Word.js";
import type { WordEntity } from "../../../../domain/entities/Word.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  WordCreateInput,
  WordListFilter,
  WordRepository,
  WordUpdateInput
} from "../../../../domain/repositories/WordRepository.js";
import { mapContentAudio } from "./mapContentAudio.js";
import { buildScopedLanguageQuery, findLanguageIdByCode } from "./languageRef.js";

function toEntity(doc: any): WordEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    kind: "word",
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
    lemma: String(doc.lemma || ""),
    partOfSpeech: String(doc.partOfSpeech || ""),
    status: doc.status,
    deletedAt: doc.deletedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseWordRepository implements WordRepository {
  async create(input: WordCreateInput): Promise<WordEntity> {
    const languageId = await findLanguageIdByCode(input.language);
    const created = await WordModel.create({ ...input, languageId: languageId || null });
    return toEntity(created);
  }

  async list(filter: WordListFilter): Promise<WordEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.languageId || filter.language) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }
    if (filter.status) query.status = filter.status;
    const words = await WordModel.find(query).sort({ language: 1, text: 1, createdAt: 1 }).lean();
    return words.map(toEntity);
  }

  async findById(id: string): Promise<WordEntity | null> {
    const word = await WordModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return word ? toEntity(word) : null;
  }

  async findByIds(ids: string[]): Promise<WordEntity[]> {
    if (ids.length === 0) return [];
    const words = await WordModel.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).lean();
    return words.map(toEntity);
  }

  async findByText(language: Language, text: string, languageId?: string | null): Promise<WordEntity | null> {
    const word = await WordModel.findOne({
      ...(await buildScopedLanguageQuery({ language, languageId })),
      textNormalized: text.trim().toLowerCase(),
      isDeleted: { $ne: true }
    });
    return word ? toEntity(word) : null;
  }

  async updateById(id: string, update: WordUpdateInput): Promise<WordEntity | null> {
    const languageId = update.language ? await findLanguageIdByCode(update.language) : undefined;
    const word = await WordModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      languageId === undefined ? update : { ...update, languageId: languageId || null },
      { new: true }
    );
    return word ? toEntity(word) : null;
  }

  async softDeleteById(id: string): Promise<WordEntity | null> {
    const word = await WordModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    return word ? toEntity(word) : null;
  }
}
