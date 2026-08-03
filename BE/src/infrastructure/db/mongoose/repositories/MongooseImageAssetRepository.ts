import ImageAssetModel from "../../../../models/ImageAsset.js";
import type { ImageAssetEntity } from "../../../../domain/entities/ImageAsset.js";
import type {
  ImageAssetCreateInput,
  ImageAssetListFilter,
  ImageAssetPageFilter,
  ImageAssetRepository,
  ImageAssetUpdateInput
} from "../../../../domain/repositories/ImageAssetRepository.js";
import type { PagedResult } from "../../../../domain/repositories/pagination.js";
import { searchRegex } from "../../../../utils/search.js";

function toEntity(doc: {
  _id: { toString(): string };
  url: string;
  thumbnailUrl?: string;
  storageKey?: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  description?: string;
  altText: string;
  tags?: string[];
  languageNeutralLabel?: string;
  status: "draft" | "approved";
  uploadedBy: { toString(): string };
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}): ImageAssetEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    url: String(doc.url || ""),
    thumbnailUrl: String(doc.thumbnailUrl || ""),
    storageKey: String(doc.storageKey || ""),
    mimeType: String(doc.mimeType || ""),
    width: doc.width ?? undefined,
    height: doc.height ?? undefined,
    description: String(doc.description || ""),
    altText: String(doc.altText || ""),
    tags: Array.isArray(doc.tags) ? doc.tags.map((item) => String(item || "").trim()).filter(Boolean) : [],
    languageNeutralLabel: String(doc.languageNeutralLabel || ""),
    status: doc.status,
    uploadedBy: doc.uploadedBy.toString(),
    deletedAt: doc.deletedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseImageAssetRepository implements ImageAssetRepository {
  async create(input: ImageAssetCreateInput): Promise<ImageAssetEntity> {
    const created = await ImageAssetModel.create({
      url: input.url,
      thumbnailUrl: input.thumbnailUrl || "",
      storageKey: input.storageKey || "",
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      description: input.description || "",
      altText: input.altText,
      tags: input.tags || [],
      languageNeutralLabel: input.languageNeutralLabel || "",
      status: input.status || "draft",
      uploadedBy: input.uploadedBy
    });
    return toEntity(created);
  }

  async list(filter: ImageAssetListFilter = {}): Promise<ImageAssetEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.status) query.status = filter.status;
    if (filter.uploadedBy) query.uploadedBy = filter.uploadedBy;
    if (Array.isArray(filter.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    const assets = await ImageAssetModel.find(query).sort({ createdAt: -1 });
    return assets.map(toEntity);
  }

  async listPaged(filter: ImageAssetPageFilter): Promise<PagedResult<ImageAssetEntity>> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.status) query.status = filter.status;
    if (filter.uploadedBy) query.uploadedBy = filter.uploadedBy;
    if (Array.isArray(filter.ids) && filter.ids.length > 0) query._id = { $in: filter.ids };
    if (filter.search) {
      const regex = searchRegex(filter.search);
      query.$or = [
        { description: regex },
        { altText: regex },
        { tags: regex },
        { languageNeutralLabel: regex },
        { mimeType: regex }
      ];
    }

    const total = await ImageAssetModel.countDocuments(query);
    const limit = Math.max(1, filter.limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, filter.page), totalPages);
    const rows = await ImageAssetModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { items: rows.map(toEntity), total };
  }

  async findById(id: string): Promise<ImageAssetEntity | null> {
    const asset = await ImageAssetModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return asset ? toEntity(asset) : null;
  }

  async findByIds(ids: string[]): Promise<ImageAssetEntity[]> {
    if (!ids.length) return [];
    const assets = await ImageAssetModel.find({ _id: { $in: ids }, isDeleted: { $ne: true } });
    return assets.map(toEntity);
  }

  async updateById(id: string, update: ImageAssetUpdateInput): Promise<ImageAssetEntity | null> {
    const current = await ImageAssetModel.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!current) return null;

    if (update.url !== undefined) current.url = update.url as never;
    if (update.thumbnailUrl !== undefined) current.thumbnailUrl = update.thumbnailUrl as never;
    if (update.storageKey !== undefined) current.storageKey = update.storageKey as never;
    if (update.mimeType !== undefined) current.mimeType = update.mimeType as never;
    if (update.width !== undefined) current.width = update.width as never;
    if (update.height !== undefined) current.height = update.height as never;
    if (update.description !== undefined) current.description = update.description as never;
    if (update.altText !== undefined) current.altText = update.altText as never;
    if (update.tags !== undefined) current.tags = update.tags as never;
    if (update.languageNeutralLabel !== undefined) current.languageNeutralLabel = update.languageNeutralLabel as never;
    if (update.status !== undefined) current.status = update.status as never;

    await current.save();
    return toEntity(current.toObject() as Parameters<typeof toEntity>[0]);
  }

  async softDeleteById(id: string, now: Date): Promise<ImageAssetEntity | null> {
    const asset = await ImageAssetModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return asset ? toEntity(asset.toObject() as Parameters<typeof toEntity>[0]) : null;
  }
}
