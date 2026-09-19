/**
 * Per-word glosses for components a meaning map cannot explain.
 *
 * A sentence's meaning map pairs chunks of Yoruba to chunks of English. When a chunk covers
 * one component ("Níbo" -> "Where") that pairing IS that component's meaning here. When it
 * covers several ("wà ní ilé" -> "is at home") it says nothing about any one of them, so the
 * word panel -- which tells a learner what THIS word means in THIS sentence -- has no answer.
 * Falling back to the shared word row is not an answer either: a particle's first dictionary
 * entry is arbitrary, which is how `ń` came to be presented as "are".
 *
 * The prompt and the guards live here rather than in the caller so the pass that runs during
 * generation and the retroactive pass over old content cannot drift apart. Both write into
 * learner-facing content, so both need the same rules.
 *
 * The guards exist because this is model output going straight to a learner:
 *   - the model is asked ONLY for English. It is never invited to touch the Yoruba, and any
 *     reply whose word does not match what is stored, byte for byte, discards the whole
 *     sentence. Yoruba has no canonical lexicon to arbitrate tone marks against, so a model
 *     "correcting" a diacritic must not be able to write that back
 *   - a gloss longer than GLOSS_MAX_CHARS, or one that restates the translation, is the model
 *     paraphrasing the sentence instead of glossing a word
 *   - a partial answer is not accepted piecemeal: one bad entry rejects the sentence, because
 *     a model that mangled one word is not a reliable witness for the others
 */

/** A gloss is one word's meaning, not a paraphrase of the sentence. */
export const GLOSS_MAX_CHARS = 40;

export type GlossComponent = { index: number; text: string };

export type GlossRequest = {
  sentence: string;
  translation: string;
  components: GlossComponent[];
  /** Indexes to gloss. Everything else is context the model needs but must not answer for. */
  targets: number[];
};

export type GlossResult = { index: number; gloss: string };

export function buildGlossPrompt(input: GlossRequest): string {
  return [
    "You are glossing an existing Yoruba sentence for a language-learning app.",
    "",
    `Yoruba sentence: ${input.sentence}`,
    `English meaning: ${input.translation}`,
    "",
    "Its words, in order:",
    ...input.components.map((c) => `  [${c.index}] ${c.text}`),
    "",
    `Give the meaning of ONLY these words, in this sentence: ${input.targets.join(", ")}`,
    "",
    "Rules:",
    "- Return the meaning each word carries HERE, not its full dictionary entry.",
    "- A grammatical particle gets a grammatical gloss, e.g. a continuous-aspect marker is",
    '  "(-ing)" and a negator is "not". Do not invent a content word for it.',
    "- Match the subject and tense of this sentence. If the subject is third person, a copula",
    '  is "is", not "am" or "are".',
    `- Keep each gloss under ${GLOSS_MAX_CHARS} characters. Never restate the whole sentence.`,
    "- Do NOT change, correct, retype or comment on the Yoruba text. Copy each word exactly",
    "  as given, including every tone mark and diacritic. You are only writing English.",
    "",
    "Respond with JSON only, no prose, no code fences:",
    '{"glosses":[{"index":0,"word":"<the word copied exactly>","gloss":"<English meaning here>"}]}'
  ].join("\n");
}

/** Schema for providers that support structured output (ollama's `format`). */
export const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    glosses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          word: { type: "string" },
          gloss: { type: "string" }
        },
        required: ["index", "word", "gloss"]
      }
    }
  },
  required: ["glosses"]
} as const;

export function parseGlossResponse(raw: string): Array<{ index: number; word: string; gloss: string }> {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`no JSON object in response: ${raw.slice(0, 120)}`);
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed?.glosses)) throw new Error("response has no glosses array");
  return parsed.glosses;
}

/**
 * Check a model reply against what is stored. Throws with the reason on the first problem --
 * the caller decides whether that is fatal or simply means this sentence keeps empty glosses.
 */
export function validateGlosses(
  input: GlossRequest,
  glosses: Array<{ index: number; word: string; gloss: string }>,
  options: {
    /**
     * Skip the "restates the translation" check. That check is for sentences, where one word
     * never means the whole sentence. A short expression can legitimately share its meaning
     * with one of its words (`Níbo` in `Níbo ni` = "where"), so it would reject a right answer.
     */
    allowWholeTranslation?: boolean;
  } = {}
): GlossResult[] {
  const byIndex = new Map(input.components.map((c) => [c.index, c] as const));
  const accepted: GlossResult[] = [];

  for (const g of glosses) {
    const index = Number(g.index);
    const comp = byIndex.get(index);
    if (!comp) throw new Error(`index ${g.index} out of range`);
    if (!input.targets.includes(index)) continue; // context, not ours to fill

    // The model echoing the word back is the check that it glossed the word we meant. A
    // mismatch means it retyped the Yoruba, so nothing from this sentence is trustworthy.
    //
    // Case is the one allowed difference. A component's snapshot is the dictionary form
    // (`ọ̀rẹ́`) while the sentence capitalises whatever opens it (`Ọ̀rẹ́`), and the model
    // echoes what it sees in the sentence. Lowercasing leaves every tone mark and sub-dot
    // untouched, so a diacritic that changed still fails here -- which is the point.
    const echoed = String(g.word || "").trim();
    if (echoed.toLocaleLowerCase("yo") !== comp.text.toLocaleLowerCase("yo")) {
      throw new Error(`word mismatch at ${index}: model said "${g.word}", stored is "${comp.text}"`);
    }
    const gloss = String(g.gloss || "").trim();
    if (!gloss) throw new Error(`empty gloss at ${index}`);
    if (gloss.length > GLOSS_MAX_CHARS) throw new Error(`gloss too long at ${index}: "${gloss}"`);
    if (!options.allowWholeTranslation && gloss.toLowerCase() === input.translation.trim().toLowerCase()) {
      throw new Error(`gloss at ${index} restates the sentence`);
    }
    accepted.push({ index, gloss });
  }

  return accepted;
}
