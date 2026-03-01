export const QUESTION_TYPES = ["multiple-choice", "fill-in-the-gap", "listening"] as const;
export const QUESTION_SUBTYPES = [
  "mc-select-translation",
  "mc-select-missing-word",
  "fg-word-order",
  "fg-gap-fill",
  "ls-mc-select-translation",
  "ls-mc-select-missing-word",
  "ls-fg-word-order",
  "ls-fg-gap-fill",
  "ls-dictation",
  "ls-tone-recognition"
] as const;

export function isValidQuestionType(value: string) {
  return QUESTION_TYPES.includes(value as (typeof QUESTION_TYPES)[number]);
}

export function isValidQuestionSubtype(value: string) {
  return QUESTION_SUBTYPES.includes(value as (typeof QUESTION_SUBTYPES)[number]);
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
  const correctOrder = payload.correctOrder.map((item) => Number(item));
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
