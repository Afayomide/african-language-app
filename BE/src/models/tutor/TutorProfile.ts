import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { LANGUAGE_VALUES } from "../../domain/entities/Lesson.js";

const TutorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    language: { type: String, enum: [...LANGUAGE_VALUES], default: null },
    displayName: { type: String, default: "" },
    isActive: { type: Boolean, default: false }
  },
  { timestamps: true }
);

TutorProfileSchema.index({ isActive: 1, createdAt: -1 });
TutorProfileSchema.index({ language: 1, isActive: 1, createdAt: -1 });

export type TutorProfileDocument = InferSchemaType<typeof TutorProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

const TutorProfileModel = mongoose.model("TutorProfile", TutorProfileSchema);

export default TutorProfileModel;
