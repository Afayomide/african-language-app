export const QUESTION_TYPES = ["multiple-choice", "fill-in-the-gap", "listening", "matching", "speaking"] as const;
export const QUESTION_SUBTYPES = [
  "mc-select-translation",
  "mc-select-context-response",
  "mc-select-missing-word",
  "fg-word-order",
  "fg-letter-order",
  "fg-gap-fill",
  "ls-mc-select-translation",
  "ls-mc-select-missing-word",
  "ls-fg-word-order",
  "ls-fg-gap-fill",
  "mt-match-image",
  "mt-match-translation",
  "ls-dictation",
  "ls-tone-recognition",
  "sp-pronunciation-compare"
] as const;

export const MANUALLY_SUPPORTED_QUESTION_SUBTYPES = [
  "mc-select-translation",
  "mc-select-context-response",
  "mc-select-missing-word",
  "fg-word-order",
  "fg-letter-order",
  "fg-gap-fill",
  "ls-mc-select-translation",
  "ls-mc-select-missing-word",
  "ls-fg-word-order",
  "ls-fg-gap-fill",
  "mt-match-image",
  "mt-match-translation",
  "sp-pronunciation-compare"
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
  if (type === "speaking") return subtype.startsWith("sp-");
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

export function subtypeUsesOrderArrangement(subtype: string) {
  return subtype === "fg-word-order" || subtype === "ls-fg-word-order" || subtype === "fg-letter-order";
}

export function subtypeUsesWordOrder(subtype: string) {
  return subtype === "fg-word-order" || subtype === "ls-fg-word-order";
}

export function subtypeUsesChoiceOptions(subtype: string) {
  return [
    "mc-select-translation",
    "mc-select-context-response",
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
  contentType: "word" | "expression";
  contentId: string;
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
      contentType?: unknown;
      contentId?: unknown;
      translationIndex?: unknown;
      imageAssetId?: unknown;
    };
    const rawContentType = String(pair.contentType || "").trim();
    const contentType =
      rawContentType === "word" || rawContentType === "expression"
        ? rawContentType
        : subtype === "mt-match-image"
          ? "word"
          : "expression";
    const contentId = String(pair.contentId || "").trim();
    if (!contentId) return null;

    const translationIndex = Number(pair.translationIndex ?? 0);
    if (!Number.isInteger(translationIndex) || translationIndex < 0) return null;

    const imageAssetId = String(pair.imageAssetId || "").trim();
    if (subtype === "mt-match-image" && !imageAssetId) {
      parsedPairs.push({ contentType, contentId, translationIndex });
      continue;
    }

    parsedPairs.push(
      imageAssetId
        ? { contentType, contentId, translationIndex, imageAssetId }
        : { contentType, contentId, translationIndex }
    );
  }

  const uniquePairKeys = new Set(parsedPairs.map((item) => `${item.contentType}:${item.contentId}:${item.translationIndex}`));
  if (parsedPairs.length < 4 || uniquePairKeys.size < 4) return null;

  return parsedPairs;
}

export function parseQuestionOptions(options: unknown) {
  if (!Array.isArray(options)) return null;
  const sanitized = options.map((item) => String(item).trim()).filter(Boolean);
  if (sanitized.length < 2) return null;
  return sanitized;
}

function normalizeWhitespace(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function stripDiacritics(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeContextResponseKey(value: string) {
  return stripDiacritics(normalizeWhitespace(value).toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
}

export function findContextResponseTypoOnlyDistractors(sourceText: string, options: string[]) {
  const exactSource = normalizeWhitespace(sourceText);
  const normalizedSource = normalizeContextResponseKey(sourceText);
  return options.filter((option) => {
    const normalizedOption = normalizeContextResponseKey(option);
    if (!normalizedOption || normalizedOption !== normalizedSource) return false;
    return normalizeWhitespace(option) !== exactSource;
  });
}

export function validateContextResponseQuestion(input: {
  sourceText: string;
  options: string[];
  correctIndex: number;
}) {
  const sourceText = normalizeWhitespace(input.sourceText);
  if (!sourceText) return "missing_source_text";
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
    return "invalid_option_count";
  }
  if (!Number.isInteger(input.correctIndex) || input.correctIndex < 0 || input.correctIndex >= input.options.length) {
    return "invalid_correct_index";
  }
  const correctOption = normalizeWhitespace(String(input.options[input.correctIndex] || ""));
  if (correctOption !== sourceText) {
    return "correct_option_must_match_source";
  }
  if (findContextResponseTypoOnlyDistractors(sourceText, input.options).length > 0) {
    return "typo_only_distractors_not_allowed";
  }
  return null;
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
