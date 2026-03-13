export const QUESTION_TYPES = ["multiple-choice", "fill-in-the-gap", "listening", "matching"] as const;
export const QUESTION_SUBTYPES = [
  "mc-select-translation",
  "mc-select-missing-word",
  "fg-word-order",
  "fg-gap-fill",
  "ls-mc-select-translation",
  "ls-mc-select-missing-word",
  "ls-fg-word-order",
  "ls-fg-gap-fill",
  "mt-match-image",
  "mt-match-translation",
  "ls-dictation",
  "ls-tone-recognition"
] as const;

export const MANUALLY_SUPPORTED_QUESTION_SUBTYPES = [
  "mc-select-translation",
  "mc-select-missing-word",
  "fg-word-order",
  "fg-gap-fill",
  "ls-mc-select-translation",
  "ls-mc-select-missing-word",
  "ls-fg-word-order",
  "ls-fg-gap-fill",
  "mt-match-image",
  "mt-match-translation"
] as const;

export function isValidQuestionType(value: string) {
  return QUESTION_TYPES.includes(value as (typeof QUESTION_TYPES)[number]);
}

export function isValidQuestionSubtype(value: string) {
  return QUESTION_SUBTYPES.includes(value as (typeof QUESTION_SUBTYPES)[number]);
}

export function isManuallySupportedQuestionSubtype(value: string) {
  return MANUALLY_SUPPORTED_QUESTION_SUBTYPES.includes(
    value as (typeof MANUALLY_SUPPORTED_QUESTION_SUBTYPES)[number]
  );
}

export function subtypeMatchesType(type: string, subtype: string) {
  if (type === "multiple-choice") return subtype.startsWith("mc-");
  if (type === "fill-in-the-gap") return subtype.startsWith("fg-");
  if (type === "listening") return subtype.startsWith("ls-");
  if (type === "matching") return subtype.startsWith("mt-");
  return false;
}

export function subtypeRequiresReviewData(subtype: string) {
  return [
    "fg-word-order",
    "fg-gap-fill",
    "mc-select-missing-word",
    "ls-fg-word-order",
    "ls-fg-gap-fill"
  ].includes(subtype);
}

export function subtypeUsesWordOrder(subtype: string) {
  return subtype === "fg-word-order" || subtype === "ls-fg-word-order";
}

export function subtypeUsesChoiceOptions(subtype: string) {
  return [
    "mc-select-translation",
    "mc-select-missing-word",
    "fg-gap-fill",
    "ls-mc-select-translation",
    "ls-mc-select-missing-word",
    "ls-fg-gap-fill"
  ].includes(subtype);
}

export function subtypeUsesMatching(subtype: string) {
  return subtype === "mt-match-image" || subtype === "mt-match-translation";
}

export type ParsedMatchingPair = {
  phraseId: string;
  translationIndex: number;
  imageAssetId?: string;
};

export function parseQuestionMatchingPairs(interactionData: unknown, subtype: string) {
  if (!subtypeUsesMatching(subtype)) return null;
  if (!interactionData || typeof interactionData !== "object") return null;

  const payload = interactionData as {
    matchingPairs?: unknown;
  };
  if (!Array.isArray(payload.matchingPairs)) return null;

  const parsedPairs: ParsedMatchingPair[] = [];
  for (const item of payload.matchingPairs) {
    if (!item || typeof item !== "object") return null;
    const pair = item as {
      phraseId?: unknown;
      translationIndex?: unknown;
      imageAssetId?: unknown;
    };
    const phraseId = String(pair.phraseId || "").trim();
    if (!phraseId) return null;

    const translationIndex = Number(pair.translationIndex ?? 0);
    if (!Number.isInteger(translationIndex) || translationIndex < 0) return null;

    const imageAssetId = String(pair.imageAssetId || "").trim();
    if (subtype === "mt-match-image" && !imageAssetId) {
      parsedPairs.push({ phraseId, translationIndex });
      continue;
    }

    parsedPairs.push(imageAssetId ? { phraseId, translationIndex, imageAssetId } : { phraseId, translationIndex });
  }

  const uniquePairKeys = new Set(parsedPairs.map((item) => `${item.phraseId}:${item.translationIndex}`));
  if (parsedPairs.length < 2 || uniquePairKeys.size < 2) return null;

  return parsedPairs;
}

export function parseQuestionOptions(options: unknown) {
  if (!Array.isArray(options)) return null;
  const sanitized = options.map((item) => String(item).trim()).filter(Boolean);
  if (sanitized.length < 2) return null;
  return sanitized;
}

export function parseQuestionReviewData(reviewData: unknown) {
  if (!reviewData || typeof reviewData !== "object") return null;
  const payload = reviewData as {
    sentence?: unknown;
    words?: unknown;
    correctOrder?: unknown;
    meaning?: unknown;
  };

  const sentence = String(payload.sentence || "").trim();
  if (!sentence) return null;

  if (!Array.isArray(payload.words)) return null;
  const words = payload.words.map((item) => String(item).trim()).filter(Boolean);
  if (words.length < 2) return null;

  if (!Array.isArray(payload.correctOrder)) return null;
  const rawOrder = payload.correctOrder.map((item) => Number(item));
  // Accept both 0-based and 1-based order indices from clients.
  const allOneBased = rawOrder.length > 0 && rawOrder.every((idx) => !Number.isNaN(idx) && idx >= 1 && idx <= words.length);
  const correctOrder = allOneBased ? rawOrder.map((idx) => idx - 1) : rawOrder;
  if (
    correctOrder.length !== words.length ||
    correctOrder.some((idx) => Number.isNaN(idx) || idx < 0 || idx >= words.length) ||
    new Set(correctOrder).size !== correctOrder.length
  ) {
    return null;
  }

  const meaning = String(payload.meaning || "").trim();
  return { sentence, words, correctOrder, meaning };
}
