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

/**
 * How many sentences a lesson aims for, and the floor it may not fall below.
 *
 * `sentencesPerLesson: 0` asks for a lesson with NO sentences: the first lesson of a unit
 * isolates one new item (`Ẹ káàárọ̀`, a greeting, not a sentence), drills it, and only meets
 * a sentence once a second item exists to combine with. Without this the lesson had to invent
 * something, which is how one-word "sentences" duplicating the word card appeared.
 *
 * A review lesson is always sentence-based -- it exists to revisit sentences already taught --
 * so it ignores the request.
 */
export function resolveSentencePlan(input: { sentencesPerLesson: number; isReviewLesson: boolean }) {
  const requested = Number(input.sentencesPerLesson);
  const sentenceFree = !input.isReviewLesson && Number.isFinite(requested) && requested <= 0;
  if (sentenceFree) {
    return { sentenceFree: true, targetNewSentences: 0, minSources: 0, floor: 0 } as const;
  }
  return {
    sentenceFree: false,
    targetNewSentences: clampNewTargetsPerLesson(requested),
    minSources: MIN_SENTENCE_SOURCES_PER_LESSON,
    floor: MIN_SENTENCE_SOURCES_FLOOR
  } as const;
}

/** Sentences a lesson aims to ship with. */
export const MIN_SENTENCE_SOURCES_PER_LESSON = 3;
/** Absolute floor below which a sentence-based lesson fails rather than ships. */
export const MIN_SENTENCE_SOURCES_FLOOR = 2;

/** Fallback when MIN_SENTENCE_WORDS is unset or unusable -- the long-standing behaviour. */
export const DEFAULT_MIN_SENTENCE_WORDS = 2;

/**
 * Fewest words a generated sentence may have before it is rejected as "sentence too short".
 *
 * Env: MIN_SENTENCE_WORDS. Set it to 1 to allow single-word sentences, which a unit built
 * around atomic vocabulary needs -- a lesson teaching one word has a one-word utterance to
 * teach, and rejecting it leaves the lesson with nothing to drill.
 *
 * Read on every call rather than captured at module load, so it cannot depend on whether this
 * module was imported before or after `dotenv/config`. Values below 1 and unparseable values
 * fall back to the default rather than disabling the check: a zero-word sentence is empty, and
 * `empty text` is a different rejection reason.
 */
export function getMinSentenceWords(): number {
  const raw = String(process.env.MIN_SENTENCE_WORDS ?? "").trim();
  // The whole value must be digits. Number.parseInt reads "1.9" and "1abc" as 1 and would
  // silently apply a limit nobody wrote, so a malformed value falls back to the default
  // instead of taking its leading digits.
  if (!/^\d+$/.test(raw)) return DEFAULT_MIN_SENTENCE_WORDS;
  const parsed = Number.parseInt(raw, 10);
  return parsed >= 1 ? parsed : DEFAULT_MIN_SENTENCE_WORDS;
}
