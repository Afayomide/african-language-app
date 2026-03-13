export type ImageAssetStatus = "draft" | "approved";

export type ImageAssetEntity = {
  id: string;
  _id?: string;
  url: string;
  thumbnailUrl: string;
  storageKey: string;
  mimeType: string;
  width?: number;
  height?: number;
  description: string;
  altText: string;
  tags: string[];
  languageNeutralLabel: string;
  status: ImageAssetStatus;
  uploadedBy: string;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};
