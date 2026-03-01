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

function buildLessonSuggestPrompt(input: { language: string; level: string; topic?: string }) {
  return [
    "Suggest a lesson outline.",
    "Return ONLY valid JSON with this shape:",
    "{\"title\":string,\"description\":string?,\"language\":string,\"level\":string,\"objectives\":[string],\"seedPhrases\":[string],\"proverbs\":[{\"text\":string,\"translation\":string,\"contextNote\":string?}]}",
    "Rules:",
    "- Use the target language for seedPhrases.",
    "- proverbs.text should be in the target language with short culturally authentic entries.",
    "- proverbs.translation should be in English.",
    "- Keep objectives short and measurable.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.topic ? `Topic: ${input.topic}` : ""
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
    async suggestLesson(input: { language: string; level: string; topic?: string }): Promise<LlmLessonSuggestion> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildLessonSuggestPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      return parseJson<LlmLessonSuggestion>(text, "invalid_llm_json");
    }
  };
}
