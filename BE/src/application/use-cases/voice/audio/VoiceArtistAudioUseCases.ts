import type { ContentAudio, ContentType } from "../../../../domain/entities/Content.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";
import type {
  VoiceChapterLabel,
  VoiceContentSummary,
  VoiceCurriculum,
  VoiceLessonLabel,
  VoiceSubmissionSummary,
  VoiceUnitLabel,
  VoiceWorkReadRepository
} from "../../../../domain/repositories/VoiceWorkReadRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import { ContentLookupService } from "../../../services/ContentLookupService.js";

function contentKey(contentType: ContentType, contentId: string) {
  return `${contentType}:${contentId}`;
}

type CurriculumLinks = { lessons: VoiceLessonLabel[]; units: VoiceUnitLabel[]; chapters: VoiceChapterLabel[] };

/** For each piece of content, the lessons that use it and the units and chapters above them. */
function buildLinker(curriculum: VoiceCurriculum) {
  const lessonById = new Map(curriculum.lessons.map((lesson) => [lesson.id, lesson]));
  const unitById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const chapterById = new Map(curriculum.chapters.map((chapter) => [chapter.id, chapter]));
  const lessonIdsByContent = new Map<string, string[]>();
  for (const item of curriculum.items) {
    const key = contentKey(item.contentType, item.contentId);
    const list = lessonIdsByContent.get(key);
    if (list) list.push(item.lessonId);
    else lessonIdsByContent.set(key, [item.lessonId]);
  }

  return (contentType: ContentType, contentId: string): CurriculumLinks => {
    const lessons = (lessonIdsByContent.get(contentKey(contentType, contentId)) ?? [])
      .map((lessonId) => lessonById.get(lessonId))
      .filter((lesson): lesson is VoiceLessonLabel => Boolean(lesson));
    const units = Array.from(new Set(lessons.map((lesson) => lesson.unitId)))
      .map((unitId) => unitById.get(unitId))
      .filter((unit): unit is VoiceUnitLabel => Boolean(unit));
    const chapters = Array.from(new Set(units.map((unit) => unit.chapterId).filter((id): id is string => Boolean(id))))
      .map((chapterId) => chapterById.get(chapterId))
      .filter((chapter): chapter is VoiceChapterLabel => Boolean(chapter));
    return { lessons, units, chapters };
  };
}

export type VoiceQueueItem = CurriculumLinks & {
  contentType: ContentType;
  content: VoiceContentSummary;
  latestSubmission: VoiceSubmissionSummary | null;
};

export type VoiceOwnSubmission = VoiceSubmissionSummary & CurriculumLinks & { content: VoiceContentSummary | null };

export class VoiceArtistAudioUseCases {
  private readonly contentLookup: ContentLookupService;

  constructor(
    private readonly reads: VoiceWorkReadRepository,
    words: WordRepository,
    expressions: ExpressionRepository,
    sentences: SentenceRepository,
    private readonly voiceProfiles: VoiceArtistProfileRepository,
    private readonly submissions: VoiceAudioSubmissionRepository
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  async listQueueContent(userId: string) {
    const profile = await this.voiceProfiles.findByUserId(userId);
    if (!profile || !profile.isActive) return null;

    const curriculum = await this.reads.listCurriculum(profile.language);
    const refs = Array.from(
      new Map(
        curriculum.items.map((item) => [contentKey(item.contentType, item.contentId), { type: item.contentType, id: item.contentId }])
      ).values()
    );
    const [contentByKey, submissions] = await Promise.all([
      this.reads.findContentSummaries(refs, { needingAudio: true }),
      this.reads.listSubmissionSummaries({ voiceArtistUserId: userId, language: profile.language })
    ]);

    const latestByContent = new Map<string, VoiceSubmissionSummary>();
    for (const submission of submissions) {
      const key = contentKey(submission.contentType, submission.contentId);
      if (!latestByContent.has(key)) latestByContent.set(key, submission);
    }

    const link = buildLinker(curriculum);
    const queue: VoiceQueueItem[] = [];
    for (const ref of refs) {
      const content = contentByKey.get(contentKey(ref.type, ref.id));
      if (!content) continue;
      const audio = content.audio;
      if (audio.referenceType === "human_reference" && audio.reviewStatus === "accepted" && audio.url) continue;
      queue.push({
        contentType: ref.type,
        content,
        ...link(ref.type, ref.id),
        latestSubmission: latestByContent.get(contentKey(ref.type, ref.id)) || null
      });
    }

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

    const submissions = await this.reads.listSubmissionSummaries({
      voiceArtistUserId: userId,
      status,
      language: profile.language
    });
    const refs = submissions.map((item) => ({ type: item.contentType, id: item.contentId }));
    const [contentByKey, curriculum] = await Promise.all([
      this.reads.findContentSummaries(refs),
      this.reads.listCurriculum(profile.language)
    ]);
    const link = buildLinker(curriculum);

    return {
      profile,
      submissions: submissions.map(
        (submission): VoiceOwnSubmission => ({
          ...submission,
          content: contentByKey.get(contentKey(submission.contentType, submission.contentId)) || null,
          ...link(submission.contentType, submission.contentId)
        })
      )
    };
  }
}
