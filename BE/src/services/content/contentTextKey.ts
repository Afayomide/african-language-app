/**
 * The one rule for turning content text into its dedupe key.
 *
 * Everything that decides "is this the same word/expression/sentence we already have?" must
 * use this: the `text_normalized` column behind the `(language, text_normalized)` unique
 * index, every `findByText`, and the in-memory maps the generators build to reuse content
 * within a run. When those disagree, a lookup misses a row that the index then refuses to
 * insert beside -- which is exactly how generating `Ụtụtụ ọma.` next to an existing
 * `Ụtụtụ ọma` failed with a duplicate-key error instead of reusing the sentence.
 *
 * A trailing full stop is dropped, so `Ụtụtụ ọma.` and `Ụtụtụ ọma` are one row. "?" and "!"
 * are kept, because they change the utterance rather than decorate it. Nothing inside the
 * text is touched -- the comma in "Ndewo, ụtụtụ ọma" is part of the phrase, not punctuation
 * to normalise away.
 */
export function contentTextKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .trim();
}
