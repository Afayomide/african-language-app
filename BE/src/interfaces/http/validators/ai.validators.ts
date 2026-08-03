import { isValidId } from "../../../utils/ids.js";
import { LANGUAGE_VALUES, LEVEL_VALUES } from "../../../domain/entities/Lesson.js";

export function isValidLanguage(value: string) {
  return LANGUAGE_VALUES.includes(value as (typeof LANGUAGE_VALUES)[number]);
}

export function isValidLevel(value: string) {
  return LEVEL_VALUES.includes(value as (typeof LEVEL_VALUES)[number]);
}

export function validateLessonId(value: unknown) {
  return Boolean(value && isValidId(String(value)));
}
