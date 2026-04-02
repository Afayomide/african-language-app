import type { QuestionInteractionData, QuestionMatchingPair } from "../../domain/entities/Question.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type { ParsedMatchingPair } from "../../interfaces/http/validators/question.validators.js";

function getTranslationByIndex(translations: string[], index: number) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  if (Number.isInteger(index) && index >= 0 && index < translations.length) {
    return String(translations[index] || "");
  }
  return String(translations[0] || "");
}

function sanitizePairId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export async function buildMatchingInteractionData(input: {
  matchingPairs: ParsedMatchingPair[];
  subtype: string;
  lessonId: string;
  expressions: ExpressionRepository;
  words: WordRepository;
}) {
  const resolvedPairs: QuestionMatchingPair[] = [];

  for (let index = 0; index < input.matchingPairs.length; index += 1) {
    const pair = input.matchingPairs[index];
    const entity =
      pair.contentType === "word"
        ? await input.words.findById(pair.contentId)
        : await input.expressions.findById(pair.contentId);
    if (!entity) {
      return "content_not_found" as const;
    }
    if (pair.translationIndex < 0 || pair.translationIndex >= entity.translations.length) {
      return "invalid_translation_index" as const;
    }

    const translation = getTranslationByIndex(entity.translations, pair.translationIndex);
    const image =
      input.subtype === "mt-match-image"
        ? entity.kind === "word" && entity.image?.url
          ? {
              imageAssetId: String(entity.image.imageAssetId || ""),
              url: String(entity.image.url || ""),
              thumbnailUrl: String(entity.image.thumbnailUrl || ""),
              altText: String(entity.image.altText || translation || entity.text || "Image match")
            }
          : {
              imageAssetId: String(pair.imageAssetId || ""),
              url: "",
              thumbnailUrl: "",
              altText: translation || entity.text || "Image match"
            }
        : null;

    resolvedPairs.push({
      pairId: sanitizePairId(`${pair.contentType}-${entity.id}-${pair.translationIndex}-${index + 1}`),
      contentType: pair.contentType,
      contentId: entity.id,
      contentText: entity.text,
      translationIndex: pair.translationIndex,
      translation,
      image
    });
  }

  if (resolvedPairs.length < 4) {
    return "matching_pairs_required" as const;
  }

  const uniquePairIds = new Set(resolvedPairs.map((item) => item.pairId));
  if (uniquePairIds.size < 4) {
    return "matching_pairs_required" as const;
  }

  return {
    sourceType: (resolvedPairs[0]?.contentType || "expression") as "word" | "expression",
    sourceId: String(resolvedPairs[0].contentId || ""),
    translationIndex: resolvedPairs[0].translationIndex,
    relatedSourceRefs: resolvedPairs
      .flatMap((item) =>
        item.contentId && item.contentType ? [{ type: item.contentType, id: item.contentId }] : []
      ),
    interactionData: {
      matchingPairs: resolvedPairs
    } satisfies QuestionInteractionData
  };
}
