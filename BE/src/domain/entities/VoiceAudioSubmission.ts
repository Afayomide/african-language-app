import type { Language } from "./Lesson.js";
import type { ContentAudio, ContentType } from "./Content.js";

export type VoiceAudioSubmissionStatus = "pending" | "accepted" | "rejected";

export type VoiceAudioSubmissionEntity = {
  id: string;
  _id?: string;
  contentType: ContentType;
  contentId: string;
  voiceArtistUserId: string;
  voiceArtistProfileId: string;
  language: Language;
  audio: ContentAudio;
  status: VoiceAudioSubmissionStatus;
  rejectionReason: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};
