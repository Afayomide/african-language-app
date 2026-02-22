import mongoose, { Schema, type InferSchemaType } from "mongoose";

const TutorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true },
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
