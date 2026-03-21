import ExpressionImageLinkModel from "../../../../models/ExpressionImageLink.js";
import type { ExpressionImageLinkEntity } from "../../../../domain/entities/ExpressionImageLink.js";
import type {
  ExpressionImageLinkCreateInput,
  ExpressionImageLinkRepository,
  ExpressionImageLinkUpdateInput
} from "../../../../domain/repositories/ExpressionImageLinkRepository.js";

function normalizeTranslationIndex(value?: number | null) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function buildPrimaryFilter(expressionId: string, translationIndex?: number | null, excludeId?: string) {
  const query: Record<string, unknown> = {
    expressionId,
    isDeleted: { $ne: true },
    translationIndex: normalizeTranslationIndex(translationIndex)
  };
  if (excludeId) query._id = { $ne: excludeId };
  return query;
}

function toEntity(doc: {
  _id: { toString(): string };
  expressionId: { toString(): string };
  translationIndex?: number | null;
  imageAssetId: { toString(): string };
  isPrimary?: boolean;
  notes?: string;
  createdBy: { toString(): string };
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}): ExpressionImageLinkEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    expressionId: doc.expressionId.toString(),
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

export class MongooseExpressionImageLinkRepository implements ExpressionImageLinkRepository {
  async create(input: ExpressionImageLinkCreateInput): Promise<ExpressionImageLinkEntity> {
    const translationIndex = normalizeTranslationIndex(input.translationIndex);
    const existing = await ExpressionImageLinkModel.findOne({
      expressionId: input.expressionId,
      imageAssetId: input.imageAssetId,
      translationIndex,
      isDeleted: { $ne: true }
    });
    if (existing) {
      if (input.isPrimary) {
        await this.clearPrimaryForExpression(input.expressionId, translationIndex, existing._id.toString());
        existing.isPrimary = true as never;
      }
      if (input.notes !== undefined) existing.notes = String(input.notes || "") as never;
      await existing.save();
      return toEntity(existing.toObject() as Parameters<typeof toEntity>[0]);
    }

    if (input.isPrimary) {
      await this.clearPrimaryForExpression(input.expressionId, translationIndex);
    }

    const created = await ExpressionImageLinkModel.create({
      expressionId: input.expressionId,
      translationIndex,
      imageAssetId: input.imageAssetId,
      isPrimary: Boolean(input.isPrimary),
      notes: input.notes || "",
      createdBy: input.createdBy
    });
    return toEntity(created);
  }

  async listByExpressionId(expressionId: string): Promise<ExpressionImageLinkEntity[]> {
    const links = await ExpressionImageLinkModel.find({ expressionId, isDeleted: { $ne: true } }).sort({
      isPrimary: -1,
      createdAt: -1
    });
    return links.map(toEntity);
  }

  async listByExpressionIds(expressionIds: string[]): Promise<ExpressionImageLinkEntity[]> {
    if (!expressionIds.length) return [];
    const links = await ExpressionImageLinkModel.find({
      expressionId: { $in: expressionIds },
      isDeleted: { $ne: true }
    }).sort({ isPrimary: -1, createdAt: -1 });
    return links.map(toEntity);
  }

  async findById(id: string): Promise<ExpressionImageLinkEntity | null> {
    const link = await ExpressionImageLinkModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return link ? toEntity(link) : null;
  }

  async findActiveByExpressionAndAsset(
    expressionId: string,
    imageAssetId: string,
    translationIndex?: number | null
  ): Promise<ExpressionImageLinkEntity | null> {
    const link = await ExpressionImageLinkModel.findOne({
      expressionId,
      imageAssetId,
      translationIndex: normalizeTranslationIndex(translationIndex),
      isDeleted: { $ne: true }
    });
    return link ? toEntity(link) : null;
  }

  async updateById(id: string, update: ExpressionImageLinkUpdateInput): Promise<ExpressionImageLinkEntity | null> {
    const current = await ExpressionImageLinkModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!current) return null;

    const nextTranslationIndex =
      update.translationIndex !== undefined
        ? normalizeTranslationIndex(update.translationIndex)
        : normalizeTranslationIndex(current.translationIndex);

    if (update.isPrimary) {
      await this.clearPrimaryForExpression(current.expressionId.toString(), nextTranslationIndex, current._id.toString());
    }

    if (update.translationIndex !== undefined) current.translationIndex = nextTranslationIndex as never;
    if (update.imageAssetId !== undefined) current.imageAssetId = update.imageAssetId as never;
    if (update.isPrimary !== undefined) current.isPrimary = Boolean(update.isPrimary) as never;
    if (update.notes !== undefined) current.notes = String(update.notes || "") as never;

    await current.save();
    return toEntity(current.toObject() as Parameters<typeof toEntity>[0]);
  }

  async clearPrimaryForExpression(expressionId: string, translationIndex?: number | null, excludeId?: string): Promise<void> {
    await ExpressionImageLinkModel.updateMany(
      buildPrimaryFilter(expressionId, translationIndex, excludeId),
      { isPrimary: false }
    );
  }

  async softDeleteById(id: string, now: Date): Promise<ExpressionImageLinkEntity | null> {
    const link = await ExpressionImageLinkModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return link ? toEntity(link.toObject() as Parameters<typeof toEntity>[0]) : null;
  }

  async softDeleteByImageAssetId(imageAssetId: string, now: Date): Promise<void> {
    await ExpressionImageLinkModel.updateMany(
      { imageAssetId, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }
}
