import mongoose, { Schema, type InferSchemaType } from "mongoose";

const LessonContentItemSchema = new Schema(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
    contentType: { type: String, enum: ["word", "expression", "sentence"], required: true, index: true },
    contentId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["introduce", "review", "practice"], required: true, index: true },
    stageIndex: { type: Number, default: null },
    orderIndex: { type: Number, default: 0, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

LessonContentItemSchema.index({ lessonId: 1, orderIndex: 1, createdAt: 1 });
LessonContentItemSchema.index({ lessonId: 1, contentType: 1, contentId: 1 }, { unique: true });

export type LessonContentItemDocument = InferSchemaType<typeof LessonContentItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LessonContentItemModel = mongoose.model("LessonContentItem", LessonContentItemSchema);

export default LessonContentItemModel;
