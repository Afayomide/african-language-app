import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { LANGUAGE_VALUES, LEVEL_VALUES, STATUS_VALUES } from "../domain/entities/Lesson.js";

const ChapterSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    languageId: { type: Schema.Types.ObjectId, ref: "Language", default: null, index: true },
    language: { type: String, enum: [...LANGUAGE_VALUES], required: true, index: true },
    level: { type: String, enum: [...LEVEL_VALUES], required: true, index: true },
    orderIndex: { type: Number, default: 0, index: true },
    status: { type: String, enum: [...STATUS_VALUES], default: "draft", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ChapterSchema.index({ language: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });
ChapterSchema.index({ languageId: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });

export type ChapterDocument = InferSchemaType<typeof ChapterSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ChapterModel = mongoose.model("Chapter", ChapterSchema);

export default ChapterModel;
