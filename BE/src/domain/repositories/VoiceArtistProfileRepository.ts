import type { Language } from "../entities/Lesson.js";
import type { VoiceArtistProfileEntity } from "../entities/VoiceArtistProfile.js";

export interface VoiceArtistProfileRepository {
  findByUserId(userId: string): Promise<VoiceArtistProfileEntity | null>;
  listByUserIds(userIds: string[]): Promise<VoiceArtistProfileEntity[]>;
  deleteByUserId(userId: string): Promise<void>;
  upsertByUserId(userId: string, input: { language: Language; displayName: string; isActive: boolean }): Promise<VoiceArtistProfileEntity>;
  updateByUserId(userId: string, update: { language?: Language; displayName?: string; isActive?: boolean }): Promise<VoiceArtistProfileEntity | null>;
  create(input: {
    userId: string;
    language: Language;
    displayName: string;
    isActive: boolean;
  }): Promise<VoiceArtistProfileEntity>;
  list(filter?: { isActive?: boolean }): Promise<VoiceArtistProfileEntity[]>;
  updateActiveById(id: string, isActive: boolean): Promise<VoiceArtistProfileEntity | null>;
  deleteById(id: string): Promise<VoiceArtistProfileEntity | null>;
}
