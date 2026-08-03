/** Escape regex metacharacters so a user search term is matched literally. */
export function escapeRegex(term: string): string {
  return String(term || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a case-insensitive "contains" RegExp for a user search term. */
export function searchRegex(term: string): RegExp {
  return new RegExp(escapeRegex(term), "i");
}
