export const LESSON_GENERATION_LIMITS = {
  MIN_PHRASES_PER_LESSON: 1,
  MAX_NEW_PHRASES_PER_LESSON: 8,
  MAX_REVIEW_PHRASES_PER_LESSON: 4,
  MAX_PHRASES_PER_STAGE: 4
} as const;

export function clampPhrasesPerLesson(value: number) {
  if (!Number.isFinite(value)) return LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON;
  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON,
    Math.max(LESSON_GENERATION_LIMITS.MIN_PHRASES_PER_LESSON, Math.floor(value))
  );
}

export function defaultReviewPhrasesPerLesson(phrasesPerLesson: number) {
  const clampedPhrases = clampPhrasesPerLesson(phrasesPerLesson);
  if (clampedPhrases <= 1) return 0;
  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_REVIEW_PHRASES_PER_LESSON,
    Math.max(1, Math.floor(clampedPhrases * 0.35))
  );
}

export function clampReviewPhrasesPerLesson(value: number, phrasesPerLesson: number) {
  if (!Number.isFinite(value)) {
    return defaultReviewPhrasesPerLesson(phrasesPerLesson);
  }

  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_REVIEW_PHRASES_PER_LESSON,
    Math.max(0, Math.floor(value))
  );
}
