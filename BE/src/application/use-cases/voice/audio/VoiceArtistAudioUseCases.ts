import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { VoiceArtistProfileRepository } from "../../../../domain/repositories/VoiceArtistProfileRepository.js";
import type { VoiceAudioSubmissionRepository } from "../../../../domain/repositories/VoiceAudioSubmissionRepository.js";
import type { PhraseAudio } from "../../../../domain/entities/Phrase.js";

export class VoiceArtistAudioUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly voiceProfiles: VoiceArtistProfileRepository,
    private readonly submissions: VoiceAudioSubmissionRepository
  ) {}

  async listQueuePhrases(userId: string) {
    const profile = await this.voiceProfiles.findByUserId(userId);
    if (!profile || !profile.isActive) return null;

    const lessons = await this.lessons.listByLanguage(profile.language);
    const phrases = await this.phrases.list({
      lessonIds: lessons.map((lesson) => lesson.id),
      language: profile.language
    });

    const submissions = await this.submissions.list({
      voiceArtistUserId: userId,
      language: profile.language
    });

    const latestByPhrase = new Map<string, (typeof submissions)[number]>();
    for (const submission of submissions) {
      if (!latestByPhrase.has(submission.phraseId)) {
        latestByPhrase.set(submission.phraseId, submission);
      }
    }

    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

    return {
      profile,
      queue: phrases
        .filter((phrase) => !phrase.audio?.url)
        .map((phrase) => ({
          phrase,
          lessons: phrase.lessonIds.map((id) => lessonById.get(id)).filter(Boolean),
          latestSubmission: latestByPhrase.get(phrase.id) || null
        }))
    };
  }

  async createSubmission(input: { userId: string; phraseId: string; audio: PhraseAudio }) {
    const profile = await this.voiceProfiles.findByUserId(input.userId);
    if (!profile || !profile.isActive) return "profile_inactive" as const;

    const phrase = await this.phrases.findById(input.phraseId);
    if (!phrase) return "phrase_not_found" as const;
    if (phrase.language !== profile.language) return "phrase_out_of_scope" as const;

    const created = await this.submissions.create({
      phraseId: phrase.id,
      voiceArtistUserId: input.userId,
      voiceArtistProfileId: profile.id,
      language: profile.language,
      audio: input.audio
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

    const phrases = await this.phrases.findByIds(submissions.map((item) => item.phraseId));
    const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));

    return {
      profile,
      submissions: submissions.map((submission) => ({
        ...submission,
        phrase: phraseById.get(submission.phraseId) || null
      }))
    };
  }
}
