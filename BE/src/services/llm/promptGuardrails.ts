import type { GeneratePhrasesInput } from "./types.js";

type Level = "beginner" | "intermediate" | "advanced";
type Language = GeneratePhrasesInput["language"];

export const JSON_ONLY_RULES = [
  "Return JSON only.",
  "Do not wrap the JSON in markdown fences.",
  "Do not include commentary, notes, or explanations outside the JSON.",
  "Do not use placeholders such as TBD, etc, N/A, or null strings."
];

export const CURRICULUM_QUALITY_RULES = [
  "Optimize for teaching quality, retention, and real-world usefulness, not novelty.",
  "Prefer high-frequency everyday language used in greetings, politeness, simple questions, daily needs, and short responses.",
  "Avoid ceremonial, literary, archaic, or highly regional expressions unless explicitly requested.",
  "Avoid near-duplicates that only change punctuation, spacing, or inflection with the same teaching value.",
  "Keep English translations natural and learner-friendly, not awkwardly literal unless the literal sense is pedagogically necessary.",
  "Use standard widely understood target-language wording whenever possible.",
  "If uncertain, choose the simpler and more teachable expression."
];

export function getStandardLanguageRules(language: Language) {
  if (language === "yoruba") {
    return [
      "Use Standard Yoruba orthography and the most widely taught standard Yoruba wording.",
      "Preserve Yoruba tone marks and underdots wherever the standard written form requires them. Do not strip diacritics.",
      "For common greetings, prefer standard forms such as Ẹ káàárọ̀, Ẹ káàsán, and Ẹ káalẹ́ when those meanings are intended.",
      "Avoid dialect-only, archaic, or nonstandard greeting variants unless explicitly requested."
    ];
  }

  if (language === "igbo") {
    return [
      "Use Standard Igbo (Igbo Izugbe) vocabulary and spelling.",
      "Preserve Igbo diacritics and standard written distinctions whenever they are part of the intended standard form.",
      "Prefer the most widely taught standard written form over regional dialect variants unless explicitly requested."
    ];
  }

  return [
    "Use Standard Hausa vocabulary and spelling that is widely understood.",
    "Prefer the standard widely taught form over strongly regional variants unless explicitly requested."
  ];
}

export function getLevelPedagogyRules(level: Level) {
  if (level === "beginner") {
    return [
      "Teach survival language first.",
      "For beginner level, keep target words and expressions short, high-frequency, and easy to reuse in multiple real conversations.",
      "Beginner content should still support sentence-based teaching. Prefer target items that can quickly appear inside practical everyday sentences.",
      "Prefer greetings, pronouns, yes/no, thanks, sorry, please, common requests, daily needs, money, transport, food, home life, health, work, school, family, safety, and short identity or location chunks."
    ];
  }

  if (level === "intermediate") {
    return [
      "Build mainly from beginner vocabulary plus a small number of new words.",
      "Prefer short practical expressions of 1 to 5 words.",
      "Introduce more natural combinations and short conversational turns.",
      "Do not jump to long complex sentences unless they are still very common."
    ];
  }

  return [
    "Build from earlier vocabulary whenever natural, but allow broader conversational coverage.",
    "Longer expressions are allowed, but they should still sound like real speech.",
    "Prefer useful everyday conversation over abstract or literary language."
  ];
}

export function getCulturalSituationRules(language: Language) {
  const sharedRules = [
    "Ground lesson content in practical daily situations people actually face, not generic textbook filler.",
    "Prefer communicative situations such as transport problems, market buying, family interaction, school, work, greetings, money pressure, food, health, power outages, water issues, directions, lateness, apologies, and asking for help.",
    "Prefer culturally plausible everyday speech from the language community over globally generic app-store phrasebook content.",
    "If a sentence references a struggle or need, keep it realistic, respectful, and teachable."
  ];

  if (language === "yoruba") {
    return [
      ...sharedRules,
      "For Yoruba, prefer situations that sound locally plausible in southwestern Nigerian everyday life without forcing slang or dialect."
    ];
  }

  if (language === "igbo") {
    return [
      ...sharedRules,
      "For Igbo, prefer situations that sound locally plausible in southeastern Nigerian everyday life without forcing dialect-only phrasing."
    ];
  }

  return [
    ...sharedRules,
    "For Hausa, prefer situations that sound locally plausible in everyday Hausa-speaking communities without forcing highly regional or literary forms."
  ];
}

export function getPhrasePromptGuardrails(input: GeneratePhrasesInput) {
  return [
    ...CURRICULUM_QUALITY_RULES,
    ...getStandardLanguageRules(input.language),
    ...getLevelPedagogyRules(input.level),
    ...getCulturalSituationRules(input.language),
    "text must be in the target language only.",
    "translations must be English only.",
    "translations must be an array of distinct concise meanings.",
    "If one phrase has multiple meanings, return each meaning as a separate array item.",
    "Never combine multiple meanings inside one translation string with '/', ',', ';', or 'or'.",
    "Do not transliterate or romanize inside text.",
    "Keep explanations short and concrete.",
    "Examples are optional. If provided, they must be short, natural, and no harder than the target phrase level.",
    "Avoid generating content that repeats existing phrases or obvious close variants of them."
  ];
}

export function getSuggestionGuardrails(level: Level, language: Language) {
  return [
    ...CURRICULUM_QUALITY_RULES,
    ...getStandardLanguageRules(language),
    ...getLevelPedagogyRules(level),
    ...getCulturalSituationRules(language),
    "Think like a curriculum designer, not a thesaurus.",
    "The title, description, and objectives must be in English only.",
    "Never write the title in the target language.",
    "The lesson or unit should feel like the next logical step in a coherent curriculum.",
    "Do not recycle an existing lesson or unit by changing only the title.",
    "Introduce only a manageable amount of new vocabulary.",
    "Design for repetition and later review, not maximum coverage in one lesson.",
    "Prefer chapter, unit, and lesson plans that teach learners how to handle real life situations in that language community."
  ];
}

export const PROVERB_GUARDRAILS = [
  ...CURRICULUM_QUALITY_RULES,
  "Only generate culturally authentic proverbs or proverb-like sayings.",
  "Do not invent fake proverbs that sound generic.",
  "A proverb must be a full saying, not an everyday greeting, label, noun phrase, time-of-day expression, or routine conversational phrase.",
  "Do not return ordinary lesson phrases disguised as proverbs.",
  "text must be in the target language.",
  "translation must be in English and should sound natural.",
  "translation should express a complete idea or wisdom, not just a simple greeting or label.",
  "contextNote is required and should explain when or why the proverb is used in simple English.",
  "Avoid duplicates and near-duplicates of existing proverbs."
];
