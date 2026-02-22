export const LESSON_LANGUAGE_VALUES = ["yoruba", "igbo", "hausa"] as const;
export const LESSON_LEVEL_VALUES = ["beginner", "intermediate", "advanced"] as const;
export const LESSON_STATUS_VALUES = ["draft", "finished", "published"] as const;

export function isValidLessonLanguage(value: string) {
  return LESSON_LANGUAGE_VALUES.includes(value as (typeof LESSON_LANGUAGE_VALUES)[number]);
}

export function isValidLessonLevel(value: string) {
  return LESSON_LEVEL_VALUES.includes(value as (typeof LESSON_LEVEL_VALUES)[number]);
}

export function isValidLessonStatus(value: string) {
  return LESSON_STATUS_VALUES.includes(value as (typeof LESSON_STATUS_VALUES)[number]);
}
