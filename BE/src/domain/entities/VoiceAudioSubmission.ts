import type { Language } from "./Lesson.js";
import type { PhraseAudio } from "./Phrase.js";

export type VoiceAudioSubmissionStatus = "pending" | "accepted" | "rejected";

export type VoiceAudioSubmissionEntity = {
  id: string;
  _id?: string;
  phraseId: string;
  voiceArtistUserId: string;
  voiceArtistProfileId: string;
  language: Language;
  audio: PhraseAudio;
  status: VoiceAudioSubmissionStatus;
  rejectionReason: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};
