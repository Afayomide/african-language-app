export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isStrongEnoughPassword(password: string, min = 8) {
  return password.length >= min;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
