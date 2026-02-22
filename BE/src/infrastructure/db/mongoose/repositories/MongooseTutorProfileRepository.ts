import TutorProfileModel from "../../../../models/tutor/TutorProfile.js";
import type { TutorProfileEntity } from "../../../../domain/entities/TutorProfile.js";
import type { TutorProfileRepository } from "../../../../domain/repositories/TutorProfileRepository.js";

function toEntity(doc: {
  _id: { toString(): string };
  userId: { toString(): string };
  language: "yoruba" | "igbo" | "hausa";
  displayName: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): TutorProfileEntity {
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

export class MongooseTutorProfileRepository implements TutorProfileRepository {
  async findByUserId(userId: string): Promise<TutorProfileEntity | null> {
    const profile = await TutorProfileModel.findOne({ userId });
    return profile ? toEntity(profile) : null;
  }

  async list(filter?: { isActive?: boolean }): Promise<TutorProfileEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter?.isActive !== undefined) {
      query.isActive = filter.isActive;
    }
    const profiles = await TutorProfileModel.find(query).sort({ createdAt: -1 });
    return profiles.map(toEntity);
  }

  async updateActiveById(id: string, isActive: boolean): Promise<TutorProfileEntity | null> {
    const profile = await TutorProfileModel.findByIdAndUpdate(id, { isActive }, { new: true });
    return profile ? toEntity(profile) : null;
  }

  async deleteById(id: string): Promise<TutorProfileEntity | null> {
    const profile = await TutorProfileModel.findById(id);
    if (!profile) return null;

    await TutorProfileModel.deleteOne({ _id: profile._id });
    return toEntity(profile);
  }

  async create(input: {
    userId: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName: string;
    isActive: boolean;
  }): Promise<TutorProfileEntity> {
    const created = await TutorProfileModel.create(input);
    return toEntity(created);
  }
}
