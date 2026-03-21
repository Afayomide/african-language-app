import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { ContentComponentSchema, buildBaseContentFields, normalizeContentFields } from "./shared/contentFields.js";

const SentenceSchema = new Schema(
  {
    ...buildBaseContentFields(),
    literalTranslation: { type: String, default: "" },
    usageNotes: { type: String, default: "" },
    components: { type: [ContentComponentSchema], default: [] }
  },
  { timestamps: true }
);

SentenceSchema.index({ language: 1, textNormalized: 1, isDeleted: 1 }, { unique: true });
SentenceSchema.pre("validate", function normalizeSentence(next) {
  normalizeContentFields(this as { text?: string; textNormalized?: string; translations?: string[] });
  next();
});

export type SentenceDocument = InferSchemaType<typeof SentenceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const SentenceModel = mongoose.model("Sentence", SentenceSchema);

export default SentenceModel;
