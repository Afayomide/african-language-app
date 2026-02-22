import VoiceArtistProfileModel from "../../../../models/voice/VoiceArtistProfile.js";
import type { VoiceArtistProfileEntity } from "../../../../domain/entities/VoiceArtistProfile.js";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";

function toEntity(doc: {
  _id: { toString(): string };
  userId: { toString(): string };
  language: "yoruba" | "igbo" | "hausa";
  displayName: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): VoiceArtistProfileEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    language: doc.language,
    displayName: doc.displayName,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseVoiceArtistProfileRepository implements VoiceArtistProfileRepository {
  async findByUserId(userId: string): Promise<VoiceArtistProfileEntity | null> {
    const profile = await VoiceArtistProfileModel.findOne({ userId });
    return profile ? toEntity(profile) : null;
  }

  async create(input: {
    userId: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName: string;
    isActive: boolean;
  }): Promise<VoiceArtistProfileEntity> {
    const created = await VoiceArtistProfileModel.create(input);
    return toEntity(created);
  }

  async list(filter?: { isActive?: boolean }): Promise<VoiceArtistProfileEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter?.isActive !== undefined) {
      query.isActive = filter.isActive;
    }
    const profiles = await VoiceArtistProfileModel.find(query).sort({ createdAt: -1 });
    return profiles.map(toEntity);
  }

  async updateActiveById(id: string, isActive: boolean): Promise<VoiceArtistProfileEntity | null> {
    const updated = await VoiceArtistProfileModel.findByIdAndUpdate(id, { isActive }, { new: true });
    return updated ? toEntity(updated) : null;
  }

  async deleteById(id: string): Promise<VoiceArtistProfileEntity | null> {
    const profile = await VoiceArtistProfileModel.findById(id);
    if (!profile) return null;

    await VoiceArtistProfileModel.deleteOne({ _id: profile._id });
    return toEntity(profile);
  }
}
