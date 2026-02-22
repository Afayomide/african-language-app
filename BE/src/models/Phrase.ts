import mongoose, { Schema, type InferSchemaType } from "mongoose";

const PhraseSchema = new Schema(
  {
    lessonIds: [{ type: Schema.Types.ObjectId, ref: "Lesson", default: [] }],
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    text: { type: String, required: true, trim: true },
    translation: { type: String, required: true, trim: true },
    pronunciation: { type: String, default: "" },
    explanation: { type: String, default: "" },
    examples: [
      {
        original: { type: String, default: "" },
        translation: { type: String, default: "" }
      }
    ],
    difficulty: { type: Number, min: 1, max: 5, default: 1 },
    aiMeta: {
      generatedByAI: { type: Boolean, default: false },
      model: { type: String, default: "" },
      reviewedByAdmin: { type: Boolean, default: false }
    },
    audio: {
      provider: { type: String, default: "" },
      model: { type: String, default: "" },
      voice: { type: String, default: "" },
      locale: { type: String, default: "" },
      format: { type: String, default: "" },
      url: { type: String, default: "" },
      s3Key: { type: String, default: "" }
    },
    status: { type: String, enum: ["draft", "finished", "published"], default: "draft" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Optimized for phrase listing/filtering paths used by admin/tutor/learner APIs.
PhraseSchema.index({ lessonIds: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ lessonIds: 1, status: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ language: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ language: 1, status: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });

export type PhraseDocument = InferSchemaType<typeof PhraseSchema> & {
  _id: mongoose.Types.ObjectId;
};

const PhraseModel = mongoose.model("Phrase", PhraseSchema);

export default PhraseModel;
