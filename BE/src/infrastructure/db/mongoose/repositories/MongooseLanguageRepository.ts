import LanguageModel from "../../../../models/Language.js";
import type { LanguageEntity } from "../../../../domain/entities/Language.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  LanguageCreateInput,
  LanguageListFilter,
  LanguageRepository,
  LanguageUpdateInput
} from "../../../../domain/repositories/LanguageRepository.js";

function toEntity(doc: {
  _id: { toString(): string };
  code: Language;
  name: string;
  nativeName: string;
  status: LanguageEntity["status"];
  orderIndex: number;
  locale?: string | null;
  region?: string | null;
  branding?: Partial<LanguageEntity["branding"]> | null;
  speechConfig?: Partial<LanguageEntity["speechConfig"]> | null;
  learningConfig?: Partial<LanguageEntity["learningConfig"]> | null;
  createdAt: Date;
  updatedAt: Date;
}): LanguageEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    code: doc.code,
    name: doc.name,
    nativeName: doc.nativeName,
    status: doc.status,
    orderIndex: doc.orderIndex,
    locale: String(doc.locale || ""),
    region: String(doc.region || ""),
    branding: {
      heroGreeting: String(doc.branding?.heroGreeting || ""),
      heroSubtitle: String(doc.branding?.heroSubtitle || ""),
      proverbLabel: String(doc.branding?.proverbLabel || "Proverb"),
      primaryColor: String(doc.branding?.primaryColor || ""),
      secondaryColor: String(doc.branding?.secondaryColor || ""),
      accentColor: String(doc.branding?.accentColor || ""),
      iconName: String(doc.branding?.iconName || "")
    },
    speechConfig: {
      ttsLocale: String(doc.speechConfig?.ttsLocale || ""),
      sttLocale: String(doc.speechConfig?.sttLocale || ""),
      ttsVoiceId: String(doc.speechConfig?.ttsVoiceId || "")
    },
    learningConfig: {
      scriptDirection: doc.learningConfig?.scriptDirection || "ltr",
      usesToneMarks: Boolean(doc.learningConfig?.usesToneMarks),
      usesDiacritics: Boolean(doc.learningConfig?.usesDiacritics)
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLanguageRepository implements LanguageRepository {
  async create(input: LanguageCreateInput): Promise<LanguageEntity> {
    const created = await LanguageModel.create(input);
    return toEntity(created);
  }

  async list(filter: LanguageListFilter = {}): Promise<LanguageEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    const languages = await LanguageModel.find(query).sort({ orderIndex: 1, createdAt: 1 }).lean();
    return languages.map(toEntity);
  }

  async listActive(): Promise<LanguageEntity[]> {
    const languages = await LanguageModel.find({ status: "active" }).sort({ orderIndex: 1, createdAt: 1 }).lean();
    return languages.map(toEntity);
  }

  async findById(id: string): Promise<LanguageEntity | null> {
    const language = await LanguageModel.findById(id).lean();
    return language ? toEntity(language) : null;
  }

  async findByCode(code: Language): Promise<LanguageEntity | null> {
    const language = await LanguageModel.findOne({ code }).lean();
    return language ? toEntity(language) : null;
  }

  async updateById(id: string, update: LanguageUpdateInput): Promise<LanguageEntity | null> {
    const language = await LanguageModel.findByIdAndUpdate(id, update, { new: true }).lean();
    return language ? toEntity(language) : null;
  }

  async upsertByCode(code: Language, input: LanguageCreateInput): Promise<LanguageEntity> {
    const language = await LanguageModel.findOneAndUpdate(
      { code },
      { $set: input },
      { new: true, upsert: true }
    ).lean();
    return toEntity(language!);
  }
}
