import type {
  GeneratePhrasesInput,
  LlmGeneratedPhrase,
  LlmGeneratedProverb,
  LlmLessonSuggestion
} from "./types.js";
import { extractThemeAnchors } from "./unitTheme.js";

type Level = "beginner" | "intermediate" | "advanced";
type Language = "yoruba" | "igbo" | "hausa";

export type ValidationResult<T> = {
  accepted: T[];
  rejected: Array<{ item: T; reasons: string[] }>;
};

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function containsSentencePunctuation(value: string) {
  return /[.!?]/.test(String(value || "").trim());
}

function normalize(value: string) {
  return String(value || "").trim().toLowerCase();
}

function looksEnglishOnly(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  return /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/.test(trimmed);
}

const ENGLISH_MARKER_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "ask",
  "day",
  "for",
  "from",
  "good",
  "hello",
  "hi",
  "how",
  "i",
  "is",
  "me",
  "my",
  "name",
  "of",
  "please",
  "thanks",
  "the",
  "to",
  "what",
  "where",
  "you",
  "your"
]);

function looksEnglishSeedPhrase(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (!/^[A-Za-z\s.,:;'"!?/-]+$/.test(trimmed)) return false;

  const words = splitWords(
    trimmed
      .toLowerCase()
      .replace(/[.,:;'"!?/-]/g, " ")
  );

  if (words.length === 0) return false;
  if (words.length === 1 && words[0].length <= 3) return false;

  return words.some((word) => ENGLISH_MARKER_WORDS.has(word));
}

function hasSlashSeparatedMeaning(value: string) {
  return /(^|[^A-Za-z])\/([^A-Za-z]|$)|\s\/\s/.test(value);
}

function countThemeAnchorMatches(values: string[], anchors: string[]) {
  const haystack = values
    .map((item) => normalize(String(item || "")).replace(/[^a-z0-9\s-]/g, " "))
    .join(" ");
  return anchors.filter((anchor) => new RegExp(`(^|\\s)${anchor}(\\s|$)`, "i").test(haystack)).length;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(String(value).trim());
  }
  return result;
}

function phraseReasons(
  phrase: LlmGeneratedPhrase,
  input: GeneratePhrasesInput,
  seenTexts: Set<string>
) {
  const reasons: string[] = [];
  const text = String(phrase.text || "").trim();
  const words = splitWords(text);
  const translations = uniqueStrings(
    Array.isArray(phrase.translations) ? phrase.translations.map((item) => String(item || "").trim()) : []
  );
  const normalizedText = normalize(text);
  const existingPhrases = new Set((input.existingPhrases || []).map(normalize));

  if (!text) reasons.push("empty text");
  if (seenTexts.has(normalizedText)) reasons.push("duplicate phrase in batch");
  if (existingPhrases.has(normalizedText)) reasons.push("duplicate phrase in existing data");
  if (translations.length === 0) reasons.push("missing translations");
  if (translations.some((item) => hasSlashSeparatedMeaning(item))) reasons.push("slash separated meaning");
  if (translations.some((item) => item.length > 80)) reasons.push("translation too long");
  if (words.length === 0) reasons.push("empty token list");

  if (input.level === "beginner") {
    if (words.length > 3) reasons.push("too many words for beginner phrase");
    if (containsSentencePunctuation(text)) reasons.push("beginner phrase looks like sentence");
  }

  if (input.level === "intermediate" && words.length > 5) {
    reasons.push("too many words for intermediate phrase");
  }

  if (
    Array.isArray(phrase.examples) &&
    phrase.examples.some((example) => splitWords(String(example.original || "")).length > 10)
  ) {
    reasons.push("example too long");
  }

  if (phrase.difficulty !== undefined) {
    const difficulty = Number(phrase.difficulty);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      reasons.push("invalid difficulty");
    }
  }

  return reasons;
}

export function validateGeneratedPhrases(
  phrases: LlmGeneratedPhrase[],
  input: GeneratePhrasesInput
): ValidationResult<LlmGeneratedPhrase> {
  const accepted: LlmGeneratedPhrase[] = [];
  const rejected: Array<{ item: LlmGeneratedPhrase; reasons: string[] }> = [];
  const seenTexts = new Set<string>();

  for (const phrase of phrases) {
    const reasons = phraseReasons(phrase, input, seenTexts);
    if (reasons.length > 0) {
      rejected.push({ item: phrase, reasons });
      continue;
    }
    seenTexts.add(normalize(phrase.text));
    accepted.push(phrase);
  }

  return { accepted, rejected };
}

function proverbReasons(
  proverb: LlmGeneratedProverb,
  input: { existingProverbs?: string[]; level: Level; language: Language },
  seenTexts: Set<string>
) {
  const reasons: string[] = [];
  const text = String(proverb.text || "").trim();
  const translation = String(proverb.translation || "").trim();
  const contextNote = String(proverb.contextNote || "").trim();
  const textWordCount = splitWords(text).length;
  const translationWordCount = splitWords(translation).length;
  const contextWordCount = splitWords(contextNote).length;
  const existing = new Set((input.existingProverbs || []).map(normalize));
  const key = normalize(text);

  if (!text) reasons.push("empty text");
  if (!translation) reasons.push("missing translation");
  if (existing.has(key)) reasons.push("duplicate proverb in existing data");
  if (seenTexts.has(key)) reasons.push("duplicate proverb in batch");
  if (textWordCount < 2) reasons.push("proverb too short");
  if (!looksEnglishOnly(translation)) reasons.push("translation not in English-like text");
  if (translationWordCount < 3) reasons.push("translation too short for proverb");
  if (translation.length > 140) reasons.push("translation too long");
  if (!contextNote) reasons.push("missing context note");
  if (contextNote && contextWordCount < 5) reasons.push("context note too short");
  if (contextNote.length > 320) reasons.push("context note too long");
  if (textWordCount < 4 && translationWordCount < 4) {
    reasons.push("looks like ordinary phrase, not proverb");
  }

  return reasons;
}

export function validateGeneratedProverbs(
  proverbs: LlmGeneratedProverb[],
  input: { existingProverbs?: string[]; level: Level; language: Language }
): ValidationResult<LlmGeneratedProverb> {
  const accepted: LlmGeneratedProverb[] = [];
  const rejected: Array<{ item: LlmGeneratedProverb; reasons: string[] }> = [];
  const seenTexts = new Set<string>();

  for (const proverb of proverbs) {
    const reasons = proverbReasons(proverb, input, seenTexts);
    if (reasons.length > 0) {
      rejected.push({ item: proverb, reasons });
      continue;
    }
    seenTexts.add(normalize(proverb.text));
    accepted.push(proverb);
  }

  return { accepted, rejected };
}

export function validateLessonSuggestion(
  suggestion: LlmLessonSuggestion,
  input: {
    language: Language;
    level: Level;
    unitTitle?: string;
    unitDescription?: string;
    topic?: string;
    curriculumInstruction?: string;
    themeAnchors?: string[];
    existingUnitTitles?: string[];
    existingLessonTitles?: string[];
    existingPhraseTexts?: string[];
    existingProverbTexts?: string[];
  }
) {
  const reasons: string[] = [];
  const title = String(suggestion.title || "").trim();
  const description = String(suggestion.description || "").trim();
  const objectives = Array.isArray(suggestion.objectives)
    ? suggestion.objectives.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const seedPhrases = Array.isArray(suggestion.seedPhrases)
    ? suggestion.seedPhrases.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const normalizedTitle = normalize(title);
  const existingTitles = new Set([
    ...(input.existingUnitTitles || []).map(normalize),
    ...(input.existingLessonTitles || []).map(normalize)
  ]);
  const existingPhraseTexts = new Set((input.existingPhraseTexts || []).map(normalize));
  const existingProverbTexts = new Set((input.existingProverbTexts || []).map(normalize));
  const themeAnchors = input.themeAnchors && input.themeAnchors.length > 0
    ? input.themeAnchors.map(normalize)
    : extractThemeAnchors({
        unitTitle: input.unitTitle,
        unitDescription: input.unitDescription,
        topic: input.topic,
        curriculumInstruction: input.curriculumInstruction
      });

  if (!title) reasons.push("empty title");
  if (!looksEnglishOnly(title)) reasons.push("title not English-like");
  if (existingTitles.has(normalizedTitle)) reasons.push("duplicate title");
  if (!description) reasons.push("missing description");
  if (description && !looksEnglishOnly(description)) reasons.push("description not English-like");
  if (objectives.length === 0) reasons.push("missing objectives");
  if (objectives.some((item) => !looksEnglishOnly(item))) reasons.push("objective not English-like");
  if (seedPhrases.length < 4 || seedPhrases.length > 8) reasons.push("invalid seed phrase count");
  if (seedPhrases.some((item) => looksEnglishSeedPhrase(item))) reasons.push("seed phrase looks English");
  if (input.level === "beginner" && seedPhrases.some((item) => splitWords(item).length > 3)) {
    reasons.push("beginner seed phrase too long");
  }

  if (themeAnchors.length > 0) {
    const titleDescriptionMatches = countThemeAnchorMatches([title, description], themeAnchors);
    const objectiveMatches = countThemeAnchorMatches(objectives, themeAnchors);

    if (titleDescriptionMatches === 0) reasons.push("title and description not aligned with unit theme");
  }

  const duplicateSeedPhrases = seedPhrases.filter((item) => existingPhraseTexts.has(normalize(item)));
  if (duplicateSeedPhrases.length >= Math.max(3, Math.ceil(seedPhrases.length * 0.6))) {
    reasons.push("too many existing seed phrases reused");
  }

  const proverbPayload = Array.isArray(suggestion.proverbs) ? suggestion.proverbs : [];
  const proverbTexts = proverbPayload
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      return String(item.text || "").trim();
    })
    .filter(Boolean);
  if (proverbTexts.some((item) => existingProverbTexts.has(normalize(item)))) {
    reasons.push("reused proverb");
  }

  const nonEnglishObjectives = objectives.filter((item) => !looksEnglishOnly(item));
  const englishLikeSeedPhrases = seedPhrases.filter((item) => looksEnglishSeedPhrase(item));
  const tooLongBeginnerSeedPhrases =
    input.level === "beginner"
      ? seedPhrases.filter((item) => splitWords(item).length > 3)
      : [];
  const reusedSeedPhrases = duplicateSeedPhrases;
  const reusedProverbs = proverbTexts.filter((item) => existingProverbTexts.has(normalize(item)));
  const titleDescriptionMatches = themeAnchors.length > 0 ? countThemeAnchorMatches([title, description], themeAnchors) : 0;
  const objectiveMatches = themeAnchors.length > 0 ? countThemeAnchorMatches(objectives, themeAnchors) : 0;

  return {
    ok: reasons.length === 0,
    reasons,
    details: {
      nonEnglishObjectives,
      englishLikeSeedPhrases,
      tooLongBeginnerSeedPhrases,
      reusedSeedPhrases,
      reusedProverbs,
      themeAnchors,
      titleDescriptionMatches,
      objectiveMatches
    }
  };
}
