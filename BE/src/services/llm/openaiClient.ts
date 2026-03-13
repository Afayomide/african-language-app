import OpenAI from "openai";
import type {
  EnhancePhraseInput,
  GeneratePhrasesInput,
  LlmClient,
  LlmGeneratedPhrase,
  LlmGeneratedProverb,
  LlmLessonSuggestion,
  LlmUnitPlanLesson
} from "./types.js";
import {
  CURRICULUM_QUALITY_RULES,
  JSON_ONLY_RULES,
  PROVERB_GUARDRAILS,
  getLevelPedagogyRules,
  getPhrasePromptGuardrails,
  getStandardLanguageRules,
  getSuggestionGuardrails
} from "./promptGuardrails.js";
import { buildThemeAlignmentInstruction } from "./unitTheme.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

function buildClient() {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

function parseJson<T>(value: string, errorCode: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(errorCode);
  }
}

function buildPhrasesPrompt(input: GeneratePhrasesInput) {
  const seedWords = input.seedWords?.length ? input.seedWords.join(", ") : "";
  const extraInstructions = input.extraInstructions?.trim() || "";
  return [
    "You are generating phrases for a language lesson.",
    "Return ONLY valid JSON with this shape:",
    "{\"phrases\":[{\"text\":string,\"translations\":string[],\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getPhrasePromptGuardrails(input).map((rule) => `- ${rule}`),
    "- translations must contain at least one item.",
    "- difficulty between 1 and 5.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    seedWords ? `Seed words: ${seedWords}` : "",
    extraInstructions ? `Extra generation instructions: ${extraInstructions}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildEnhancePrompt(input: EnhancePhraseInput) {
  return [
    "You are enhancing a single phrase with pronunciation, explanation, examples, and difficulty.",
    "Return ONLY valid JSON with this shape:",
    "{\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...CURRICULUM_QUALITY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    "- Use the target language for examples.original and English for examples.translation.",
    "- difficulty between 1 and 5.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Phrase: ${input.text}`,
    `Existing meanings: ${input.translations.join(" | ")}`
  ].join("\n");
}

function buildProverbsPrompt(input: {
  language: string;
  level: string;
  lessonTitle?: string;
  lessonDescription?: string;
  count?: number;
  extraInstructions?: string;
  existingProverbs?: string[];
}) {
  const existingProverbs = input.existingProverbs?.length
    ? input.existingProverbs.slice(0, 40).join(" | ")
    : "";
  return [
    "You are generating proverbs for a language lesson.",
    "Return ONLY valid JSON with this shape:",
    "{\"proverbs\":[{\"text\":string,\"translation\":string,\"contextNote\":string?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...PROVERB_GUARDRAILS.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language as "yoruba" | "igbo" | "hausa").map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level as "beginner" | "intermediate" | "advanced").map((rule) => `- ${rule}`),
    "- translation should be concise but complete.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.lessonTitle ? `Lesson title: ${input.lessonTitle}` : "",
    input.lessonDescription ? `Lesson description: ${input.lessonDescription}` : "",
    input.count ? `Generate exactly ${input.count} items.` : "",
    input.extraInstructions ? `Extra generation instructions: ${input.extraInstructions}` : "",
    existingProverbs ? `Existing proverbs to avoid: ${existingProverbs}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLessonSuggestPrompt(input: {
  language: string;
  level: string;
  topic?: string;
  unitTitle?: string;
  unitDescription?: string;
  curriculumInstruction?: string;
  themeAnchors?: string[];
  existingUnitTitles?: string[];
  existingLessonTitles?: string[];
  existingPhraseTexts?: string[];
  existingProverbTexts?: string[];
}) {
  const existingUnitTitles = input.existingUnitTitles?.length
    ? input.existingUnitTitles.slice(0, 60).join(" | ")
    : "";
  const existingLessonTitles = input.existingLessonTitles?.length
    ? input.existingLessonTitles.slice(0, 120).join(" | ")
    : "";
  const existingPhraseTexts = input.existingPhraseTexts?.length
    ? input.existingPhraseTexts.slice(0, 150).join(" | ")
    : "";
  const existingProverbTexts = input.existingProverbTexts?.length
    ? input.existingProverbTexts.slice(0, 100).join(" | ")
    : "";
  return [
    "Suggest a lesson outline.",
    "Return ONLY valid JSON with this shape:",
    "{\"title\":string,\"description\":string?,\"language\":string,\"level\":string,\"objectives\":[string],\"seedPhrases\":[string],\"proverbs\":[{\"text\":string,\"translation\":string,\"contextNote\":string?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Use the target language for seedPhrases.",
    "- proverbs.text should be in the target language with short culturally authentic entries.",
    "- proverbs.translation should be in English.",
    "- Keep objectives short and measurable.",
    "- For beginner level, at least 6 seedPhrases should be 1 to 3 words.",
    "- For beginner level, at most 1 seedPhrase may be longer than 3 words.",
    "- For beginner level, avoid full questions and full answer sentences in seedPhrases.",
    "- Continue the curriculum like a teacher. Do not repeat prior lessons with renamed titles.",
    "- Build progression from known concepts to slightly harder ones.",
    "- Avoid phrases/proverbs already used in existing data.",
    `- ${buildThemeAlignmentInstruction({ unitTitle: input.unitTitle, unitDescription: input.unitDescription, topic: input.topic, themeAnchors: input.themeAnchors })}`,
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.topic ? `Topic: ${input.topic}` : "",
    input.curriculumInstruction ? `Curriculum instruction: ${input.curriculumInstruction}` : "",
    existingUnitTitles ? `Existing unit titles (avoid overlap): ${existingUnitTitles}` : "",
    existingLessonTitles ? `Existing lesson titles (avoid overlap): ${existingLessonTitles}` : "",
    existingPhraseTexts ? `Existing phrase texts (avoid reuse): ${existingPhraseTexts}` : "",
    existingProverbTexts ? `Existing proverb texts (avoid reuse): ${existingProverbTexts}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUnitPlanPrompt(input: {
  language: string;
  level: string;
  lessonCount: number;
  unitTitle?: string;
  unitDescription?: string;
  topic?: string;
  curriculumInstruction?: string;
  extraInstructions?: string;
  themeAnchors?: string[];
  existingUnitTitles?: string[];
  existingLessonTitles?: string[];
  existingPhraseTexts?: string[];
  existingProverbTexts?: string[];
  existingLessonsSummary?: string;
}) {
  const existingUnitTitles = input.existingUnitTitles?.length
    ? input.existingUnitTitles.slice(0, 60).join(" | ")
    : "";
  const existingLessonTitles = input.existingLessonTitles?.length
    ? input.existingLessonTitles.slice(0, 120).join(" | ")
    : "";
  const existingPhraseTexts = input.existingPhraseTexts?.length
    ? input.existingPhraseTexts.slice(0, 150).join(" | ")
    : "";
  const existingProverbTexts = input.existingProverbTexts?.length
    ? input.existingProverbTexts.slice(0, 100).join(" | ")
    : "";

  return [
    "Plan a complete unit before generating any lesson content.",
    "Return ONLY valid JSON with this shape:",
    "{\"lessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"seedPhrases\":[string],\"focusSummary\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Plan the whole unit first, not one lesson at a time.",
    "- Return exactly the requested lesson count.",
    "- Each lesson must have a distinct primary focus, not a renamed repeat of another lesson.",
    "- Lessons may recycle earlier phrases for retention, but each lesson must have a clearly different main focus.",
    "- If extra instructions assign subtopics to specific lessons, follow that allocation exactly.",
    "- Titles, descriptions, objectives, and focusSummary must be in English only.",
    "- seedPhrases must be in the target language only.",
    "- Do not restart from the same easiest cluster in every lesson.",
    "- Spread requested coverage across the lesson sequence coherently.",
    `- ${buildThemeAlignmentInstruction({ unitTitle: input.unitTitle, unitDescription: input.unitDescription, topic: input.topic, themeAnchors: input.themeAnchors })}`,
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Requested lesson count: ${input.lessonCount}`,
    input.unitTitle ? `Unit title: ${input.unitTitle}` : "",
    input.unitDescription ? `Unit description: ${input.unitDescription}` : "",
    input.topic ? `Topic: ${input.topic}` : "",
    input.curriculumInstruction ? `Curriculum instruction: ${input.curriculumInstruction}` : "",
    input.extraInstructions ? `Extra instructions: ${input.extraInstructions}` : "",
    input.existingLessonsSummary ? `Existing lesson summary:\n${input.existingLessonsSummary}` : "",
    existingUnitTitles ? `Existing unit titles (avoid overlap): ${existingUnitTitles}` : "",
    existingLessonTitles ? `Existing lesson titles (avoid overlap when adding new lessons): ${existingLessonTitles}` : "",
    existingPhraseTexts ? `Existing phrase texts (reuse deliberately, avoid shallow duplication): ${existingPhraseTexts}` : "",
    existingProverbTexts ? `Existing proverb texts (avoid reuse): ${existingProverbTexts}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function createOpenAiClient(): LlmClient {
  const client = buildClient();

  return {
    modelName: OPENAI_MODEL,
    async generatePhrases(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildPhrasesPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async enhancePhrase(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildEnhancePrompt(input)
      });

      const text = response.output_text?.trim() || "";
      return parseJson<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
    },
    async generateProverbs(input: {
      language: "yoruba" | "igbo" | "hausa";
      level: "beginner" | "intermediate" | "advanced";
      lessonTitle?: string;
      lessonDescription?: string;
      count?: number;
      extraInstructions?: string;
      existingProverbs?: string[];
    }): Promise<LlmGeneratedProverb[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildProverbsPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ proverbs: LlmGeneratedProverb[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.proverbs) ? payload.proverbs : [];
    },
    async suggestLesson(input: {
      language: string;
      level: string;
      topic?: string;
      unitTitle?: string;
      unitDescription?: string;
      curriculumInstruction?: string;
      themeAnchors?: string[];
      existingUnitTitles?: string[];
      existingLessonTitles?: string[];
      existingPhraseTexts?: string[];
      existingProverbTexts?: string[];
    }): Promise<LlmLessonSuggestion> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildLessonSuggestPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      return parseJson<LlmLessonSuggestion>(text, "invalid_llm_json");
    },
    async planUnitLessons(input: {
      language: string;
      level: string;
      lessonCount: number;
      unitTitle?: string;
      unitDescription?: string;
      topic?: string;
      curriculumInstruction?: string;
      extraInstructions?: string;
      themeAnchors?: string[];
      existingUnitTitles?: string[];
      existingLessonTitles?: string[];
      existingPhraseTexts?: string[];
      existingProverbTexts?: string[];
      existingLessonsSummary?: string;
    }): Promise<LlmUnitPlanLesson[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildUnitPlanPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ lessons: LlmUnitPlanLesson[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.lessons) ? payload.lessons : [];
    }
  };
}
