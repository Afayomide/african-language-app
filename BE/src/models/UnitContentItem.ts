import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UnitContentItemSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
    contentType: { type: String, enum: ["word", "expression", "sentence"], required: true, index: true },
    contentId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["introduce", "review"], required: true, index: true },
    orderIndex: { type: Number, default: 0, index: true },
    sourceUnitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

UnitContentItemSchema.index({ unitId: 1, orderIndex: 1, createdAt: 1 });
UnitContentItemSchema.index({ unitId: 1, contentType: 1, contentId: 1 }, { unique: true });

export type UnitContentItemDocument = InferSchemaType<typeof UnitContentItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

const UnitContentItemModel = mongoose.model("UnitContentItem", UnitContentItemSchema);

export default UnitContentItemModel;
