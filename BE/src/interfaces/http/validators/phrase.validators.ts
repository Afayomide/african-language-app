export function isValidPhraseStatus(status: string) {
  return status === "draft" || status === "finished" || status === "published";
}

export function isValidPhraseDifficulty(value: unknown) {
  const num = Number(value);
  return !Number.isNaN(num) && num >= 1 && num <= 5;
}
