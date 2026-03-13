import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ImageAssetSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, default: "", trim: true },
    storageKey: { type: String, default: "", trim: true },
    mimeType: { type: String, required: true, trim: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    description: { type: String, default: "", trim: true },
    altText: { type: String, required: true, trim: true },
    tags: { type: [{ type: String, trim: true }], default: [] },
    languageNeutralLabel: { type: String, default: "", trim: true },
    status: { type: String, enum: ["draft", "approved"], default: "draft", index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ImageAssetSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
ImageAssetSchema.index({ uploadedBy: 1, isDeleted: 1, createdAt: -1 });

ImageAssetSchema.pre("validate", function normalizeImageAsset(next) {
  const doc = this as {
    tags?: string[];
    description?: string;
    altText?: string;
    languageNeutralLabel?: string;
  };
  doc.tags = Array.isArray(doc.tags)
    ? Array.from(new Set(doc.tags.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  doc.description = String(doc.description || "").trim();
  doc.altText = String(doc.altText || "").trim();
  doc.languageNeutralLabel = String(doc.languageNeutralLabel || "").trim();
  next();
});

export type ImageAssetDocument = InferSchemaType<typeof ImageAssetSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ImageAssetModel = mongoose.model("ImageAsset", ImageAssetSchema);

export default ImageAssetModel;
