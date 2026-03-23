import type { ContentType, AudioAnalysis } from "../../../../domain/entities/Content.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import { ContentLookupService } from "../../../services/ContentLookupService.js";
import { GoogleSpeechTranscriptValidationService } from "../../../services/GoogleSpeechTranscriptValidationService.js";
import { PronunciationComparisonService } from "../../../services/PronunciationComparisonService.js";

export type ComparePronunciationInput = {
  contentType: ContentType;
  contentId: string;
  studentAnalysis: AudioAnalysis | undefined;
  studentAudioBuffer?: Buffer;
};

export type ComparePronunciationError =
  | "content_not_found"
  | "reference_audio_missing"
  | "reference_analysis_missing"
  | "student_analysis_missing"
  | "student_audio_missing";

export class LearnerPronunciationUseCases {
  private readonly contentLookup: ContentLookupService;
  private readonly comparison = new PronunciationComparisonService();
  private readonly transcriptValidation = new GoogleSpeechTranscriptValidationService();

  constructor(
    words: WordRepository,
    expressions: ExpressionRepository,
    sentences: SentenceRepository
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  async compare(input: ComparePronunciationInput) {
    const content = await this.contentLookup.findByRef(input.contentType, input.contentId);
    if (!content) return "content_not_found" as const;

    const referenceAudio = content.audio;
    if (!referenceAudio?.url || referenceAudio.referenceType !== "human_reference" || referenceAudio.reviewStatus !== "accepted") {
      return "reference_audio_missing" as const;
    }

    // DTW tone scoring is temporarily disabled.
    // Keep the old pitch-analysis guard here for easy restoration later.
    // if (!input.studentAnalysis?.pitchContour?.length) {
    //   return "student_analysis_missing" as const;
    // }
    if (!input.studentAudioBuffer?.length) {
      return "student_audio_missing" as const;
    }

    const transcriptValidation = await this.transcriptValidation.validate({
      audioBuffer: input.studentAudioBuffer,
      expectedText: content.text,
      language: content.language,
      contentType: content.kind
    });

    if (!transcriptValidation.passed) {
      if (transcriptValidation.reason === "transcript_service_unavailable") {
        return {
          error: "transcript_service_unavailable" as const,
          transcriptValidation
        };
      }

      return {
        error: "transcript_mismatch" as const,
        transcriptValidation
      };
    }

    // DTW tone comparison intentionally commented out.
    // We are using transcript validation only for now.
    //
    // const comparison = this.comparison.compare({
    //   reference: referenceAudio.analysis,
    //   student: input.studentAnalysis
    // });
    //
    // if (comparison === "reference_pitch_missing") return "reference_analysis_missing" as const;
    // if (comparison === "student_pitch_missing") return "student_analysis_missing" as const;

    const comparison = {
      score: 100,
      level: "excellent" as const,
      dtwDistance: 0,
      normalizedDistance: 0,
      pathLength: 0,
      durationRatio: 1,
      pitchRangeRatio: 1,
      feedback: []
    };

    return {
      content: {
        id: content.id,
        type: content.kind,
        language: content.language,
        text: content.text,
        translations: content.translations,
        selectedTranslation: content.translations[0] || ""
      },
      referenceAudio: {
        provider: referenceAudio.provider,
        model: referenceAudio.model,
        voice: referenceAudio.voice,
        locale: referenceAudio.locale,
        format: referenceAudio.format,
        url: referenceAudio.url,
        referenceType: referenceAudio.referenceType,
        reviewStatus: referenceAudio.reviewStatus
      },
      transcriptValidation,
      comparison
    };
  }
}
