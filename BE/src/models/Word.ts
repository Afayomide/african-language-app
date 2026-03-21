import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { buildBaseContentFields, normalizeContentFields } from "./shared/contentFields.js";

const WordSchema = new Schema(
  {
    ...buildBaseContentFields(),
    lemma: { type: String, default: "" },
    partOfSpeech: { type: String, default: "" }
  },
  { timestamps: true }
);

WordSchema.index({ language: 1, textNormalized: 1, isDeleted: 1 }, { unique: true });
WordSchema.pre("validate", function normalizeWord(next) {
  normalizeContentFields(this as { text?: string; textNormalized?: string; translations?: string[] });
  next();
});

export type WordDocument = InferSchemaType<typeof WordSchema> & {
  _id: mongoose.Types.ObjectId;
};

const WordModel = mongoose.model("Word", WordSchema);

export default WordModel;
