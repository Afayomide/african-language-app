import { GoogleGenAI } from "@google/genai";
import type {
  EnhancePhraseInput,
  GeneratePhrasesInput,
  LlmClient,
  LlmGeneratedPhrase,
  LlmLessonSuggestion
} from "./types.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getClient() {
  if (!GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY");
    throw new Error("Missing GEMINI_API_KEY");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

function extractJson(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return value;
  return value.slice(start, end + 1);
}

function parseJson<T>(value: string, errorCode: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    const extracted = extractJson(value);
    try {
      return JSON.parse(extracted) as T;
    } catch {
      throw new Error(errorCode);
    }
  }
}

function buildPhrasesPrompt(input: GeneratePhrasesInput) {
  const seedWords = input.seedWords?.length ? input.seedWords.join(", ") : "";
  const existingPhrases = input.existingPhrases?.length
    ? input.existingPhrases.slice(0, 40).join(" | ")
    : "";
  return [
    "You are generating phrases for a language lesson.",
    "Return ONLY valid JSON with this shape:",
    "{\"phrases\":[{\"text\":string,\"translation\":string,\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}]}",
    "Rules:",
    "- Use the target language for text and English for translation.",
    "- difficulty between 1 and 5.",
    "- Keep phrasing culturally accurate.",
    "- Generate unique phrases that do not repeat existing phrases.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.lessonTitle ? `Lesson title: ${input.lessonTitle}` : "",
    input.lessonDescription ? `Lesson description: ${input.lessonDescription}` : "",
    seedWords ? `Seed words: ${seedWords}` : "",
    existingPhrases ? `Existing phrases to avoid: ${existingPhrases}` : ""
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

function buildLessonSuggestPrompt(input: { language: string; level: string; topic?: string }) {
  return [
    "Suggest a lesson outline.",
    "Return ONLY valid JSON with this shape:",
    "{\"title\":string,\"description\":string?,\"language\":string,\"level\":string,\"objectives\":[string],\"seedPhrases\":[string]}",
    "Rules:",
    "- title, description, and objectives MUST be in English.",
    "- Use the target language for seedPhrases.",
    "- Keep objectives short and measurable.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.topic ? `Topic: ${input.topic}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function createGeminiClient(): LlmClient {
  const client = getClient();

  return {
    modelName: GEMINI_MODEL,
    async generatePhrases(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildPhrasesPrompt(input)
      });

      const text = response.text?.trim() || "";
      const payload = parseJson<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async enhancePhrase(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildEnhancePrompt(input)
      });

      const text = response.text?.trim() || "";
      return parseJson<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
    },
    async suggestLesson(input: { language: string; level: string; topic?: string }): Promise<LlmLessonSuggestion> {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildLessonSuggestPrompt(input)
      });

      const text = response.text?.trim() || "";
      return parseJson<LlmLessonSuggestion>(text, "invalid_llm_json");
    }
  };
}
