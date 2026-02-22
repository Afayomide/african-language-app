import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";

export class AdminVoiceAudioReviewUseCases {
  constructor(
    private readonly submissions: VoiceAudioSubmissionRepository,
    private readonly phrases: PhraseRepository,
    private readonly users: UserRepository
  ) {}

  async list(filter: {
    status?: "pending" | "accepted" | "rejected";
    voiceArtistUserId?: string;
    phraseId?: string;
    language?: "yoruba" | "igbo" | "hausa";
  }) {
    const submissions = await this.submissions.list(filter);
    const phrases = await this.phrases.findByIds(submissions.map((item) => item.phraseId));
    const users = await this.users.findByIds(submissions.map((item) => item.voiceArtistUserId));

    const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));
    const userById = new Map(users.map((user) => [user.id, user]));

    return submissions.map((item) => ({
      ...item,
      phrase: phraseById.get(item.phraseId) || null,
      voiceArtist: userById.get(item.voiceArtistUserId)
        ? {
            id: userById.get(item.voiceArtistUserId)?.id,
            email: userById.get(item.voiceArtistUserId)?.email
          }
        : null
    }));
  }

  async accept(submissionId: string, adminUserId: string) {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) return null;

    const reviewed = await this.submissions.updateReview(submission.id, {
      status: "accepted",
      reviewedBy: adminUserId,
      reviewedAt: new Date()
    });

    if (!reviewed) return null;

    await this.phrases.updateById(reviewed.phraseId, { audio: reviewed.audio });
    return reviewed;
  }

  async reject(submissionId: string, adminUserId: string, reason: string) {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) return null;

    return this.submissions.updateReview(submission.id, {
      status: "rejected",
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: reason
    });
  }
}
