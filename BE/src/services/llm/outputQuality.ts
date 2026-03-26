import type {
  GenerateChaptersInput,
  GenerateWordsInput,
  LlmGeneratedChapter,
  LlmGeneratedWord,
  GeneratePhrasesInput,
  LlmGeneratedPhrase,
  GenerateSentencesInput,
  LlmGeneratedSentence,
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

function normalizeEnglishMeaning(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSentenceComponentType(value: string): "word" | "expression" {
  return splitWords(value).length <= 1 ? "word" : "expression";
}

function isIgnorableSentenceGap(value: string) {
  return String(value || "").replace(/[\s.,!?;:'"()\-–—]+/g, "").length === 0;
}

function sentenceComponentsCoverText(
  sentence: string,
  components: Array<{ text: string }>
) {
  const source = String(sentence || "");
  const lowerSource = source.toLocaleLowerCase();
  let cursor = 0;

  for (const component of components) {
    const text = String(component.text || "").trim();
    if (!text) continue;
    const matchIndex = lowerSource.indexOf(text.toLocaleLowerCase(), cursor);
    if (matchIndex < 0) return false;

    const skipped = source.slice(cursor, matchIndex);
    if (!isIgnorableSentenceGap(skipped)) return false;
    cursor = matchIndex + text.length;
  }

  return isIgnorableSentenceGap(source.slice(cursor));
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

function wordReasons(
  word: LlmGeneratedWord,
  input: GenerateWordsInput,
  seenTexts: Set<string>
) {
  const reasons: string[] = [];
  const text = String(word.text || "").trim();
  const words = splitWords(text);
  const translations = uniqueStrings(
    Array.isArray(word.translations) ? word.translations.map((item) => String(item || "").trim()) : []
  );
  const normalizedText = normalize(text);
  const existingWords = new Set((input.existingWords || []).map(normalize));

  if (!text) reasons.push("empty text");
  if (seenTexts.has(normalizedText)) reasons.push("duplicate word in batch");
  if (existingWords.has(normalizedText)) reasons.push("duplicate word in existing data");
  if (translations.length === 0) reasons.push("missing translations");
  if (words.length !== 1) reasons.push("word must be a single token");
  if (containsSentencePunctuation(text)) reasons.push("word contains sentence punctuation");
  if (translations.some((item) => hasSlashSeparatedMeaning(item))) reasons.push("slash separated meaning");

  if (word.difficulty !== undefined) {
    const difficulty = Number(word.difficulty);
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

export function validateGeneratedWords(
  words: LlmGeneratedWord[],
  input: GenerateWordsInput
): ValidationResult<LlmGeneratedWord> {
  const accepted: LlmGeneratedWord[] = [];
  const rejected: Array<{ item: LlmGeneratedWord; reasons: string[] }> = [];
  const seenTexts = new Set<string>();

  for (const word of words) {
    const reasons = wordReasons(word, input, seenTexts);
    if (reasons.length > 0) {
      rejected.push({ item: word, reasons });
      continue;
    }
    seenTexts.add(normalize(word.text));
    accepted.push(word);
  }

  return { accepted, rejected };
}

function chapterReasons(
  chapter: LlmGeneratedChapter,
  input: GenerateChaptersInput,
  seenTitles: Set<string>
) {
  const reasons: string[] = [];
  const title = String(chapter.title || "").trim();
  const description = String(chapter.description || "").trim();
  const normalizedTitle = normalize(title);
  const titleWords = splitWords(title);
  const descriptionWords = splitWords(description);
  const existingTitles = new Set((input.existingChapterTitles || []).map(normalize));
  const themeAnchors = extractThemeAnchors({
    topic: input.topic,
    curriculumInstruction: input.extraInstructions
  });

  if (!title) reasons.push("empty title");
  if (!description) reasons.push("missing description");
  if (seenTitles.has(normalizedTitle)) reasons.push("duplicate chapter in batch");
  if (existingTitles.has(normalizedTitle)) reasons.push("duplicate chapter in existing data");
  if (title && !looksEnglishOnly(title)) reasons.push("title not English-like");
  if (description && !looksEnglishOnly(description)) reasons.push("description not English-like");
  if (titleWords.length < 2 || titleWords.length > 8) reasons.push("invalid chapter title length");
  if (descriptionWords.length < 8) reasons.push("chapter description too short");
  if (input.topic && themeAnchors.length > 0 && countThemeAnchorMatches([title, description], themeAnchors) === 0) {
    reasons.push("chapter not aligned with requested theme");
  }

  return reasons;
}

export function validateGeneratedChapters(
  chapters: LlmGeneratedChapter[],
  input: GenerateChaptersInput
): ValidationResult<LlmGeneratedChapter> {
  const accepted: LlmGeneratedChapter[] = [];
  const rejected: Array<{ item: LlmGeneratedChapter; reasons: string[] }> = [];
  const seenTitles = new Set<string>();

  for (const chapter of chapters) {
    const reasons = chapterReasons(chapter, input, seenTitles);
    if (reasons.length > 0) {
      rejected.push({ item: chapter, reasons });
      continue;
    }
    seenTitles.add(normalize(chapter.title));
    accepted.push({
      title: String(chapter.title).trim(),
      description: String(chapter.description).trim()
    });
  }

  return { accepted, rejected };
}

function sentenceReasons(
  sentence: LlmGeneratedSentence,
  input: GenerateSentencesInput,
  seenTexts: Set<string>
) {
  const reasons: string[] = [];
  const text = String(sentence.text || "").trim();
  const translations = uniqueStrings(
    Array.isArray(sentence.translations) ? sentence.translations.map((item) => String(item || "").trim()) : []
  );
  const components = Array.isArray(sentence.components) ? sentence.components : [];
  const normalizedText = normalize(text);
  const existingSentences = new Set((input.existingSentences || []).map(normalize));
  const allowedExpressions = new Set(
    (input.allowedExpressions || []).map((item) => `expression:${normalize(item.text)}`)
  );
  const allowedWords = new Set(
    (input.allowedWords || []).map((item) => `word:${normalize(item.text)}`)
  );
  const hasExplicitInventory = allowedExpressions.size > 0 || allowedWords.size > 0;
  const words = splitWords(text);
  const normalizedSentence = normalize(text);
  const componentTexts = components.map((component) => ({
    text: String(component?.text || "").trim()
  }));
  const meaningSegments = Array.isArray(sentence.meaningSegments) ? sentence.meaningSegments : [];
  const normalizedComponents = components.map((component) => {
    const componentText = String(component?.text || "").trim();
    const tokenCount = splitWords(componentText).length;
    return {
      text: componentText,
      normalizedText: normalize(componentText),
      type: inferSentenceComponentType(componentText),
      tokenCount,
      fixed: component?.fixed === true,
      hasFixedFlag: typeof component?.fixed === "boolean",
      role: component?.role === "support" ? "support" : component?.role === "core" ? "core" : "",
      translations: uniqueStrings(
        Array.isArray(component?.translations) ? component.translations.map((item) => String(item || "").trim()) : []
      )
    };
  });

  if (!text) reasons.push("empty text");
  if (seenTexts.has(normalizedText)) reasons.push("duplicate sentence in batch");
  if (existingSentences.has(normalizedText)) reasons.push("duplicate sentence in existing data");
  if (translations.length === 0) reasons.push("missing translations");
  if (components.length === 0) reasons.push("missing components");
  if (words.length < 2) reasons.push("sentence too short");
  if (components.length > 0 && !sentenceComponentsCoverText(text, componentTexts)) {
    reasons.push("components do not cover full sentence");
  }
  if (translations.length > 0 && splitWords(translations[0] || "").length > 1) {
    if (meaningSegments.length === 0) {
      reasons.push("missing meaning segments");
    } else {
      const flattenedIndexes: number[] = [];
      const normalizedMeaningFromSegments = normalizeEnglishMeaning(
        meaningSegments
        .map((segment) => String(segment?.text || "").trim())
        .filter(Boolean)
        .join(" ")
      );
      for (const segment of meaningSegments) {
        const segmentText = String(segment?.text || "").trim();
        const componentIndexes = Array.isArray(segment?.componentIndexes)
          ? segment.componentIndexes.filter((value) => Number.isInteger(value))
          : [];
        if (!segmentText) reasons.push("meaning segment missing text");
        if (componentIndexes.length === 0) reasons.push("meaning segment missing component indexes");
        for (const componentIndex of componentIndexes) {
          if (componentIndex < 0 || componentIndex >= components.length) {
            reasons.push("meaning segment component index out of range");
            continue;
          }
          flattenedIndexes.push(componentIndex);
        }
      }

      const matchesAnyTranslation = translations.some(
        (translation) => normalizeEnglishMeaning(translation) === normalizedMeaningFromSegments
      );
      if (!matchesAnyTranslation) {
        reasons.push("meaning segments do not reconstruct translation");
      }

      const sortedIndexes = [...flattenedIndexes].sort((left, right) => left - right);
      const expectedIndexes = components.map((_, index) => index);
      if (
        sortedIndexes.length !== expectedIndexes.length ||
        sortedIndexes.some((value, index) => value !== expectedIndexes[index])
      ) {
        reasons.push("meaning segments must cover each component exactly once");
      }

      if (
        flattenedIndexes.some((value, index) => index > 0 && value < flattenedIndexes[index - 1])
      ) {
        reasons.push("meaning segments out of component order");
      }
    }
  }

  if (input.level === "beginner" && words.length > 8) reasons.push("beginner sentence too long");
  if (input.level === "intermediate" && words.length > 12) reasons.push("intermediate sentence too long");

  for (const component of normalizedComponents) {
    const type = component.type;
    const componentText = component.normalizedText;
    const componentTranslations = component.translations;
    const role = component.role;
    if (!type || !componentText) {
      reasons.push("invalid component");
      continue;
    }
    if (component.tokenCount > 1 && !component.hasFixedFlag) reasons.push("multi-word component missing fixed marker");
    if (component.tokenCount > 1 && !component.fixed) {
      reasons.push("multi-word compositional component must be split into separate words unless fixed");
    }
    if (componentTranslations.length === 0) reasons.push("component missing translations");
    if (hasExplicitInventory && !role) reasons.push("component missing role");
    if (!hasExplicitInventory && !role) reasons.push("component missing role");
    const key = `${type}:${componentText}`;
    if (hasExplicitInventory && type === "word" && !allowedWords.has(key)) reasons.push("unknown word component");
    if (hasExplicitInventory && type === "expression" && !allowedExpressions.has(key)) reasons.push("unknown expression component");
    if (!normalizedSentence.includes(componentText)) reasons.push("component text missing from sentence");
  }

  if (!hasExplicitInventory) {
    const supportExpressions = normalizedComponents.filter((component) => component.role === "support" && component.type === "expression");
    const supportWords = normalizedComponents.filter((component) => component.role === "support" && component.type === "word");
    const coreComponents = normalizedComponents.filter((component) => component.role === "core");
    if (supportExpressions.length > 1) reasons.push("too many support expressions");
    if (supportWords.length > 2) reasons.push("too many support words");
    if (coreComponents.length === 0) reasons.push("missing core components");
    if (
      coreComponents.length === 1 &&
      coreComponents[0].type === "expression" &&
      coreComponents[0].normalizedText === normalizedSentence
    ) {
      reasons.push("bare expression used as sentence");
    }
  }

  return reasons;
}

export function validateGeneratedSentences(
  sentences: LlmGeneratedSentence[],
  input: GenerateSentencesInput
): ValidationResult<LlmGeneratedSentence> {
  const accepted: LlmGeneratedSentence[] = [];
  const rejected: Array<{ item: LlmGeneratedSentence; reasons: string[] }> = [];
  const seenTexts = new Set<string>();

  for (const sentence of sentences) {
    const reasons = sentenceReasons(sentence, input, seenTexts);
    if (reasons.length > 0) {
      rejected.push({ item: sentence, reasons });
      continue;
    }
    seenTexts.add(normalize(sentence.text));
    accepted.push(sentence);
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
  const seedExpressions = Array.isArray(suggestion.seedExpressions)
    ? suggestion.seedExpressions.map((item) => String(item || "").trim()).filter(Boolean)
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
  if (seedExpressions.length < 4 || seedExpressions.length > 8) reasons.push("invalid seed expression count");
  if (seedExpressions.some((item) => looksEnglishSeedPhrase(item))) reasons.push("seed expression looks English");
  if (input.level === "beginner" && seedExpressions.some((item) => splitWords(item).length > 3)) {
    reasons.push("beginner seed expression too long");
  }

  if (themeAnchors.length > 0) {
    const titleDescriptionMatches = countThemeAnchorMatches([title, description], themeAnchors);
    const objectiveMatches = countThemeAnchorMatches(objectives, themeAnchors);

    // Temporarily disabled. The current lexical anchor heuristic is too brittle
    // for curriculum planning and causes false negatives on otherwise valid units.
    void titleDescriptionMatches;
    void objectiveMatches;
  }

  const duplicateSeedPhrases = seedExpressions.filter((item) => existingPhraseTexts.has(normalize(item)));
  if (duplicateSeedPhrases.length >= Math.max(3, Math.ceil(seedExpressions.length * 0.6))) {
    reasons.push("too many existing seed expressions reused");
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
  const englishLikeSeedPhrases = seedExpressions.filter((item) => looksEnglishSeedPhrase(item));
  const tooLongBeginnerSeedPhrases =
    input.level === "beginner"
      ? seedExpressions.filter((item) => splitWords(item).length > 3)
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
