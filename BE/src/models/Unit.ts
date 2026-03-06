import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UnitSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], required: true, index: true },
    orderIndex: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["draft", "finished", "published"], default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

UnitSchema.index({ language: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });

export type UnitDocument = InferSchemaType<typeof UnitSchema> & {
  _id: mongoose.Types.ObjectId;
};

const UnitModel = mongoose.model("Unit", UnitSchema);

export default UnitModel;
