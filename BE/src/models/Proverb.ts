import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ProverbSchema = new Schema(
  {
    lessonIds: [{ type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true }],
    language: {
      type: String,
      enum: ["yoruba", "igbo", "hausa"],
      required: true,
      index: true
    },
    text: { type: String, required: true, trim: true },
    normalizedText: { type: String, required: true, trim: true, index: true },
    translation: { type: String, default: "", trim: true },
    contextNote: { type: String, default: "", trim: true },
    aiMeta: {
      generatedByAI: { type: Boolean, default: false },
      model: { type: String, default: "" },
      reviewedByAdmin: { type: Boolean, default: false }
    },
    status: {
      type: String,
      enum: ["draft", "finished", "published"],
      default: "draft",
      index: true
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ProverbSchema.pre("validate", function normalizeText(next) {
  const text = String(this.get("text") || "").trim();
  this.set("text", text);
  this.set("normalizedText", text.toLowerCase());
  const lessonIds = Array.from(
    new Set((this.get("lessonIds") || []).map((id: { toString(): string }) => id.toString()))
  );
  this.set("lessonIds", lessonIds);
  next();
});

// Fast lesson feed and moderation filters.
ProverbSchema.index({ lessonIds: 1, status: 1, isDeleted: 1, createdAt: -1 });
ProverbSchema.index({ language: 1, status: 1, isDeleted: 1, createdAt: -1 });
ProverbSchema.index({ language: 1, normalizedText: 1, isDeleted: 1 });

export type ProverbDocument = InferSchemaType<typeof ProverbSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ProverbModel = mongoose.model("Proverb", ProverbSchema);

export default ProverbModel;

