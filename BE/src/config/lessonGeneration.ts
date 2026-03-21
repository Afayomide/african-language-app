export const LESSON_GENERATION_LIMITS = {
  MIN_NEW_TARGETS_PER_LESSON: 1,
  MAX_NEW_TARGETS_PER_LESSON: 2,
  MAX_NEW_SENTENCES_PER_LESSON: 8,
  MAX_REVIEW_CONTENT_PER_LESSON: 4,
  MAX_CONTENT_PER_STAGE: 4,
  MAX_NEW_WORDS_PER_LESSON: 2,
  MIN_SENTENCES_PER_TARGET: 2
} as const;

export function clampNewTargetsPerLesson(value: number) {
  if (!Number.isFinite(value)) return LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON;
  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON,
    Math.max(LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON, Math.floor(value))
  );
}

export function defaultReviewContentPerLesson(newTargetsPerLesson: number) {
  const clampedTargets = clampNewTargetsPerLesson(newTargetsPerLesson);
  if (clampedTargets <= 1) return 0;
  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON,
    Math.max(1, Math.floor(clampedTargets * 0.5))
  );
}

export function clampReviewContentPerLesson(value: number, newTargetsPerLesson: number) {
  if (!Number.isFinite(value)) {
    return defaultReviewContentPerLesson(newTargetsPerLesson);
  }

  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_REVIEW_CONTENT_PER_LESSON,
    Math.max(0, Math.floor(value))
  );
}
