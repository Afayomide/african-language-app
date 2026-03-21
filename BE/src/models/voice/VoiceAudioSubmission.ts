import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  CONTENT_AUDIO_REFERENCE_TYPE_VALUES,
  CONTENT_AUDIO_REVIEW_STATUS_VALUES,
  CONTENT_AUDIO_WORKFLOW_STATUS_VALUES,
  ContentAudioSchema
} from "../shared/contentFields.js";

const CONTENT_TYPE_VALUES = ["word", "expression", "sentence"] as const;

const VoiceAudioSubmissionSchema = new Schema(
  {
    contentType: { type: String, enum: CONTENT_TYPE_VALUES, required: true, index: true },
    contentId: { type: Schema.Types.ObjectId, required: true, index: true },
    voiceArtistUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    voiceArtistProfileId: {
      type: Schema.Types.ObjectId,
      ref: "VoiceArtistProfile",
      required: true,
      index: true
    },
    language: { type: String, enum: ["yoruba", "igbo", "hausa"], required: true, index: true },
    audio: {
      type: ContentAudioSchema,
      required: true,
      default: () => ({
        provider: "manual_upload",
        model: "",
        voice: "",
        locale: "",
        format: "",
        url: "",
        s3Key: "",
        referenceType: CONTENT_AUDIO_REFERENCE_TYPE_VALUES[2],
        workflowStatus: CONTENT_AUDIO_WORKFLOW_STATUS_VALUES[3],
        reviewStatus: CONTENT_AUDIO_REVIEW_STATUS_VALUES[1]
      })
    },
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
VoiceAudioSubmissionSchema.index({ contentType: 1, contentId: 1, status: 1, createdAt: -1 });

export type VoiceAudioSubmissionDocument = InferSchemaType<typeof VoiceAudioSubmissionSchema> & {
  _id: mongoose.Types.ObjectId;
};

const VoiceAudioSubmissionModel = mongoose.model("VoiceAudioSubmission", VoiceAudioSubmissionSchema);

export default VoiceAudioSubmissionModel;
