import { GoogleGenAI } from "@google/genai/node";
import type {
  EnhancePhraseInput,
  GenerateContextScenarioQuestionInput,
  GenerateChaptersInput,
  GenerateWordsInput,
  GeneratePhrasesInput,
  GenerateSentencesInput,
  LlmClient,
  LlmGeneratedChapter,
  LlmGeneratedContextScenarioQuestion,
  LlmGeneratedWord,
  LlmGeneratedPhrase,
  LlmGeneratedSentence,
  LlmGeneratedProverb,
  LlmLessonSuggestion,
  LlmUnitRefactorPlan,
  LlmUnitPlanLesson
} from "./types.js";
import { buildContextScenarioQuestionPrompt } from "./contextScenarioQuestionPrompt.js";
import { buildToneReviewPrompt, type ToneReviewVerdict } from "./linguisticReview.js";
import {
  buildChaptersPrompt,
  buildEnhancePrompt,
  buildLessonSuggestPrompt,
  buildPhrasesPrompt,
  buildProverbsPrompt,
  buildSentencesPrompt,
  buildUnitPlanPrompt,
  buildUnitRefactorPrompt,
  buildWordsPrompt,
  parseJson
} from "./prompts.js";

type GoogleServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};



const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const GEMINI_USE_VERTEX = process.env.GEMINI_USE_VERTEX !== "0";
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "";
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";
const GOOGLE_CLOUD_API_VERSION = process.env.GOOGLE_CLOUD_API_VERSION || "";
const GEMINI_MAX_RETRIES = Math.max(Number.parseInt(process.env.GEMINI_MAX_RETRIES || "4", 10) || 4, 0);
const GEMINI_INITIAL_RETRY_DELAY_MS = Math.max(
  Number.parseInt(process.env.GEMINI_INITIAL_RETRY_DELAY_MS || "2000", 10) || 2000,
  250
);
let hasLoggedGeminiConfig = false;

function parseServiceAccountCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON || "";
  if (!raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as GoogleServiceAccountCredentials;
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    console.error("Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON for Vertex AI", error);
    throw new Error("Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON");
  }
}

function getClient() {
  if (GEMINI_USE_VERTEX) {
    const credentials = parseServiceAccountCredentials();
    const project = GOOGLE_CLOUD_PROJECT || credentials?.project_id || "";
    if (!project) {
      console.error("Missing GOOGLE_CLOUD_PROJECT for Vertex AI");
      throw new Error("Missing GOOGLE_CLOUD_PROJECT");
    }

    const useGlobalVertexEndpoint = GOOGLE_CLOUD_LOCATION === "global";

    return new GoogleGenAI({
      vertexai: true,
      project,
      location: GOOGLE_CLOUD_LOCATION,
      apiVersion: GOOGLE_CLOUD_API_VERSION || (useGlobalVertexEndpoint ? "v1" : undefined),
      googleAuthOptions: credentials?.client_email && credentials?.private_key
        ? {
            credentials: {
              client_email: credentials.client_email,
              private_key: credentials.private_key
            }
          }
        : undefined,
      httpOptions: useGlobalVertexEndpoint
        ? {
            baseUrl: "https://aiplatform.googleapis.com/"
          }
        : undefined
    });
  }

  if (!GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY");
    throw new Error("Missing GEMINI_API_KEY");
  }

  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { status?: unknown; code?: unknown; statusCode?: unknown };
  const candidates = [value.status, value.code, value.statusCode];
  for (const candidate of candidates) {
    if (typeof candidate === "number") return candidate;
    if (typeof candidate === "string") {
      const parsed = Number.parseInt(candidate, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

function collectErrorMessages(error: unknown, seen = new Set<unknown>()): string[] {
  if (!error || seen.has(error)) return [];
  seen.add(error);

  if (error instanceof Error) {
    const messages = [error.name, error.message].filter(Boolean);
    const cause = (error as { cause?: unknown }).cause;
    return [...messages, ...collectErrorMessages(cause, seen)];
  }

  if (typeof error === "object") {
    const value = error as {
      cause?: unknown;
      code?: unknown;
      errno?: unknown;
      syscall?: unknown;
      hostname?: unknown;
      message?: unknown;
    };
    return [
      typeof value.message === "string" ? value.message : "",
      typeof value.code === "string" ? value.code : "",
      typeof value.errno === "string" ? value.errno : "",
      typeof value.syscall === "string" ? value.syscall : "",
      typeof value.hostname === "string" ? value.hostname : "",
      ...collectErrorMessages(value.cause, seen)
    ].filter(Boolean);
  }

  return [String(error || "")].filter(Boolean);
}

function isRetryableGeminiError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  // 502 Bad Gateway is a transient Google gateway error (often surfaced as
  // "exception parsing response") and must be retried alongside 500/503/504.
  if (statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504) return true;

  const message = collectErrorMessages(error).join(" ");
  return /(429|502|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|Too Many Requests|Service Unavailable|Bad Gateway|exception parsing response|fetch failed|sending request|network error|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR_|terminated|aborted)/i.test(message);
}

async function generateContentWithRetry(
  client: ReturnType<typeof getClient>,
  contents: string,
  operation: string
) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= GEMINI_MAX_RETRIES) {
    try {
      return await client.models.generateContent({
        model: GEMINI_MODEL,
        contents
      });
    } catch (error) {
      lastError = error;
      if (attempt >= GEMINI_MAX_RETRIES || !isRetryableGeminiError(error)) {
        throw error;
      }

      const baseDelay = GEMINI_INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      const jitter = Math.floor(Math.random() * Math.min(1000, Math.max(250, Math.floor(baseDelay * 0.25))));
      const delayMs = Math.min(baseDelay + jitter, 30000);
      const reason = collectErrorMessages(error).join(" | ") || String(error);
      console.warn(`[GEMINI_RETRY] ${operation}`, {
        attempt: attempt + 1,
        delayMs,
        reason
      });
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

let rawClient: ReturnType<typeof getClient> | null = null;

/**
 * Single-prompt access to the configured model, reusing this module's Vertex auth and retry
 * policy. For maintenance scripts (one-off backfills over existing content) that need the
 * model but match none of the LlmClient task methods. Not used by the generation flow.
 */
export async function generateRawText(prompt: string, operation = "generateRawText"): Promise<string> {
  if (!rawClient) rawClient = getClient();
  const response = await generateContentWithRetry(rawClient, prompt, operation);
  return response.text?.trim() || "";
}

export function createGeminiClient(options?: { asReviewer?: boolean }): LlmClient {
  const client = getClient();
  const credentials = GEMINI_USE_VERTEX ? parseServiceAccountCredentials() : null;
  const activeProject = GEMINI_USE_VERTEX ? (GOOGLE_CLOUD_PROJECT || credentials?.project_id || "") : "";

  if (!hasLoggedGeminiConfig) {
    hasLoggedGeminiConfig = true;
    console.info("[LLM] Gemini client configured", GEMINI_USE_VERTEX
      ? {
          provider: "vertex",
          model: GEMINI_MODEL,
          project: activeProject,
          location: GOOGLE_CLOUD_LOCATION,
          apiVersion: GOOGLE_CLOUD_API_VERSION || (GOOGLE_CLOUD_LOCATION === "global" ? "v1" : "default")
        }
      : {
          provider: "gemini-api",
          model: GEMINI_MODEL
        });
  }

  return {
    modelName: GEMINI_MODEL,
    async generateChapters(input: GenerateChaptersInput): Promise<LlmGeneratedChapter[]> {
      const response = await generateContentWithRetry(client, buildChaptersPrompt(input), "generateChapters");

      const text = response.text?.trim() || "";
      const payload = parseJson<{ chapters: LlmGeneratedChapter[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.chapters) ? payload.chapters : [];
    },
    async generateWords(input: GenerateWordsInput): Promise<LlmGeneratedWord[]> {
      const response = await generateContentWithRetry(client, buildWordsPrompt(input), "generateWords");

      const text = response.text?.trim() || "";
      const payload = parseJson<{ words: LlmGeneratedWord[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.words) ? payload.words : [];
    },
    async generatePhrases(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const response = await generateContentWithRetry(client, buildPhrasesPrompt(input), "generatePhrases");

      const text = response.text?.trim() || "";
      const payload = parseJson<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async generateExpressions(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const response = await generateContentWithRetry(client, buildPhrasesPrompt(input), "generateExpressions");

      const text = response.text?.trim() || "";
      const payload = parseJson<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async reviewTonation(input: {
      language: string;
      sentences: Array<{ text: string; translations: string[] }>;
    }): Promise<ToneReviewVerdict[]> {
      if (!input.sentences.length) return [];
      // The prompt already pins every answer to an enum, and parseJson recovers the usual
      // fenced/partial replies, so this rides the same plain-text path as the other calls.
      const response = await generateContentWithRetry(
        client,
        `${buildToneReviewPrompt(input)}\n\nReturn ONLY JSON of the form {"verdicts":[{"index":number,"tone_marks":"correct"|"missing"|"wrong","translation":"matches"|"mismatch"}]}. No markdown, no commentary.`,
        "reviewTonation"
      );
      const text = response.text?.trim() || "";
      const payload = parseJson<{ verdicts?: ToneReviewVerdict[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.verdicts) ? payload.verdicts : [];
    },
    // Strip reviewTonation unless this client was built as the reviewer. Carrying it on every
    // client made review impossible to switch off: with LLM_PROVIDER=gemini the BASE client
    // supplied its own reviewer, so commenting out LLM_REVIEW_MODEL kept reviewing anyway.
    // Placed after the method so it wins. Mirrors the same guard in ollamaClient.
    ...(options?.asReviewer ? {} : { reviewTonation: undefined }),
    async generateSentences(input: GenerateSentencesInput): Promise<LlmGeneratedSentence[]> {
      const response = await generateContentWithRetry(client, buildSentencesPrompt(input), "generateSentences");

      const text = response.text?.trim() || "";
      const payload = parseJson<{ sentences: LlmGeneratedSentence[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.sentences) ? payload.sentences : [];
    },
    async generateContextScenarioQuestion(
      input: GenerateContextScenarioQuestionInput
    ): Promise<LlmGeneratedContextScenarioQuestion | null> {
      const response = await generateContentWithRetry(
        client,
        buildContextScenarioQuestionPrompt(input),
        "generateContextScenarioQuestion"
      );

      const text = response.text?.trim() || "";
      const payload = parseJson<{ question?: LlmGeneratedContextScenarioQuestion | null }>(text, "invalid_llm_json");
      return payload.question && typeof payload.question === "object" ? payload.question : null;
    },
    async enhancePhrase(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const response = await generateContentWithRetry(client, buildEnhancePrompt(input), "enhancePhrase");

      const text = response.text?.trim() || "";
      return parseJson<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
    },
    async enhanceExpression(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const response = await generateContentWithRetry(client, buildEnhancePrompt(input), "enhanceExpression");

      const text = response.text?.trim() || "";
      return parseJson<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
    },
    async generateProverbs(input: {
      language: "yoruba" | "igbo" | "hausa" | "pidgin";
      level: "beginner" | "intermediate" | "advanced";
      lessonTitle?: string;
      lessonDescription?: string;
      count?: number;
      extraInstructions?: string;
      existingProverbs?: string[];
    }): Promise<LlmGeneratedProverb[]> {
      const response = await generateContentWithRetry(client, buildProverbsPrompt(input), "generateProverbs");

      const text = response.text?.trim() || "";
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
      const response = await generateContentWithRetry(client, buildLessonSuggestPrompt(input), "suggestLesson");

      const text = response.text?.trim() || "";
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
      reviewMode?: boolean;
      reviewInventorySummary?: string;
      themeAnchors?: string[];
      existingUnitTitles?: string[];
      existingLessonTitles?: string[];
      existingPhraseTexts?: string[];
      existingProverbTexts?: string[];
      existingLessonsSummary?: string;
    }): Promise<LlmUnitPlanLesson[]> {
      const response = await generateContentWithRetry(client, buildUnitPlanPrompt(input), "planUnitLessons");

      const text = response.text?.trim() || "";
      const payload = parseJson<{ lessons: LlmUnitPlanLesson[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.lessons) ? payload.lessons : [];
    },
    async planUnitRefactor(input: {
      language: string;
      level: string;
      lessonCount: number;
      unitTitle?: string;
      unitDescription?: string;
      topic?: string;
      curriculumInstruction?: string;
      extraInstructions?: string;
      themeAnchors?: string[];
      existingLessonsSnapshot: string;
      existingLessonTitles?: string[];
    }): Promise<LlmUnitRefactorPlan> {
      const response = await generateContentWithRetry(client, buildUnitRefactorPrompt(input), "planUnitRefactor");

      const text = response.text?.trim() || "";
      const payload = parseJson<LlmUnitRefactorPlan>(text, "invalid_llm_json");
      return {
        lessonPatches: Array.isArray(payload.lessonPatches) ? payload.lessonPatches : [],
        newLessons: Array.isArray(payload.newLessons) ? payload.newLessons : []
      };
    }
  };
}
