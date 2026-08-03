import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { voiceArtistProfiles, type VoiceArtistProfileRow } from "../schema.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type { VoiceArtistProfileEntity } from "../../../../domain/entities/VoiceArtistProfile.js";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";

function toEntity(row: VoiceArtistProfileRow): VoiceArtistProfileEntity {
  return {
    id: row.id,
    _id: row.id,
    userId: String(row.userId),
    language: row.language,
    displayName: row.displayName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleVoiceArtistProfileRepository implements VoiceArtistProfileRepository {
  async findByUserId(userId: string): Promise<VoiceArtistProfileEntity | null> {
    const rows = await db
      .select()
      .from(voiceArtistProfiles)
      .where(eq(voiceArtistProfiles.userId, userId))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async create(input: {
    userId: string;
    language: Language;
    displayName: string;
    isActive: boolean;
  }): Promise<VoiceArtistProfileEntity> {
    const [row] = await db
      .insert(voiceArtistProfiles)
      .values({
        userId: input.userId,
        language: input.language,
        displayName: input.displayName ?? "",
        isActive: input.isActive
      })
      .returning();
    return toEntity(row);
  }

  async listByUserIds(userIds: string[]): Promise<VoiceArtistProfileEntity[]> {
    if (!userIds.length) return [];
    const rows = await db
      .select()
      .from(voiceArtistProfiles)
      .where(inArray(voiceArtistProfiles.userId, userIds));
    return rows.map(toEntity);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(voiceArtistProfiles).where(eq(voiceArtistProfiles.userId, userId));
  }

  async upsertByUserId(
    userId: string,
    input: { language: Language; displayName: string; isActive: boolean }
  ): Promise<VoiceArtistProfileEntity> {
    const [row] = await db
      .insert(voiceArtistProfiles)
      .values({ userId, language: input.language, displayName: input.displayName, isActive: input.isActive })
      .onConflictDoUpdate({
        target: voiceArtistProfiles.userId,
        set: {
          language: input.language,
          displayName: input.displayName,
          isActive: input.isActive,
          updatedAt: new Date()
        }
      })
      .returning();
    return toEntity(row);
  }

  async updateByUserId(
    userId: string,
    update: { language?: Language; displayName?: string; isActive?: boolean }
  ): Promise<VoiceArtistProfileEntity | null> {
    const rows = await db
      .update(voiceArtistProfiles)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(voiceArtistProfiles.userId, userId))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async list(filter?: { isActive?: boolean }): Promise<VoiceArtistProfileEntity[]> {
    const rows = await db
      .select()
      .from(voiceArtistProfiles)
      .where(filter?.isActive === undefined ? undefined : eq(voiceArtistProfiles.isActive, filter.isActive))
      .orderBy(desc(voiceArtistProfiles.createdAt));
    return rows.map(toEntity);
  }

  async updateActiveById(id: string, isActive: boolean): Promise<VoiceArtistProfileEntity | null> {
    const rows = await db
      .update(voiceArtistProfiles)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(voiceArtistProfiles.id, id))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async deleteById(id: string): Promise<VoiceArtistProfileEntity | null> {
    const rows = await db.delete(voiceArtistProfiles).where(eq(voiceArtistProfiles.id, id)).returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
