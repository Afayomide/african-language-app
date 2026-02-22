import mongoose from "mongoose";

const LANGUAGE_VALUES = ["yoruba", "igbo", "hausa"] as const;
const LEVEL_VALUES = ["beginner", "intermediate", "advanced"] as const;

export function isValidLanguage(value: string) {
  return LANGUAGE_VALUES.includes(value as (typeof LANGUAGE_VALUES)[number]);
}

export function isValidLevel(value: string) {
  return LEVEL_VALUES.includes(value as (typeof LEVEL_VALUES)[number]);
}

export function validateLessonId(value: unknown) {
  return Boolean(value && mongoose.Types.ObjectId.isValid(String(value)));
}
