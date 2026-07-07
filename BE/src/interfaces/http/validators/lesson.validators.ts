import { LANGUAGE_VALUES, LEVEL_VALUES, STATUS_VALUES } from "../../../domain/entities/Lesson.js";

export const LESSON_LANGUAGE_VALUES = LANGUAGE_VALUES;
export const LESSON_LEVEL_VALUES = LEVEL_VALUES;
export const LESSON_STATUS_VALUES = STATUS_VALUES;

export function isValidLessonLanguage(value: string) {
  return LESSON_LANGUAGE_VALUES.includes(value as (typeof LESSON_LANGUAGE_VALUES)[number]);
}

export function isValidLessonLevel(value: string) {
  return LESSON_LEVEL_VALUES.includes(value as (typeof LESSON_LEVEL_VALUES)[number]);
}

export function isValidLessonStatus(value: string) {
  return LESSON_STATUS_VALUES.includes(value as (typeof LESSON_STATUS_VALUES)[number]);
}
