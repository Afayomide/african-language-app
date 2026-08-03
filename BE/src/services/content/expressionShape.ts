/**
 * Shared shape heuristics for deciding whether a target-language string is a reusable set
 * phrase or a whole sentence.
 *
 * These rules previously lived as private copies in AdminUnitAiContentUseCases and
 * SentenceDraftPersistenceService, and the copies drifted: only the use-case checked
 * isSentenceLikeExpressionText before creating an expression, so the persistence service
 * stored full sentences ("fún ọkùnrin kan ni owó") that the use-case had just refused and
 * logged. Keep one implementation so a future guard change cannot half-apply.
 */

/** A set phrase longer than this reads as a sentence, not a reusable expression. */
export const MAX_FIXED_EXPRESSION_WORDS = 4;

export function splitExpressionIntoWordTokens(value: string) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim().replace(/^[.,!?;:"'()\[\]{}]+|[.,!?;:"'()\[\]{}]+$/g, ""))
    .filter(Boolean);
}

export function isSentenceLikeExpressionText(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  // A trailing sentence-terminal period marks a declarative sentence; set phrases are
  // stored without one. A lone trailing "?" is left alone: "Eló ni?" and "ṣé ẹ wà dáadáa"
  // are legitimate question-shaped set phrases, so punctuation alone decides nothing.
  if (/\.\s*$/.test(raw)) return true;
  const tokens = splitExpressionIntoWordTokens(raw);
  // Longer than a set phrase -> treat as a sentence.
  if (tokens.length > MAX_FIXED_EXPRESSION_WORDS) return true;
  // A comma joins clauses; combined with enough length it reads as a sentence, not a
  // phrase. Short two-chunk phrases (fewer than 4 words) stay allowed.
  if (raw.includes(",") && tokens.length >= 4) return true;
  return false;
}
