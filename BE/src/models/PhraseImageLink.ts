import mongoose, { Schema, type InferSchemaType } from "mongoose";

const PhraseImageLinkSchema = new Schema(
  {
    phraseId: { type: Schema.Types.ObjectId, ref: "Phrase", required: true, index: true },
    translationIndex: { type: Number, min: 0, default: null },
    imageAssetId: { type: Schema.Types.ObjectId, ref: "ImageAsset", required: true, index: true },
    isPrimary: { type: Boolean, default: false, index: true },
    notes: { type: String, default: "", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

PhraseImageLinkSchema.index({ phraseId: 1, isDeleted: 1, createdAt: -1 });
PhraseImageLinkSchema.index({ imageAssetId: 1, isDeleted: 1, createdAt: -1 });
PhraseImageLinkSchema.index({ phraseId: 1, imageAssetId: 1, translationIndex: 1, isDeleted: 1 });

export type PhraseImageLinkDocument = InferSchemaType<typeof PhraseImageLinkSchema> & {
  _id: mongoose.Types.ObjectId;
};

const PhraseImageLinkModel = mongoose.model("PhraseImageLink", PhraseImageLinkSchema);

export default PhraseImageLinkModel;
