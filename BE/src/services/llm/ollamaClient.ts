import {
  buildGlossPrompt,
  GLOSS_SCHEMA,
  parseGlossResponse,
  validateGlosses,
  type GlossRequest,
  type GlossResult
} from "./componentGloss.js";
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
  LlmGeneratedSentenceComponent,
  LlmGeneratedSentenceMeaningSegment,
  LlmGeneratedProverb,
  LlmLessonSuggestion,
  LlmUnitRefactorPlan,
  LlmUnitPlanLesson
} from "./types.js";
import { buildContextScenarioQuestionPrompt } from "./contextScenarioQuestionPrompt.js";
import { SENTENCES_SCHEMA } from "./ollamaSchemas.js";
import {
  TONE_REVIEW_SCHEMA,
  buildToneReviewPrompt,
  type ToneReviewVerdict
} from "./linguisticReview.js";
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

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:26b";
const OLLAMA_MAX_RETRIES = Math.max(Number.parseInt(process.env.OLLAMA_MAX_RETRIES || "3", 10) || 3, 0);
const OLLAMA_INITIAL_RETRY_DELAY_MS = Math.max(
  Number.parseInt(process.env.OLLAMA_INITIAL_RETRY_DELAY_MS || "1500", 10) || 1500,
  250
);
// Local generation on large models is slow; allow a generous per-request ceiling.
const OLLAMA_TIMEOUT_MS = Math.max(
  Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || "300000", 10) || 300000,
  10000
);
// Deterministic-ish output is better for curriculum JSON. Override with OLLAMA_TEMPERATURE.
const OLLAMA_TEMPERATURE = Number.parseFloat(process.env.OLLAMA_TEMPERATURE || "0.4");
// Ollama defaults num_ctx to ~2k-4k tokens, which silently truncates our large
// curriculum prompts and produces unparseable output. Force a generous window.
// num_ctx is the budget for prompt + output combined. The sentence-generation prompt is
// large (full rule set + allowed inventory + existing sentences), so an 8k window leaves
// too little room for the nested output and it truncates mid-JSON. Give a wide default.
const OLLAMA_NUM_CTX = Math.max(Number.parseInt(process.env.OLLAMA_NUM_CTX || "16384", 10) || 16384, 2048);
// Without an explicit num_predict, output can be capped short and truncated mid-JSON
// (the model stops before closing the object). Give large structured responses room to
// finish. -1 means "generate until the context window is full or a stop token".
const OLLAMA_NUM_PREDICT = Number.parseInt(process.env.OLLAMA_NUM_PREDICT || "4096", 10) || 4096;
// format:"json" applies a grammar constraint that keeps output valid JSON but can
// mangle prose inside string values on weaker models. Set OLLAMA_JSON_MODE=0 to drop
// the constraint and rely on the lenient parser + retries instead (usually cleaner prose).
const OLLAMA_JSON_MODE = process.env.OLLAMA_JSON_MODE !== "0";
// When a task provides a JSON schema, pass it to Ollama's `format` field instead of the
// blunt "json" grammar. The schema forces required keys/enums (e.g. `role` on every
// component) and the exact shape, which the plain json mode does not. Set
// OLLAMA_JSON_SCHEMA=0 to fall back to plain json mode if a schema ever hurts quality.
const OLLAMA_JSON_SCHEMA = process.env.OLLAMA_JSON_SCHEMA !== "0";
// Reasoning models (gemma4:12b, gemma4:26b) put chain-of-thought in message.thinking and the
// answer in message.content. Our prompts are long, so the whole num_predict budget goes to
// thinking, generation stops on `length`, and content comes back EMPTY -> invalid_llm_json.
// We never use the reasoning text, so switch it off: it fixes the empty responses and is
// ~4x faster. Non-reasoning models ignore the flag. Set OLLAMA_THINK=1 to re-enable.
const OLLAMA_THINK = process.env.OLLAMA_THINK === "1";
let hasLoggedOllamaConfig = false;

// Resolve what goes in the request's `format` field. A per-task schema wins when schema
// mode is on; otherwise fall back to "json" grammar when json mode is on; otherwise none.
function resolveFormat(schema?: object): object | string | undefined {
  if (schema && OLLAMA_JSON_SCHEMA) return schema;
  if (OLLAMA_JSON_MODE) return "json";
  return undefined;
}

function parseJsonLogged<T>(text: string, operation: string): T {
  try {
    return parseJson<T>(text, "invalid_llm_json");
  } catch (error) {
    console.error(`[OLLAMA_PARSE_FAIL] ${operation}`, {
      length: text.length,
      preview: text.slice(0, 2000)
    });
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const value = error as { cause?: unknown; code?: unknown; message?: unknown };
    return [
      typeof value.message === "string" ? value.message : "",
      typeof value.code === "string" ? value.code : "",
      ...collectErrorMessages(value.cause, seen)
    ].filter(Boolean);
  }

  return [String(error || "")].filter(Boolean);
}

function isRetryableOllamaError(error: unknown) {
  const message = collectErrorMessages(error).join(" ");
  return /(fetch failed|network error|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR_|terminated|aborted|The operation was aborted|429|500|502|503|504|model .* not found|loading model)/i.test(
    message
  );
}

type OllamaChatResponse = {
  message?: { content?: string; thinking?: string };
  error?: string;
  done_reason?: string;
  eval_count?: number;
};

async function callOllamaOnce(prompt: string, schema?: object, model: string = OLLAMA_MODEL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const format = resolveFormat(schema);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        ...(OLLAMA_THINK ? {} : { think: false }),
        // format is either a task JSON schema (structured output) or "json" (valid syntax
        // only) or omitted, resolved from OLLAMA_JSON_SCHEMA / OLLAMA_JSON_MODE.
        ...(format !== undefined ? { format } : {}),
        options: {
          temperature: OLLAMA_TEMPERATURE,
          num_ctx: OLLAMA_NUM_CTX,
          num_predict: OLLAMA_NUM_PREDICT
        },
        messages: [
          {
            role: "system",
            content:
              "You are a precise curriculum-generation engine. You always reply with a single valid JSON object that matches the schema described in the user message. Never include markdown, code fences, or commentary."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(`Ollama request failed with status ${response.status}: ${bodyText.slice(0, 500)}`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    if (payload.error) {
      throw new Error(`Ollama error: ${payload.error}`);
    }
    const content = payload.message?.content?.trim() || "";
    // An empty body reaches the parser as "invalid_llm_json" with nothing to show. Say why:
    // done_reason "length" means the token budget ran out, and a populated `thinking` field
    // means it was spent on reasoning rather than the answer.
    if (!content) {
      console.warn("[OLLAMA_EMPTY_RESPONSE]", {
        model,
        doneReason: payload.done_reason,
        evalCount: payload.eval_count,
        thinkingChars: payload.message?.thinking?.length || 0,
        hint:
          payload.done_reason === "length"
            ? "Token budget exhausted. Raise OLLAMA_NUM_PREDICT, or set OLLAMA_THINK=0 if this is a reasoning model."
            : undefined
      });
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateContentWithRetry(
  prompt: string,
  operation: string,
  schema?: object,
  model: string = OLLAMA_MODEL
): Promise<string> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= OLLAMA_MAX_RETRIES) {
    try {
      return await callOllamaOnce(prompt, schema, model);
    } catch (error) {
      lastError = error;
      if (attempt >= OLLAMA_MAX_RETRIES || !isRetryableOllamaError(error)) {
        throw error;
      }

      const baseDelay = OLLAMA_INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      const jitter = Math.floor(Math.random() * Math.min(1000, Math.max(250, Math.floor(baseDelay * 0.25))));
      const delayMs = Math.min(baseDelay + jitter, 30000);
      const reason = collectErrorMessages(error).join(" | ") || String(error);
      console.warn(`[OLLAMA_RETRY] ${operation}`, {
        attempt: attempt + 1,
        delayMs,
        reason
      });
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Ollama request failed");
}

function toTranslations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

// Backstop normalization for weaker-model output. The JSON schema already forces `role`,
// `type`, and `translations` to be present, but this fills sane defaults if schema mode is
// off, coerces stray types, and clamps meaning-segment indexes into range so a single bad
// index does not sink the whole sentence at validation time.
function normalizeSentenceComponents(components: unknown): LlmGeneratedSentenceComponent[] {
  if (!Array.isArray(components)) return [];
  const result: LlmGeneratedSentenceComponent[] = [];
  for (const raw of components) {
    if (!raw || typeof raw !== "object") continue;
    const component = raw as Partial<LlmGeneratedSentenceComponent>;
    const text = String(component.text ?? "").trim();
    if (!text) continue;
    const type: "word" | "expression" =
      component.type === "word" || component.type === "expression"
        ? component.type
        : text.includes(" ")
          ? "expression"
          : "word";
    // Default to support: a helper role never wrongly promotes a word to a lesson target.
    const role: "core" | "support" =
      component.role === "core" || component.role === "support" ? component.role : "support";
    const normalized: LlmGeneratedSentenceComponent = {
      type,
      text,
      translations: toTranslations(component.translations),
      role
    };
    if (typeof component.fixed === "boolean") normalized.fixed = component.fixed;
    result.push(normalized);
  }
  return result;
}

function normalizeMeaningSegments(
  segments: unknown,
  componentCount: number
): LlmGeneratedSentenceMeaningSegment[] {
  if (!Array.isArray(segments)) return [];
  const result: LlmGeneratedSentenceMeaningSegment[] = [];
  for (const raw of segments) {
    if (!raw || typeof raw !== "object") continue;
    const segment = raw as Partial<LlmGeneratedSentenceMeaningSegment>;
    const text = String(segment.text ?? "").trim();
    const indexes = Array.isArray(segment.componentIndexes)
      ? Array.from(
          new Set(
            segment.componentIndexes
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value >= 0 && value < componentCount)
          )
        )
      : [];
    if (!text || indexes.length === 0) continue;
    result.push({ text, componentIndexes: indexes });
  }
  return result;
}

function normalizeSentences(sentences: unknown): LlmGeneratedSentence[] {
  if (!Array.isArray(sentences)) return [];
  const result: LlmGeneratedSentence[] = [];
  for (const raw of sentences) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Partial<LlmGeneratedSentence>;
    const text = String(source.text ?? "").trim();
    if (!text) continue;
    const components = normalizeSentenceComponents(source.components);
    const sentence: LlmGeneratedSentence = {
      text,
      translations: toTranslations(source.translations),
      components,
      meaningSegments: normalizeMeaningSegments(source.meaningSegments, components.length)
    };
    if (source.literalTranslation) sentence.literalTranslation = String(source.literalTranslation).trim();
    if (source.usageNotes) sentence.usageNotes = String(source.usageNotes).trim();
    if (source.explanation) sentence.explanation = String(source.explanation).trim();
    result.push(sentence);
  }
  return result;
}

/**
 * `model` overrides OLLAMA_MODEL for this client only, so one process can run a cheap model
 * for bulk tasks and a stronger one for sentence generation. Without it every Ollama client
 * shared the single module-level OLLAMA_MODEL and per-task routing was impossible.
 */
export function createOllamaClient(options?: { model?: string; asReviewer?: boolean }): LlmClient {
  const model = (options?.model || OLLAMA_MODEL).trim();
  const generate = (prompt: string, operation: string, schema?: object) =>
    generateContentWithRetry(prompt, operation, schema, model);

  if (!hasLoggedOllamaConfig || model !== OLLAMA_MODEL) {
    hasLoggedOllamaConfig = true;
    console.info("[LLM] Ollama client configured", {
      provider: "ollama",
      model,
      baseUrl: OLLAMA_BASE_URL,
      jsonMode: OLLAMA_JSON_MODE,
      jsonSchema: OLLAMA_JSON_SCHEMA
    });
  }

  // reviewTonation is attached ONLY for a client built as a reviewer. Putting it on every
  // client made review impossible to switch off: the base client carried its own reviewer,
  // so unsetting LLM_REVIEW_MODEL silently reviewed with the base model instead of
  // disabling review, and the reviewer-must-differ-from-generator guard could not see it.
  const reviewerMethods = options?.asReviewer
    ? {
        async reviewTonation(input: {
          language: string;
          sentences: Array<{ text: string; translations: string[] }>;
        }): Promise<ToneReviewVerdict[]> {
          if (!input.sentences.length) return [];
          const text = await generate(
            buildToneReviewPrompt(input),
            "reviewTonation",
            TONE_REVIEW_SCHEMA as unknown as object
          );
          const payload = parseJsonLogged<{ verdicts?: ToneReviewVerdict[] }>(text, "invalid_llm_json");
          return Array.isArray(payload.verdicts) ? payload.verdicts : [];
        }
      }
    : {};

  return {
    modelName: model,
    ...reviewerMethods,
    /**
     * English glosses for words a grouped meaning segment cannot explain. Never throws: a
     * failed reply leaves the glosses empty, which shows the dictionary entry instead of a
     * wrong claim. Aborting a lesson over this would be the worse trade.
     */
    async glossComponents(input: GlossRequest): Promise<GlossResult[]> {
      if (!input.targets.length) return [];
      try {
        const text = await generate(
          buildGlossPrompt(input),
          "glossComponents",
          GLOSS_SCHEMA as unknown as object
        );
        return validateGlosses(input, parseGlossResponse(text));
      } catch (error) {
        console.warn("[GLOSS_COMPONENTS] discarded", {
          model,
          sentence: input.sentence.slice(0, 40),
          reason: (error as Error).message
        });
        return [];
      }
    },
    async generateChapters(input: GenerateChaptersInput): Promise<LlmGeneratedChapter[]> {
      const text = await generate(buildChaptersPrompt(input), "generateChapters");
      const payload = parseJsonLogged<{ chapters: LlmGeneratedChapter[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.chapters) ? payload.chapters : [];
    },
    async generateWords(input: GenerateWordsInput): Promise<LlmGeneratedWord[]> {
      const text = await generate(buildWordsPrompt(input), "generateWords");
      const payload = parseJsonLogged<{ words: LlmGeneratedWord[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.words) ? payload.words : [];
    },
    async generatePhrases(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const text = await generate(buildPhrasesPrompt(input), "generatePhrases");
      const payload = parseJsonLogged<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async generateExpressions(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const text = await generate(buildPhrasesPrompt(input), "generateExpressions");
      const payload = parseJsonLogged<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async generateSentences(input: GenerateSentencesInput): Promise<LlmGeneratedSentence[]> {
      const text = await generate(
        buildSentencesPrompt(input),
        "generateSentences",
        SENTENCES_SCHEMA
      );
      const payload = parseJsonLogged<{ sentences: LlmGeneratedSentence[] }>(text, "invalid_llm_json");
      return normalizeSentences(payload.sentences);
    },
    async generateContextScenarioQuestion(
      input: GenerateContextScenarioQuestionInput
    ): Promise<LlmGeneratedContextScenarioQuestion | null> {
      const text = await generate(
        buildContextScenarioQuestionPrompt(input),
        "generateContextScenarioQuestion"
      );
      const payload = parseJsonLogged<{ question?: LlmGeneratedContextScenarioQuestion | null }>(text, "invalid_llm_json");
      return payload.question && typeof payload.question === "object" ? payload.question : null;
    },
    async enhancePhrase(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const text = await generate(buildEnhancePrompt(input), "enhancePhrase");
      return parseJsonLogged<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
    },
    async enhanceExpression(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const text = await generate(buildEnhancePrompt(input), "enhanceExpression");
      return parseJsonLogged<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
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
      const text = await generate(buildProverbsPrompt(input), "generateProverbs");
      const payload = parseJsonLogged<{ proverbs: LlmGeneratedProverb[] }>(text, "invalid_llm_json");
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
      const text = await generate(buildLessonSuggestPrompt(input), "suggestLesson");
      return parseJsonLogged<LlmLessonSuggestion>(text, "invalid_llm_json");
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
      const text = await generate(buildUnitPlanPrompt(input), "planUnitLessons");
      const payload = parseJsonLogged<{ lessons: LlmUnitPlanLesson[] }>(text, "invalid_llm_json");
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
      const text = await generate(buildUnitRefactorPrompt(input), "planUnitRefactor");
      const payload = parseJsonLogged<LlmUnitRefactorPlan>(text, "invalid_llm_json");
      return {
        lessonPatches: Array.isArray(payload.lessonPatches) ? payload.lessonPatches : [],
        newLessons: Array.isArray(payload.newLessons) ? payload.newLessons : []
      };
    }
  };
}
