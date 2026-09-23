/**
 * Rewrite one target-language word inside a generated exercise question.
 *
 * Questions copy their source text rather than referencing it, so retiring a word leaves the
 * drills still teaching it: after `Màmá` was replaced by `Ìyá` the sentences read correctly
 * while 98 exercises went on asking learners to spell and arrange `Màmá`.
 *
 * Only the target language is touched. The English is left exactly as written -- `Ìyá` means
 * "Mom" as readily as "Mother", so rewriting the meaning would be an opinion, not a repair.
 *
 * Two shapes need more than a string replace:
 *   - `fg-letter-order` holds the word split into letters, so the letters are rebuilt from the
 *     new word and the expected order resized with them
 *   - matching questions carry the word's id beside its text, so the id moves too
 *
 * A swap that would make two options identical is refused rather than guessed at: the question
 * becomes unanswerable, and that is for a human to resolve.
 */

export type SwappableQuestion = {
  id?: string;
  subtype?: string | null;
  prompt_template?: string | null;
  options?: string[] | null;
  correct_index?: number | null;
  review_data?: Record<string, unknown> | null;
  interaction_data?: Record<string, unknown> | null;
  explanation?: string | null;
};

export type SwapSpec = {
  /** The word as written, capitalised as the course writes it. */
  from: string;
  to: string;
  /** Optional word-row ids, so matching questions point at the new row too. */
  fromId?: string;
  toId?: string;
};

export type SwapResult = {
  changed: boolean;
  refused: boolean;
  warnings: string[];
  fields: {
    prompt_template?: string | null;
    options?: string[];
    review_data?: Record<string, unknown>;
    interaction_data?: Record<string, unknown>;
    explanation?: string | null;
  };
};

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** Split into what a reader sees as one letter, so a combining accent stays with its vowel. */
export function letters(word: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Segmenter) return Array.from(word.normalize("NFC"));
  return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(word.normalize("NFC")), (s) => s.segment);
}

/** Replace the word in a string, matching the capitalisation of each occurrence. */
export function swapInText(text: string, spec: SwapSpec): string {
  if (!text) return text;
  const upper = spec.from;
  const lower = lowerFirst(spec.from);
  return text.split(upper).join(spec.to).split(lower).join(lowerFirst(spec.to));
}

const mentions = (text: unknown, spec: SwapSpec) =>
  typeof text === "string" && (text.includes(spec.from) || text.includes(lowerFirst(spec.from)));

export function swapQuestionWord(question: SwappableQuestion, spec: SwapSpec): SwapResult {
  const warnings: string[] = [];
  const fields: SwapResult["fields"] = {};
  let changed = false;

  const options = Array.isArray(question.options) ? question.options : [];
  const review = (question.review_data || {}) as Record<string, unknown>;
  const interaction = (question.interaction_data || {}) as Record<string, unknown>;

  // A letter-order question spells one word out. Rebuild it rather than substituting letters.
  const isLetterOrder = question.subtype === "fg-letter-order";
  const spelled = typeof review.sentence === "string" ? (review.sentence as string) : "";
  if (isLetterOrder && mentions(spelled, spec)) {
    const nextWord = swapInText(spelled, spec);
    const nextLetters = letters(nextWord);
    fields.options = nextLetters;
    fields.review_data = {
      ...review,
      sentence: nextWord,
      words: nextLetters,
      correctOrder: nextLetters.map((_, index) => index)
    };
    if (mentions(question.prompt_template, spec)) fields.prompt_template = swapInText(question.prompt_template!, spec);
    if (mentions(question.explanation, spec)) fields.explanation = swapInText(question.explanation!, spec);
    return { changed: true, refused: false, warnings, fields };
  }

  if (options.some((option) => mentions(option, spec))) {
    const next = options.map((option) => (mentions(option, spec) ? swapInText(option, spec) : option));
    // Two identical options make the question unanswerable, and which to keep is a judgement.
    const duplicated = next.filter((option, index) => next.indexOf(option) !== index);
    if (duplicated.length) {
      warnings.push(`swapping would duplicate the option "${duplicated[0]}"`);
      return { changed: false, refused: true, warnings, fields: {} };
    }
    fields.options = next;
    changed = true;
  }

  if (mentions(question.prompt_template, spec)) {
    fields.prompt_template = swapInText(question.prompt_template!, spec);
    changed = true;
  }
  if (mentions(question.explanation, spec)) {
    fields.explanation = swapInText(question.explanation!, spec);
    changed = true;
  }

  // review_data holds the target-language sentence and its tokens. `meaning` and
  // `meaningSegments` are English and are deliberately left alone.
  const nextReview: Record<string, unknown> = { ...review };
  let reviewChanged = false;
  if (mentions(review.sentence, spec)) {
    nextReview.sentence = swapInText(review.sentence as string, spec);
    reviewChanged = true;
  }
  if (Array.isArray(review.words) && (review.words as unknown[]).some((w) => mentions(w, spec))) {
    nextReview.words = (review.words as unknown[]).map((w) => (mentions(w, spec) ? swapInText(w as string, spec) : w));
    reviewChanged = true;
  }
  if (reviewChanged) {
    fields.review_data = nextReview;
    changed = true;
  }

  // Matching questions pair a word's text with its id; both have to move together.
  const pairs = (interaction as { matchingPairs?: unknown }).matchingPairs;
  if (Array.isArray(pairs)) {
    let pairsChanged = false;
    const nextPairs = pairs.map((raw) => {
      const pair = { ...(raw as Record<string, unknown>) };
      if (mentions(pair.contentText, spec)) {
        pair.contentText = swapInText(pair.contentText as string, spec);
        pairsChanged = true;
      }
      if (spec.fromId && spec.toId && pair.contentId === spec.fromId) {
        pair.contentId = spec.toId;
        if (typeof pair.pairId === "string") pair.pairId = pair.pairId.split(spec.fromId).join(spec.toId);
        pairsChanged = true;
      }
      return pair;
    });
    if (pairsChanged) {
      fields.interaction_data = { ...interaction, matchingPairs: nextPairs };
      changed = true;
    }
  }

  return { changed, refused: false, warnings, fields };
}
