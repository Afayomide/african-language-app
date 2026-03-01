import mongoose, { Schema, type InferSchemaType } from "mongoose";

const LessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], required: true },
    orderIndex: { type: Number, default: 0, index: true },
    description: { type: String, default: "" },
    topics: { type: [String], default: [] },
    proverbs: {
      type: [{
        text: { type: String, required: true },
        translation: { type: String, default: "" },
        contextNote: { type: String, default: "" }
      }],
      default: []
    },
    blocks: {
      type: [{
        type: { type: String, enum: ["text", "phrase", "proverb", "question"], required: true },
        content: { type: String }, // For 'text' blocks
        refId: { type: Schema.Types.ObjectId } // Generic ref, logic handled in controller/service
      }],
      default: []
    },
    status: { type: String, enum: ["draft", "finished", "published"], default: "draft" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

// Supports language-scoped listing and ordering.
LessonSchema.index({ language: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });

export type LessonDocument = InferSchemaType<typeof LessonSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LessonModel = mongoose.model("Lesson", LessonSchema);

export default LessonModel;
