import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ExpressionImageLinkSchema = new Schema(
  {
    expressionId: { type: Schema.Types.ObjectId, ref: "Expression", required: true, index: true },
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

ExpressionImageLinkSchema.index({ expressionId: 1, isDeleted: 1, createdAt: -1 });
ExpressionImageLinkSchema.index({ imageAssetId: 1, isDeleted: 1, createdAt: -1 });
ExpressionImageLinkSchema.index({ expressionId: 1, imageAssetId: 1, translationIndex: 1, isDeleted: 1 });

export type ExpressionImageLinkDocument = InferSchemaType<typeof ExpressionImageLinkSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ExpressionImageLinkModel = mongoose.model("ExpressionImageLink", ExpressionImageLinkSchema);

export default ExpressionImageLinkModel;
