import type { QuestionInteractionData, QuestionMatchingPair } from "../../domain/entities/Question.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
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
}) {
  if (input.subtype === "mt-match-image") {
    return "matching_image_not_supported" as const;
  }

  const resolvedPairs: QuestionMatchingPair[] = [];

  for (let index = 0; index < input.matchingPairs.length; index += 1) {
    const pair = input.matchingPairs[index];
    const expression = await input.expressions.findById(pair.contentId);
    if (!expression) {
      return "content_not_found" as const;
    }
    if (pair.translationIndex < 0 || pair.translationIndex >= expression.translations.length) {
      return "invalid_translation_index" as const;
    }

    resolvedPairs.push({
      pairId: sanitizePairId(`${expression.id}-${pair.translationIndex}-${index + 1}`),
      contentType: "expression",
      contentId: expression.id,
      contentText: expression.text,
      translationIndex: pair.translationIndex,
      translation: getTranslationByIndex(expression.translations, pair.translationIndex),
      image: null
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
    sourceType: "expression" as const,
    sourceId: String(resolvedPairs[0].contentId || ""),
    translationIndex: resolvedPairs[0].translationIndex,
    relatedSourceRefs: resolvedPairs
      .map((item) => item.contentId)
      .filter((item): item is string => Boolean(item))
      .map((id) => ({ type: "expression" as const, id })),
    interactionData: {
      matchingPairs: resolvedPairs
    } satisfies QuestionInteractionData
  };
}
