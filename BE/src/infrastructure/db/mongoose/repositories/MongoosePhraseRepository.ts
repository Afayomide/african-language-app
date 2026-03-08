import PhraseModel from "../../../../models/Phrase.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type {
  PhraseCreateInput,
  PhraseListFilter,
  PhraseRepository,
  PhraseUpdateInput
} from "../../../../domain/repositories/PhraseRepository.js";

type PhrasePersistenceDoc = {
  _id: { toString(): string };
  lessonIds?: Array<{ toString(): string } | string> | null;
  lessonId?: { toString(): string } | string | null;
  language?: string | null;
  text?: string | null;
  translations?: string[] | null;
  pronunciation?: string | null;
  explanation?: string | null;
  examples?: Array<{ original?: string; translation?: string }> | null;
  difficulty?: number | null;
  aiMeta?: {
    generatedByAI?: boolean;
    model?: string;
    reviewedByAdmin?: boolean;
  } | null;
  audio?: {
    provider?: string;
    model?: string;
    voice?: string;
    locale?: string;
    format?: string;
    url?: string;
    s3Key?: string;
  } | null;
  status: PhraseEntity["status"];
  createdAt: Date;
  updatedAt: Date;
};

function normalizeTranslations(translations: string[]) {
  return Array.from(new Set(translations.map((item) => String(item || "").trim()).filter(Boolean)));
}

function toEntity(doc: PhrasePersistenceDoc): PhraseEntity {
  const translations = normalizeTranslations(
    Array.isArray(doc.translations) ? doc.translations : []
  );

  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    lessonIds: Array.isArray(doc.lessonIds) && doc.lessonIds.length > 0
      ? doc.lessonIds.map((id) => String(id))
      : doc.lessonId
        ? [String(doc.lessonId)]
        : [],
    language: String(doc.language || "yoruba") as PhraseEntity["language"],
    text: String(doc.text || ""),
    translations,
    pronunciation: String(doc.pronunciation || ""),
    explanation: String(doc.explanation || ""),
    examples: (doc.examples || []).map((item) => ({
      original: String(item.original || ""),
      translation: String(item.translation || "")
    })),
    difficulty: Number(doc.difficulty ?? 1),
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

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

export class MongoosePhraseRepository implements PhraseRepository {
  async create(input: PhraseCreateInput): Promise<PhraseEntity> {
    const lessonIds = Array.from(new Set((input.lessonIds || []).map(String).filter(Boolean)));
    const text = String(input.text).trim();
    const textNormalized = normalizeText(text);
    const translations = normalizeTranslations(input.translations);

    const existing = await PhraseModel.findOne({
      language: input.language,
      textNormalized,
      isDeleted: { $ne: true }
    });

    if (existing) {
      const mergedLessonIds = Array.from(
        new Set([...(existing.lessonIds || []).map((id: { toString(): string }) => id.toString()), ...lessonIds])
      );
      const mergedTranslations = normalizeTranslations([
        ...(Array.isArray(existing.translations) ? existing.translations : []),
        ...translations
      ]);

      existing.lessonIds = mergedLessonIds as never;
      existing.translations = mergedTranslations as never;
      if (!existing.pronunciation && input.pronunciation) existing.pronunciation = input.pronunciation as never;
      if (!existing.explanation && input.explanation) existing.explanation = input.explanation as never;
      if (existing.status !== "published" && input.status === "published") {
        existing.status = "published" as never;
      }
      if (input.audio && !existing.audio?.url) existing.audio = input.audio as never;
      await existing.save();
      return toEntity(existing.toObject() as PhrasePersistenceDoc);
    }

    const created = await PhraseModel.create({
      ...input,
      text,
      textNormalized,
      translations,
      lessonIds
    });
    return toEntity(created.toObject() as PhrasePersistenceDoc);
  }

  async list(filter: PhraseListFilter): Promise<PhraseEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.status) query.status = filter.status;
    if (filter.language) query.language = filter.language;
    if (filter.lessonId) query.lessonIds = filter.lessonId;
    if (filter.lessonIds) query.lessonIds = { $in: filter.lessonIds };
    const phrases = await PhraseModel.find(query).sort({ createdAt: -1 }).lean();
    return phrases.map((doc) => toEntity(doc as PhrasePersistenceDoc));
  }

  async findReusableByText(
    language: PhraseEntity["language"],
    text: string
  ): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({
      language,
      textNormalized: normalizeText(String(text)),
      isDeleted: { $ne: true }
    });
    return phrase ? toEntity(phrase.toObject() as PhrasePersistenceDoc) : null;
  }

  async findById(id: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return phrase ? toEntity(phrase.toObject() as PhrasePersistenceDoc) : null;
  }

  async findByIds(ids: string[]): Promise<PhraseEntity[]> {
    const phrases = await PhraseModel.find({
      _id: { $in: ids },
      isDeleted: { $ne: true }
    }).lean();
    return phrases.map((doc) => toEntity(doc as PhrasePersistenceDoc));
  }

  async findByLessonId(lessonId: string): Promise<PhraseEntity[]> {
    const phrases = await PhraseModel.find({ lessonIds: lessonId, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .lean();
    return phrases.map((doc) => toEntity(doc as PhrasePersistenceDoc));
  }

  async findByIdAndLessonId(id: string, lessonId: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOne({ _id: id, lessonIds: lessonId, isDeleted: { $ne: true } });
    return phrase ? toEntity(phrase.toObject() as PhrasePersistenceDoc) : null;
  }

  async updateById(id: string, update: PhraseUpdateInput): Promise<PhraseEntity | null> {
    const current = await PhraseModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!current) return null;

    if (Array.isArray(update.lessonIds)) {
      current.lessonIds = Array.from(new Set(update.lessonIds.map(String).filter(Boolean))) as never;
    }
    if (update.language) {
      current.language = update.language as never;
    }
    if (update.text !== undefined) {
      const text = String(update.text || "").trim();
      current.text = text as never;
      current.textNormalized = normalizeText(text) as never;
    }
    if (Array.isArray(update.translations)) {
      current.translations = normalizeTranslations(update.translations) as never;
    }
    if (update.pronunciation !== undefined) current.pronunciation = update.pronunciation as never;
    if (update.explanation !== undefined) current.explanation = update.explanation as never;
    if (update.examples !== undefined) current.examples = update.examples as never;
    if (update.difficulty !== undefined) current.difficulty = update.difficulty as never;
    if (update.aiMeta !== undefined) {
      current.aiMeta = {
        generatedByAI: Boolean(update.aiMeta.generatedByAI ?? current.aiMeta?.generatedByAI),
        model: String(update.aiMeta.model ?? current.aiMeta?.model ?? ""),
        reviewedByAdmin: Boolean(update.aiMeta.reviewedByAdmin ?? current.aiMeta?.reviewedByAdmin)
      } as never;
    }
    if (update.audio !== undefined) current.audio = update.audio as never;
    if (update.status !== undefined) current.status = update.status as never;

    await current.save();
    return toEntity(current.toObject() as PhrasePersistenceDoc);
  }

  async softDeleteById(id: string, now: Date): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return phrase ? toEntity(phrase.toObject() as PhrasePersistenceDoc) : null;
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
    return toEntity(phrase.toObject() as PhrasePersistenceDoc);
  }

  async finishById(id: string): Promise<PhraseEntity | null> {
    const phrase = await PhraseModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return phrase ? toEntity(phrase.toObject() as PhrasePersistenceDoc) : null;
  }
}
