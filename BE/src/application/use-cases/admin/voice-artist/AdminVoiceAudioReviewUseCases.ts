import type { ContentType } from "../../../../domain/entities/Content.js";
import type { UserRepository } from "../../../../domain/repositories/UserRepository.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import { ContentLookupService } from "../../../services/ContentLookupService.js";

export class AdminVoiceAudioReviewUseCases {
  private readonly contentLookup: ContentLookupService;

  constructor(
    private readonly submissions: VoiceAudioSubmissionRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly users: UserRepository
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  async list(filter: {
    status?: "pending" | "accepted" | "rejected";
    voiceArtistUserId?: string;
    contentType?: ContentType;
    contentId?: string;
    language?: "yoruba" | "igbo" | "hausa";
  }) {
    const submissions = await this.submissions.list(filter);
    const users = await this.users.findByIds(submissions.map((item) => item.voiceArtistUserId));
    const contentByKey = await this.contentLookup.findMany(
      submissions.map((item) => ({ type: item.contentType, id: item.contentId }))
    );
    const userById = new Map(users.map((user) => [user.id, user]));

    return submissions.map((item) => ({
      ...item,
      content: contentByKey.get(`${item.contentType}:${item.contentId}`) || null,
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

    await this.contentLookup.updateAudioByRef(reviewed.contentType, reviewed.contentId, {
      ...reviewed.audio,
      referenceType: "human_reference",
      workflowStatus: "accepted",
      reviewStatus: "accepted"
    });
    return reviewed;
  }

  async reject(submissionId: string, adminUserId: string, reason: string) {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) return null;

    const reviewed = await this.submissions.updateReview(submission.id, {
      status: "rejected",
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: reason
    });
    if (!reviewed) return null;

    const content = await this.contentLookup.findByRef(reviewed.contentType, reviewed.contentId);
    if (content) {
      await this.contentLookup.updateAudioByRef(reviewed.contentType, reviewed.contentId, {
        ...content.audio,
        workflowStatus: "requested",
        reviewStatus: "rejected",
        referenceType: content.audio?.referenceType || "none"
      });
    }

    return reviewed;
  }
}
