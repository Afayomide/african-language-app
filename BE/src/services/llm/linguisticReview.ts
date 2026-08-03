/**
 * Diacritics review of generated target-language content.
 *
 * The structural validator in outputQuality.ts checks internal consistency only -- do the
 * components cover the sentence, do the meaning segments line up. It cannot see that "éló"
 * carries a different tone from "Eló". Tone is meaning-bearing in Yoruba and Igbo, so a
 * wrong mark is a wrong word, and nothing else in the pipeline looks at it.
 *
 * Three rules learned by measurement, do not relax them:
 *
 * 1. EVERY reviewer output field is an enum or an integer. A free-form `{type: "string"}`
 *    field under Ollama's grammar lets the model generate unbounded text -- in testing,
 *    qwen2.5 answered a Yoruba spelling question with iOS Swift sample code. With enums it
 *    became 5/5 consistent.
 *
 * 2. Ask about tone and NOTHING else. Bundled with questions about meaning, grammar and
 *    vocabulary, a reviewer barely inspects the marks; asked only about tone, N-ATLaS caught
 *    8/10 deliberately mis-toned sentences.
 *
 * 3. The reviewer MUST be a different model from the generator. Asked which spelling of
 *    "how much" is correct, gemma4:12b answered the toneless "Elo" 5/5 with high confidence.
 *    A model cannot catch its own systematic bias.
 *
 * KNOWN LIMIT: the reviewer has no canonical lexicon, so it cannot distinguish a wrong tone
 * from a valid variant it has not seen. It flagged "Eló ni omi kan?" as missing marks when
 * "Eló" is in fact correct. Treat verdicts as a signal for review, not as ground truth.
 */

const TONE_VERDICTS = ["correct", "missing", "wrong"] as const;
const TRANSLATION_VERDICTS = ["matches", "mismatch"] as const;

export type ToneVerdictValue = (typeof TONE_VERDICTS)[number];
export type TranslationVerdictValue = (typeof TRANSLATION_VERDICTS)[number];
export type ToneReviewVerdict = {
  index: number;
  tone_marks: ToneVerdictValue;
  translation: TranslationVerdictValue;
};

export const TONE_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          tone_marks: { type: "string", enum: [...TONE_VERDICTS] },
          translation: { type: "string", enum: [...TRANSLATION_VERDICTS] }
        },
        required: ["index", "tone_marks", "translation"]
      }
    }
  },
  required: ["verdicts"]
} as const;

/**
 * Two questions per sentence, both concrete. Kept deliberately narrow: an earlier version
 * asked about six things at once and the reviewer stopped inspecting tone marks almost
 * entirely. Do not add a third axis without re-measuring tone accuracy.
 */
export function buildToneReviewPrompt(input: {
  language: string;
  sentences: Array<{ text: string; translations: string[] }>;
}) {
  return [
    `You are a ${input.language} language reviewer. Answer exactly two questions about each sentence.`,
    "",
    "QUESTION 1 - tone_marks. Check ONLY the diacritics.",
    `${input.language} tones: high (á), mid (a, unmarked), low (à). Underdots also matter: ẹ, ọ, ṣ.`,
    "A word can carry every mark and still be WRONG if a mark is the wrong tone for that word.",
    "- correct: every word carries exactly the marks the standard written form requires.",
    "- missing: one or more words have had tone marks or underdots stripped off.",
    "- wrong: marks are present but at least one is the wrong tone for that word.",
    "If a word has more than one accepted written form, treat it as correct.",
    "",
    "QUESTION 2 - translation. Compare the sentence against the English meaning given after '=>'.",
    `- matches: the ${input.language} sentence really does mean that English.`,
    "- mismatch: it means something else, or is unrelated to that English.",
    "Judge the meaning only. Do not let tone mark problems change this answer.",
    "",
    ...input.sentences.map(
      (item, index) => `${index}. ${item.text}  =>  "${(item.translations || [])[0] || ""}"`
    )
  ].join("\n");
}

export function indexToneVerdicts(verdicts: ToneReviewVerdict[] | undefined, count: number) {
  const byIndex = new Map<number, { tone?: ToneVerdictValue; translation?: TranslationVerdictValue }>();
  for (const verdict of Array.isArray(verdicts) ? verdicts : []) {
    const index = Number(verdict?.index);
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    if (byIndex.has(index)) continue;
    const tone = TONE_VERDICTS.includes(verdict?.tone_marks as ToneVerdictValue)
      ? (verdict.tone_marks as ToneVerdictValue)
      : undefined;
    const translation = TRANSLATION_VERDICTS.includes(verdict?.translation as TranslationVerdictValue)
      ? (verdict.translation as TranslationVerdictValue)
      : undefined;
    if (!tone && !translation) continue;
    byIndex.set(index, { tone, translation });
  }
  return byIndex;
}

/** Retry text handed back to the generating model when a sentence was rejected. */
export function describeToneIssue(verdict: ToneVerdictValue, language: string) {
  return verdict === "missing"
    ? `tone marks or underdots were stripped off, which standard written ${language} requires`
    : `at least one tone mark was the wrong tone for that word in ${language}`;
}

export function describeTranslationIssue(language: string) {
  return `the ${language} text did not mean what its English translation claimed`;
}
