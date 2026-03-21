import mongoose, { Schema, type InferSchemaType } from "mongoose";

const LessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], required: true },
    orderIndex: { type: Number, default: 0, index: true },
    description: { type: String, default: "" },
    topics: { type: [String], default: [] },
    kind: { type: String, enum: ["core", "review"], default: "core", index: true },
    proverbs: {
      type: [{
        text: { type: String, required: true },
        translation: { type: String, default: "" },
        contextNote: { type: String, default: "" }
      }],
      default: []
    },
    stages: {
      type: [{
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        orderIndex: { type: Number, default: 0 },
        blocks: {
          type: [{
            type: { type: String, enum: ["text", "content", "proverb", "question"], required: true },
            content: { type: String },
            contentType: { type: String, enum: ["word", "expression", "sentence"], default: null },
            refId: { type: Schema.Types.ObjectId },
            translationIndex: { type: Number, min: 0, default: 0 }
          }],
          default: []
        }
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

LessonSchema.index({ unitId: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });
LessonSchema.index({ language: 1, isDeleted: 1, orderIndex: 1, createdAt: 1 });

export type LessonDocument = InferSchemaType<typeof LessonSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LessonModel = mongoose.model("Lesson", LessonSchema);

export default LessonModel;
