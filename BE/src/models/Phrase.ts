import mongoose, { Schema, type InferSchemaType } from "mongoose";

const PhraseSchema = new Schema(
  {
    lessonIds: [{ type: Schema.Types.ObjectId, ref: "Lesson", default: [] }],
    introducedLessonIds: [{ type: Schema.Types.ObjectId, ref: "Lesson", default: [] }],
    deletedLessonIds: [{ type: Schema.Types.ObjectId, ref: "Lesson", default: [] }],
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    text: { type: String, required: true, trim: true },
    textNormalized: { type: String, required: true, trim: true, index: true },
    translations: {
      type: [{ type: String, trim: true }],
      default: [],
      validate: {
        validator(value: string[]) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one translation is required"
      }
    },
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
PhraseSchema.index({ introducedLessonIds: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ deletedLessonIds: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ lessonIds: 1, status: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ language: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ language: 1, status: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
PhraseSchema.index({ language: 1, textNormalized: 1, isDeleted: 1 }, { unique: true });

PhraseSchema.pre("validate", function normalizePhraseFields(next) {
  const doc = this as {
    text?: string;
    textNormalized?: string;
    translations?: string[];
  };
  const normalizedText = String(doc.text || "").trim();
  doc.text = normalizedText;
  doc.textNormalized = normalizedText.toLowerCase();

  const uniqueTranslations = Array.isArray(doc.translations)
    ? Array.from(new Set(doc.translations.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  doc.translations = uniqueTranslations;
  next();
});

export type PhraseDocument = InferSchemaType<typeof PhraseSchema> & {
  _id: mongoose.Types.ObjectId;
};

const PhraseModel = mongoose.model("Phrase", PhraseSchema);

export default PhraseModel;
