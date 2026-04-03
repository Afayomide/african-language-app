export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isStrongEnoughPassword(password: string, min = 8) {
  return password.length >= min;
}

const PERSON_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '\-’][\p{L}\p{M}]+)*$/u;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizePersonName(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function isValidPersonName(value: string) {
  return PERSON_NAME_PATTERN.test(normalizePersonName(value));
}

export function normalizeUsername(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function isValidHttpUrl(value: string) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
