import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { ContentComponentSchema, buildBaseContentFields, normalizeContentFields } from "./shared/contentFields.js";

const ExpressionSchema = new Schema(
  {
    ...buildBaseContentFields(),
    register: { type: String, enum: ["formal", "neutral", "casual"], default: "neutral" },
    components: { type: [ContentComponentSchema], default: [] }
  },
  { timestamps: true }
);

ExpressionSchema.index({ language: 1, textNormalized: 1, isDeleted: 1 }, { unique: true });
ExpressionSchema.pre("validate", function normalizeExpression(next) {
  normalizeContentFields(this as { text?: string; textNormalized?: string; translations?: string[] });
  next();
});

export type ExpressionDocument = InferSchemaType<typeof ExpressionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ExpressionModel = mongoose.model("Expression", ExpressionSchema);

export default ExpressionModel;
