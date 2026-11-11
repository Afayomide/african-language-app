import type { ContentAudio, ContentType } from "../entities/Content.js";
import type { Language } from "../entities/Lesson.js";
import type { VoiceAudioSubmissionStatus } from "../entities/VoiceAudioSubmission.js";

/**
 * Slim reads for the voice artist screens. The full repositories load whole
 * lessons (every stage and block), unit AI plans and audio analysis, which the
 * queue never shows; reloading them on every upload is what used up the
 * database's network transfer allowance. These return only what the screens
 * display, and audio here never carries `analysis`.
 */

export type VoiceContentRef = { contentType: ContentType; contentId: string; lessonId: string };

export type VoiceLessonLabel = { id: string; _id: string; title: string; orderIndex: number; unitId: string };
export type VoiceUnitLabel = { id: string; _id: string; title: string; orderIndex: number; chapterId: string | null };
export type VoiceChapterLabel = { id: string; _id: string; title: string; orderIndex: number };

export type VoiceCurriculum = {
  lessons: VoiceLessonLabel[];
  units: VoiceUnitLabel[];
  chapters: VoiceChapterLabel[];
  /** Which content each lesson of the language uses. */
  items: VoiceContentRef[];
};

export type VoiceContentSummary = {
  id: string;
  _id: string;
  kind: ContentType;
  language: Language;
  text: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  difficulty: number;
  status: string;
  audio: Omit<ContentAudio, "analysis">;
};

export type VoiceSubmissionSummary = {
  id: string;
  _id: string;
  contentType: ContentType;
  contentId: string;
  language: Language;
  status: VoiceAudioSubmissionStatus;
  rejectionReason: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  audio: Omit<ContentAudio, "analysis">;
};

export interface VoiceWorkReadRepository {
  listCurriculum(language: Language): Promise<VoiceCurriculum>;
  /** Keyed `${contentType}:${id}`. With `needingAudio`, only rows whose audio is requested, rejected or submitted. */
  findContentSummaries(
    refs: Array<{ type: ContentType; id: string }>,
    options?: { needingAudio?: boolean }
  ): Promise<Map<string, VoiceContentSummary>>;
  /** Newest first. */
  listSubmissionSummaries(filter: {
    voiceArtistUserId: string;
    language: Language;
    status?: VoiceAudioSubmissionStatus;
  }): Promise<VoiceSubmissionSummary[]>;
}
