import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { voiceAudioSubmissions, type VoiceAudioSubmissionRow } from "../schema.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  VoiceAudioSubmissionEntity,
  VoiceAudioSubmissionStatus
} from "../../../../domain/entities/VoiceAudioSubmission.js";
import type { ContentAudio, ContentType } from "../../../../domain/entities/Content.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";
import { mapContentAudio } from "./contentMappers.js";

function toEntity(row: VoiceAudioSubmissionRow): VoiceAudioSubmissionEntity {
  return {
    id: row.id,
    _id: row.id,
    contentType: row.contentType,
    contentId: String(row.contentId),
    voiceArtistUserId: String(row.voiceArtistUserId),
    voiceArtistProfileId: String(row.voiceArtistProfileId),
    language: row.language,
    audio: mapContentAudio(row.audio),
    status: row.status,
    rejectionReason: String(row.rejectionReason || ""),
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : undefined,
    reviewedAt: row.reviewedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class DrizzleVoiceAudioSubmissionRepository implements VoiceAudioSubmissionRepository {
  async create(input: {
    contentType: ContentType;
    contentId: string;
    voiceArtistUserId: string;
    voiceArtistProfileId: string;
    language: Language;
    audio: ContentAudio;
  }): Promise<VoiceAudioSubmissionEntity> {
    const [row] = await db
      .insert(voiceAudioSubmissions)
      .values({
        contentType: input.contentType,
        contentId: input.contentId,
        voiceArtistUserId: input.voiceArtistUserId,
        voiceArtistProfileId: input.voiceArtistProfileId,
        language: input.language,
        audio: mapContentAudio(input.audio)
      })
      .returning();
    return toEntity(row);
  }

  async list(filter: {
    status?: VoiceAudioSubmissionStatus;
    voiceArtistUserId?: string;
    contentType?: ContentType;
    contentId?: string;
    language?: Language;
  }): Promise<VoiceAudioSubmissionEntity[]> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.status) conditions.push(eq(voiceAudioSubmissions.status, filter.status));
    if (filter.voiceArtistUserId) {
      conditions.push(eq(voiceAudioSubmissions.voiceArtistUserId, filter.voiceArtistUserId));
    }
    if (filter.contentType) conditions.push(eq(voiceAudioSubmissions.contentType, filter.contentType));
    if (filter.contentId) conditions.push(eq(voiceAudioSubmissions.contentId, filter.contentId));
    if (filter.language) conditions.push(eq(voiceAudioSubmissions.language, filter.language));

    const rows = await db
      .select()
      .from(voiceAudioSubmissions)
      .where(conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined)
      .orderBy(desc(voiceAudioSubmissions.createdAt));
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<VoiceAudioSubmissionEntity | null> {
    const rows = await db
      .select()
      .from(voiceAudioSubmissions)
      .where(eq(voiceAudioSubmissions.id, id))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
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
    const rows = await db
      .update(voiceAudioSubmissions)
      .set({
        status: input.status,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewedAt,
        rejectionReason: input.rejectionReason || "",
        updatedAt: new Date()
      })
      .where(eq(voiceAudioSubmissions.id, id))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
