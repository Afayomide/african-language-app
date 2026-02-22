import mongoose, { Schema, type InferSchemaType } from "mongoose";

const AudioMetaSchema = new Schema(
  {
    provider: { type: String, default: "manual_upload" },
    model: { type: String, default: "" },
    voice: { type: String, default: "" },
    locale: { type: String, default: "" },
    format: { type: String, default: "" },
    url: { type: String, default: "" },
    s3Key: { type: String, default: "" }
  },
  { _id: false }
);

const VoiceAudioSubmissionSchema = new Schema(
  {
    phraseId: { type: Schema.Types.ObjectId, ref: "Phrase", required: true, index: true },
    voiceArtistUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    voiceArtistProfileId: {
      type: Schema.Types.ObjectId,
      ref: "VoiceArtistProfile",
      required: true,
      index: true
    },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    audio: { type: AudioMetaSchema, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true
    },
    rejectionReason: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

VoiceAudioSubmissionSchema.index({ status: 1, createdAt: -1 });
VoiceAudioSubmissionSchema.index({ voiceArtistUserId: 1, status: 1, createdAt: -1 });
VoiceAudioSubmissionSchema.index({ phraseId: 1, status: 1, createdAt: -1 });

export type VoiceAudioSubmissionDocument = InferSchemaType<typeof VoiceAudioSubmissionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const VoiceAudioSubmissionModel = mongoose.model("VoiceAudioSubmission", VoiceAudioSubmissionSchema);

export default VoiceAudioSubmissionModel;
