import OpenAI from "openai";
import type {
  EnhancePhraseInput,
  GeneratePhrasesInput,
  LlmClient,
  LlmGeneratedPhrase,
  LlmGeneratedProverb,
  LlmLessonSuggestion
} from "./types.js";

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
    "{\"phrases\":[{\"text\":string,\"translation\":string,\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}]}",
    "Rules:",
    "- Use the target language for text and English for translation.",
    "- difficulty between 1 and 5.",
    "- Keep phrasing culturally accurate.",
    "- Beginner level: output mostly single words or very short chunks (1-2 words), not full sentences.",
    "- Beginner level: avoid punctuation that suggests full sentences.",
    "- Intermediate level: short practical expressions (1-5 words).",
    "- Advanced level: longer conversational expressions are allowed.",
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
    "- Use the target language for examples.original and English for examples.translation.",
    "- difficulty between 1 and 5.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Phrase: ${input.text}`,
    `Translation: ${input.translation}`
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
    "- text must be in the target language.",
    "- translation must be English and concise.",
    "- contextNote should be short and practical.",
    "- Avoid duplicates against existing proverbs list.",
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
  curriculumInstruction?: string;
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
    "- title, description, and objectives MUST be in English.",
    "- Title MUST be in English only. Never write title in the target language.",
    "- Use the target language for seedPhrases.",
    "- proverbs.text should be in the target language with short culturally authentic entries.",
    "- proverbs.translation should be in English.",
    "- Keep objectives short and measurable.",
    "- Continue the curriculum like a teacher. Do not repeat prior lessons with renamed titles.",
    "- Build progression from known concepts to slightly harder ones.",
    "- Avoid phrases/proverbs already used in existing data.",
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
      curriculumInstruction?: string;
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
    }
  };
}
