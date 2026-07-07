import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { LANGUAGE_VALUES } from "../../domain/entities/Lesson.js";

const VoiceArtistProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    language: { type: String, enum: [...LANGUAGE_VALUES], required: true },
    displayName: { type: String, default: "" },
    isActive: { type: Boolean, default: false }
  },
  { timestamps: true }
);

VoiceArtistProfileSchema.index({ language: 1, isActive: 1, createdAt: -1 });

export type VoiceArtistProfileDocument = InferSchemaType<typeof VoiceArtistProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

const VoiceArtistProfileModel = mongoose.model("VoiceArtistProfile", VoiceArtistProfileSchema);

export default VoiceArtistProfileModel;
