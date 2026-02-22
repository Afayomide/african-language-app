import type { Language } from "../entities/Lesson.js";
import type {
  VoiceAudioSubmissionEntity,
  VoiceAudioSubmissionStatus
} from "../entities/VoiceAudioSubmission.js";
import type { PhraseAudio } from "../entities/Phrase.js";

export interface VoiceAudioSubmissionRepository {
  create(input: {
    phraseId: string;
    voiceArtistUserId: string;
    voiceArtistProfileId: string;
    language: Language;
    audio: PhraseAudio;
  }): Promise<VoiceAudioSubmissionEntity>;
  list(filter: {
    status?: VoiceAudioSubmissionStatus;
    voiceArtistUserId?: string;
    phraseId?: string;
    language?: Language;
  }): Promise<VoiceAudioSubmissionEntity[]>;
  findById(id: string): Promise<VoiceAudioSubmissionEntity | null>;
  updateReview(
    id: string,
    input: {
      status: "accepted" | "rejected";
      reviewedBy: string;
      reviewedAt: Date;
      rejectionReason?: string;
    }
  ): Promise<VoiceAudioSubmissionEntity | null>;
}
