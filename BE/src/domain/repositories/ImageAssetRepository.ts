import type { ImageAssetEntity, ImageAssetStatus } from "../entities/ImageAsset.js";

export type ImageAssetCreateInput = {
  url: string;
  thumbnailUrl?: string;
  storageKey?: string;
  mimeType: string;
  width?: number;
  height?: number;
  description?: string;
  altText: string;
  tags?: string[];
  languageNeutralLabel?: string;
  status?: ImageAssetStatus;
  uploadedBy: string;
};

export type ImageAssetUpdateInput = Partial<{
  url: string;
  thumbnailUrl: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  description: string;
  altText: string;
  tags: string[];
  languageNeutralLabel: string;
  status: ImageAssetStatus;
}>;

export type ImageAssetListFilter = {
  status?: ImageAssetStatus;
  uploadedBy?: string;
  ids?: string[];
};

export interface ImageAssetRepository {
  create(input: ImageAssetCreateInput): Promise<ImageAssetEntity>;
  list(filter?: ImageAssetListFilter): Promise<ImageAssetEntity[]>;
  findById(id: string): Promise<ImageAssetEntity | null>;
  findByIds(ids: string[]): Promise<ImageAssetEntity[]>;
  updateById(id: string, update: ImageAssetUpdateInput): Promise<ImageAssetEntity | null>;
  softDeleteById(id: string, now: Date): Promise<ImageAssetEntity | null>;
}
