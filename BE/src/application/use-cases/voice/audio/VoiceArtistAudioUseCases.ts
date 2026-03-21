import type { ChapterRepository } from "../../../../domain/repositories/ChapterRepository.js";
import type { ContentAudio, ContentType } from "../../../../domain/entities/Content.js";
import type { LessonContentItemEntity } from "../../../../domain/entities/LessonContentItem.js";
import type { LessonContentItemRepository } from "../../../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import { ContentLookupService } from "../../../services/ContentLookupService.js";

function contentKey(contentType: ContentType, contentId: string) {
  return `${contentType}:${contentId}`;
}

export class VoiceArtistAudioUseCases {
  private readonly contentLookup: ContentLookupService;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly chapters: ChapterRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly voiceProfiles: VoiceArtistProfileRepository,
    private readonly submissions: VoiceAudioSubmissionRepository
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  private buildScopedLessonMaps(profileLanguage: "yoruba" | "igbo" | "hausa") {
    return Promise.all([
      this.lessons.listByLanguage(profileLanguage),
      this.units.listByLanguage(profileLanguage),
      this.chapters.listByLanguage(profileLanguage)
    ]);
  }

  private async loadScopedContentItems(
    profileLanguage: "yoruba" | "igbo" | "hausa"
  ): Promise<{
    lessons: Awaited<ReturnType<LessonRepository["listByLanguage"]>>;
    units: Awaited<ReturnType<UnitRepository["listByLanguage"]>>;
    chapters: Awaited<ReturnType<ChapterRepository["listByLanguage"]>>;
    scopedItems: LessonContentItemEntity[];
  }> {
    const [lessons, units, chapters] = await this.buildScopedLessonMaps(profileLanguage);
    const lessonIdSet = new Set(lessons.map((lesson) => lesson.id));
    const contentItems = await this.lessonContentItems.list({});
    const scopedItems = contentItems.filter((item) => lessonIdSet.has(item.lessonId));
    return { lessons, units, chapters, scopedItems };
  }

  async listQueueContent(userId: string) {
    const profile = await this.voiceProfiles.findByUserId(userId);
    if (!profile || !profile.isActive) return null;

    const { lessons, units, chapters, scopedItems } = await this.loadScopedContentItems(profile.language);
    const refs = Array.from(
      new Map(
        scopedItems.map((item) => [contentKey(item.contentType, item.contentId), { type: item.contentType, id: item.contentId }])
      ).values()
    );
    const contentByKey = await this.contentLookup.findMany(refs);
    const submissions = await this.submissions.list({ voiceArtistUserId: userId, language: profile.language });

    const latestByContent = new Map<string, (typeof submissions)[number]>();
    for (const submission of submissions) {
      const key = contentKey(submission.contentType, submission.contentId);
      if (!latestByContent.has(key)) latestByContent.set(key, submission);
    }

    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const queue = refs
      .map((ref) => {
        const content = contentByKey.get(contentKey(ref.type, ref.id));
        if (!content) return null;
        const audio = content.audio || {};
        const needsAudio =
          (audio.workflowStatus === "requested" || audio.workflowStatus === "rejected" || audio.workflowStatus === "submitted") &&
          !(audio.referenceType === "human_reference" && audio.reviewStatus === "accepted" && audio.url);
        if (!needsAudio) return null;

        const linkedLessonIds = scopedItems.filter((item) => item.contentType === ref.type && item.contentId === ref.id).map((item) => item.lessonId);
        const linkedLessons = linkedLessonIds.map((lessonId) => lessonById.get(lessonId)).filter(Boolean);
        const linkedUnits = Array.from(
          new Map(
            linkedLessons
              .map((lesson) => lesson?.unitId)
              .filter(Boolean)
              .map((unitId) => [String(unitId), unitById.get(String(unitId))])
          ).values()
        ).filter(Boolean);
        const linkedChapters = Array.from(
          new Map(
            linkedUnits
              .map((unit) => unit?.chapterId)
              .filter(Boolean)
              .map((chapterId) => [String(chapterId), chapterById.get(String(chapterId))])
          ).values()
        ).filter(Boolean);

        return {
          contentType: ref.type,
          content,
          lessons: linkedLessons,
          units: linkedUnits,
          chapters: linkedChapters,
          latestSubmission: latestByContent.get(contentKey(ref.type, ref.id)) || null
        };
      })
      .filter(
        (
          item
        ): item is {
          contentType: ContentType;
          content: NonNullable<Awaited<ReturnType<ContentLookupService["findByRef"]>>>;
          lessons: NonNullable<Awaited<ReturnType<LessonRepository["listByLanguage"]>>>[number][];
          units: NonNullable<Awaited<ReturnType<UnitRepository["listByLanguage"]>>>[number][];
          chapters: NonNullable<Awaited<ReturnType<ChapterRepository["listByLanguage"]>>>[number][];
          latestSubmission: (typeof submissions)[number] | null;
        } => Boolean(item)
      );

    return { profile, queue };
  }

  async createSubmission(input: { userId: string; contentType: ContentType; contentId: string; audio: ContentAudio }) {
    const profile = await this.voiceProfiles.findByUserId(input.userId);
    if (!profile || !profile.isActive) return "profile_inactive" as const;

    const content = await this.contentLookup.findByRef(input.contentType, input.contentId);
    if (!content) return "content_not_found" as const;
    if (content.language !== profile.language) return "content_out_of_scope" as const;

    const created = await this.submissions.create({
      contentType: input.contentType,
      contentId: content.id,
      voiceArtistUserId: input.userId,
      voiceArtistProfileId: profile.id,
      language: profile.language,
      audio: {
        ...input.audio,
        referenceType: "human_reference",
        workflowStatus: "submitted",
        reviewStatus: "pending"
      }
    });

    return created;
  }

  async listOwnSubmissions(userId: string, status?: "pending" | "accepted" | "rejected") {
    const profile = await this.voiceProfiles.findByUserId(userId);
    if (!profile || !profile.isActive) return null;

    const submissions = await this.submissions.list({
      voiceArtistUserId: userId,
      status,
      language: profile.language
    });

    const refs = submissions.map((item) => ({ type: item.contentType, id: item.contentId }));
    const contentByKey = await this.contentLookup.findMany(refs);
    const { lessons, units, chapters, scopedItems } = await this.loadScopedContentItems(profile.language);
    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));

    return {
      profile,
      submissions: submissions.map((submission) => {
        const content = contentByKey.get(contentKey(submission.contentType, submission.contentId)) || null;
        const linkedLessonIds = scopedItems
          .filter((item) => item.contentType === submission.contentType && item.contentId === submission.contentId)
          .map((item) => item.lessonId);
        const linkedLessons = linkedLessonIds.map((lessonId) => lessonById.get(lessonId)).filter(Boolean);
        const linkedUnits = Array.from(
          new Map(
            linkedLessons
              .map((lesson) => lesson?.unitId)
              .filter(Boolean)
              .map((unitId) => [String(unitId), unitById.get(String(unitId))])
          ).values()
        ).filter(Boolean);
        const linkedChapters = Array.from(
          new Map(
            linkedUnits
              .map((unit) => unit?.chapterId)
              .filter(Boolean)
              .map((chapterId) => [String(chapterId), chapterById.get(String(chapterId))])
          ).values()
        ).filter(Boolean);

        return {
          ...submission,
          content,
          lessons: linkedLessons,
          units: linkedUnits,
          chapters: linkedChapters
        };
      })
    };
  }
}
