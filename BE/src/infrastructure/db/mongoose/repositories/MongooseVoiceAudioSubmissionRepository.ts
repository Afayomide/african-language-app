import VoiceAudioSubmissionModel from "../../../../models/voice/VoiceAudioSubmission.js";
import type { VoiceAudioSubmissionEntity } from "../../../../domain/entities/VoiceAudioSubmission.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";

function toEntity(doc: any): VoiceAudioSubmissionEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    phraseId: doc.phraseId.toString(),
    voiceArtistUserId: doc.voiceArtistUserId.toString(),
    voiceArtistProfileId: doc.voiceArtistProfileId.toString(),
    language: doc.language,
    audio: {
      provider: String(doc.audio?.provider || ""),
      model: String(doc.audio?.model || ""),
      voice: String(doc.audio?.voice || ""),
      locale: String(doc.audio?.locale || ""),
      format: String(doc.audio?.format || ""),
      url: String(doc.audio?.url || ""),
      s3Key: String(doc.audio?.s3Key || "")
    },
    status: doc.status,
    rejectionReason: String(doc.rejectionReason || ""),
    reviewedBy: doc.reviewedBy ? doc.reviewedBy.toString() : undefined,
    reviewedAt: doc.reviewedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseVoiceAudioSubmissionRepository implements VoiceAudioSubmissionRepository {
  async create(input: {
    phraseId: string;
    voiceArtistUserId: string;
    voiceArtistProfileId: string;
    language: "yoruba" | "igbo" | "hausa";
    audio: VoiceAudioSubmissionEntity["audio"];
  }): Promise<VoiceAudioSubmissionEntity> {
    const created = await VoiceAudioSubmissionModel.create(input);
    return toEntity(created);
  }

  async list(filter: {
    status?: "pending" | "accepted" | "rejected";
    voiceArtistUserId?: string;
    phraseId?: string;
    language?: "yoruba" | "igbo" | "hausa";
  }): Promise<VoiceAudioSubmissionEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.voiceArtistUserId) query.voiceArtistUserId = filter.voiceArtistUserId;
    if (filter.phraseId) query.phraseId = filter.phraseId;
    if (filter.language) query.language = filter.language;

    const submissions = await VoiceAudioSubmissionModel.find(query).sort({ createdAt: -1 }).lean();
    return submissions.map(toEntity);
  }

  async findById(id: string): Promise<VoiceAudioSubmissionEntity | null> {
    const submission = await VoiceAudioSubmissionModel.findById(id);
    return submission ? toEntity(submission) : null;
  }

  async updateReview(
    id: string,
    input: {
      status: "accepted" | "rejected";
      reviewedBy: string;
      reviewedAt: Date;
      rejectionReason?: string;
    }
  ): Promise<VoiceAudioSubmissionEntity | null> {
    const updated = await VoiceAudioSubmissionModel.findByIdAndUpdate(
      id,
      {
        status: input.status,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewedAt,
        rejectionReason: input.rejectionReason || ""
      },
      { new: true }
    );

    return updated ? toEntity(updated) : null;
  }
}
