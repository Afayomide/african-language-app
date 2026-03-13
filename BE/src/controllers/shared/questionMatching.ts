import type { QuestionInteractionData, QuestionMatchingPair } from "../../domain/entities/Question.js";
import type { ImageAssetRepository } from "../../domain/repositories/ImageAssetRepository.js";
import type { PhraseImageLinkRepository } from "../../domain/repositories/PhraseImageLinkRepository.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";
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
  phrases: PhraseRepository;
  phraseImageLinks: PhraseImageLinkRepository;
  imageAssets: ImageAssetRepository;
}) {
  const resolvedPairs: QuestionMatchingPair[] = [];

  for (let index = 0; index < input.matchingPairs.length; index += 1) {
    const pair = input.matchingPairs[index];
    const phrase = await input.phrases.findById(pair.phraseId);
    if (!phrase || !phrase.lessonIds.includes(input.lessonId)) {
      return "phrase_not_found" as const;
    }
    if (pair.translationIndex < 0 || pair.translationIndex >= phrase.translations.length) {
      return "invalid_translation_index" as const;
    }

    let image: QuestionMatchingPair["image"] = null;
    if (input.subtype === "mt-match-image") {
      const candidateLink = pair.imageAssetId
        ? await input.phraseImageLinks.findActiveByPhraseAndAsset(
            phrase.id,
            pair.imageAssetId,
            pair.translationIndex
          ) ||
          await input.phraseImageLinks.findActiveByPhraseAndAsset(
            phrase.id,
            pair.imageAssetId,
            null
          )
        : null;

      const fallbackLinks = candidateLink
        ? [candidateLink]
        : await input.phraseImageLinks.listByPhraseId(phrase.id);

      const preferredLink =
        fallbackLinks.find((item) => item.translationIndex === pair.translationIndex && item.isPrimary) ||
        fallbackLinks.find((item) => item.translationIndex === pair.translationIndex) ||
        fallbackLinks.find((item) => item.translationIndex === null && item.isPrimary) ||
        fallbackLinks.find((item) => item.translationIndex === null) ||
        fallbackLinks.find((item) => item.isPrimary) ||
        fallbackLinks[0];

      if (!preferredLink) {
        return "matching_image_required" as const;
      }

      const imageAsset = await input.imageAssets.findById(preferredLink.imageAssetId);
      if (!imageAsset) {
        return "matching_image_required" as const;
      }

      image = {
        imageAssetId: imageAsset.id,
        url: imageAsset.url,
        thumbnailUrl: imageAsset.thumbnailUrl,
        altText: imageAsset.altText
      };
    }

    resolvedPairs.push({
      pairId: sanitizePairId(`${phrase.id}-${pair.translationIndex}-${index + 1}`),
      phraseId: phrase.id,
      phraseText: phrase.text,
      translationIndex: pair.translationIndex,
      translation: getTranslationByIndex(phrase.translations, pair.translationIndex),
      image
    });
  }

  if (resolvedPairs.length < 2) {
    return "matching_pairs_required" as const;
  }

  const uniquePairIds = new Set(resolvedPairs.map((item) => item.pairId));
  if (uniquePairIds.size < 2) {
    return "matching_pairs_required" as const;
  }

  return {
    phraseId: resolvedPairs[0].phraseId,
    translationIndex: resolvedPairs[0].translationIndex,
    relatedPhraseIds: Array.from(new Set(resolvedPairs.map((item) => item.phraseId))),
    interactionData: {
      matchingPairs: resolvedPairs
    } satisfies QuestionInteractionData
  };
}
