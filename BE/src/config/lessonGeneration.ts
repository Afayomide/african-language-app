export const LESSON_GENERATION_LIMITS = {
  MIN_PHRASES_PER_LESSON: 1,
  MAX_NEW_PHRASES_PER_LESSON: 8,
  MAX_PHRASES_PER_STAGE: 4
} as const;

export function clampPhrasesPerLesson(value: number) {
  if (!Number.isFinite(value)) return LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON;
  return Math.min(
    LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON,
    Math.max(LESSON_GENERATION_LIMITS.MIN_PHRASES_PER_LESSON, Math.floor(value))
  );
}

