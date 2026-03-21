import type { ContentType, AudioAnalysis } from "../../../../domain/entities/Content.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import { ContentLookupService } from "../../../services/ContentLookupService.js";
import { PronunciationComparisonService } from "../../../services/PronunciationComparisonService.js";

export type ComparePronunciationInput = {
  contentType: ContentType;
  contentId: string;
  studentAnalysis: AudioAnalysis | undefined;
};

export type ComparePronunciationError =
  | "content_not_found"
  | "reference_audio_missing"
  | "reference_analysis_missing"
  | "student_analysis_missing";

export class LearnerPronunciationUseCases {
  private readonly contentLookup: ContentLookupService;
  private readonly comparison = new PronunciationComparisonService();

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

    if (!input.studentAnalysis?.pitchContour?.length) {
      return "student_analysis_missing" as const;
    }

    const comparison = this.comparison.compare({
      reference: referenceAudio.analysis,
      student: input.studentAnalysis
    });

    if (comparison === "reference_pitch_missing") return "reference_analysis_missing" as const;
    if (comparison === "student_pitch_missing") return "student_analysis_missing" as const;

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
      comparison
    };
  }
}
