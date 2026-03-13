import PhraseImageLinkModel from "../../../../models/PhraseImageLink.js";
import type { PhraseImageLinkEntity } from "../../../../domain/entities/PhraseImageLink.js";
import type {
  PhraseImageLinkCreateInput,
  PhraseImageLinkRepository,
  PhraseImageLinkUpdateInput
} from "../../../../domain/repositories/PhraseImageLinkRepository.js";

function normalizeTranslationIndex(value?: number | null) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function buildPrimaryFilter(phraseId: string, translationIndex?: number | null, excludeId?: string) {
  const query: Record<string, unknown> = {
    phraseId,
    isDeleted: { $ne: true },
    translationIndex: normalizeTranslationIndex(translationIndex)
  };
  if (excludeId) query._id = { $ne: excludeId };
  return query;
}

function toEntity(doc: {
  _id: { toString(): string };
  phraseId: { toString(): string };
  translationIndex?: number | null;
  imageAssetId: { toString(): string };
  isPrimary?: boolean;
  notes?: string;
  createdBy: { toString(): string };
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}): PhraseImageLinkEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    phraseId: doc.phraseId.toString(),
    translationIndex: normalizeTranslationIndex(doc.translationIndex),
    imageAssetId: doc.imageAssetId.toString(),
    isPrimary: Boolean(doc.isPrimary),
    notes: String(doc.notes || ""),
    createdBy: doc.createdBy.toString(),
    deletedAt: doc.deletedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongoosePhraseImageLinkRepository implements PhraseImageLinkRepository {
  async create(input: PhraseImageLinkCreateInput): Promise<PhraseImageLinkEntity> {
    const translationIndex = normalizeTranslationIndex(input.translationIndex);
    const existing = await PhraseImageLinkModel.findOne({
      phraseId: input.phraseId,
      imageAssetId: input.imageAssetId,
      translationIndex,
      isDeleted: { $ne: true }
    });
    if (existing) {
      if (input.isPrimary) {
        await this.clearPrimaryForPhrase(input.phraseId, translationIndex, existing._id.toString());
        existing.isPrimary = true as never;
      }
      if (input.notes !== undefined) existing.notes = String(input.notes || "") as never;
      await existing.save();
      return toEntity(existing.toObject() as Parameters<typeof toEntity>[0]);
    }

    if (input.isPrimary) {
      await this.clearPrimaryForPhrase(input.phraseId, translationIndex);
    }

    const created = await PhraseImageLinkModel.create({
      phraseId: input.phraseId,
      translationIndex,
      imageAssetId: input.imageAssetId,
      isPrimary: Boolean(input.isPrimary),
      notes: input.notes || "",
      createdBy: input.createdBy
    });
    return toEntity(created);
  }

  async listByPhraseId(phraseId: string): Promise<PhraseImageLinkEntity[]> {
    const links = await PhraseImageLinkModel.find({ phraseId, isDeleted: { $ne: true } }).sort({
      isPrimary: -1,
      createdAt: -1
    });
    return links.map(toEntity);
  }

  async listByPhraseIds(phraseIds: string[]): Promise<PhraseImageLinkEntity[]> {
    if (!phraseIds.length) return [];
    const links = await PhraseImageLinkModel.find({
      phraseId: { $in: phraseIds },
      isDeleted: { $ne: true }
    }).sort({ isPrimary: -1, createdAt: -1 });
    return links.map(toEntity);
  }

  async findById(id: string): Promise<PhraseImageLinkEntity | null> {
    const link = await PhraseImageLinkModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return link ? toEntity(link) : null;
  }

  async findActiveByPhraseAndAsset(
    phraseId: string,
    imageAssetId: string,
    translationIndex?: number | null
  ): Promise<PhraseImageLinkEntity | null> {
    const link = await PhraseImageLinkModel.findOne({
      phraseId,
      imageAssetId,
      translationIndex: normalizeTranslationIndex(translationIndex),
      isDeleted: { $ne: true }
    });
    return link ? toEntity(link) : null;
  }

  async updateById(id: string, update: PhraseImageLinkUpdateInput): Promise<PhraseImageLinkEntity | null> {
    const current = await PhraseImageLinkModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!current) return null;

    const nextTranslationIndex =
      update.translationIndex !== undefined
        ? normalizeTranslationIndex(update.translationIndex)
        : normalizeTranslationIndex(current.translationIndex);

    if (update.isPrimary) {
      await this.clearPrimaryForPhrase(current.phraseId.toString(), nextTranslationIndex, current._id.toString());
    }

    if (update.translationIndex !== undefined) current.translationIndex = nextTranslationIndex as never;
    if (update.imageAssetId !== undefined) current.imageAssetId = update.imageAssetId as never;
    if (update.isPrimary !== undefined) current.isPrimary = Boolean(update.isPrimary) as never;
    if (update.notes !== undefined) current.notes = String(update.notes || "") as never;

    await current.save();
    return toEntity(current.toObject() as Parameters<typeof toEntity>[0]);
  }

  async clearPrimaryForPhrase(phraseId: string, translationIndex?: number | null, excludeId?: string): Promise<void> {
    await PhraseImageLinkModel.updateMany(
      buildPrimaryFilter(phraseId, translationIndex, excludeId),
      { isPrimary: false }
    );
  }

  async softDeleteById(id: string, now: Date): Promise<PhraseImageLinkEntity | null> {
    const link = await PhraseImageLinkModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return link ? toEntity(link.toObject() as Parameters<typeof toEntity>[0]) : null;
  }

  async softDeleteByImageAssetId(imageAssetId: string, now: Date): Promise<void> {
    await PhraseImageLinkModel.updateMany(
      { imageAssetId, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }
}
