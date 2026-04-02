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
import {
  CURRICULUM_QUALITY_RULES,
  JSON_ONLY_RULES,
  PROVERB_GUARDRAILS,
  getCulturalSituationRules,
  getLevelPedagogyRules,
  getPhrasePromptGuardrails,
  getStandardLanguageRules,
  getSuggestionGuardrails
} from "./promptGuardrails.js";
import { buildThemeAlignmentInstruction } from "./unitTheme.js";

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

function isRetryableGeminiError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  if (statusCode === 429 || statusCode === 500 || statusCode === 503 || statusCode === 504) return true;

  const message = error instanceof Error ? error.message : String(error || "");
  return /(429|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|Too Many Requests|Service Unavailable)/i.test(message);
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
      const reason = error instanceof Error ? error.message : String(error);
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

function buildPhrasesPrompt(input: GeneratePhrasesInput) {
  const seedWords = input.seedWords?.length ? input.seedWords.join(", ") : "";
  const extraInstructions = input.extraInstructions?.trim() || "";
  const existingPhrases = input.existingPhrases?.length
    ? input.existingPhrases.slice(0, 40).join(" | ")
    : "";
  return [
    "You are an expert curriculum writer for a conversational African language-learning app.",
    "Generate learner-safe, reusable target-language phrases for a single lesson.",
    "Return ONLY valid JSON with this shape:",
    "{\"phrases\":[{\"text\":string,\"translations\":string[],\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getPhrasePromptGuardrails(input).map((rule) => `- ${rule}`),
    "- translations must contain at least one item.",
    "- difficulty must be an integer between 1 and 5.",
    "- Keep outputs reusable for spaced repetition across future lessons.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.lessonTitle ? `Lesson title: ${input.lessonTitle}` : "",
    input.lessonDescription ? `Lesson description: ${input.lessonDescription}` : "",
    seedWords ? `Seed words: ${seedWords}` : "",
    extraInstructions ? `Extra generation instructions: ${extraInstructions}` : "",
    existingPhrases ? `Existing phrases to avoid: ${existingPhrases}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWordsPrompt(input: GenerateWordsInput) {
  const seedWords = input.seedWords?.length ? input.seedWords.join(", ") : "";
  const existingWords = input.existingWords?.length
    ? input.existingWords.slice(0, 60).join(" | ")
    : "";
  return [
    "You are an expert curriculum writer for a conversational African language-learning app.",
    "Generate learner-safe single words for a lesson. These are lexical items, not full expressions.",
    "Return ONLY valid JSON with this shape:",
    "{\"words\":[{\"text\":string,\"translations\":string[],\"lemma\":string?,\"partOfSpeech\":string?,\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    "- text must be a single target-language word, not a sentence and not a multi-word expression.",
    "- translations must contain at least one item.",
    "- lemma and partOfSpeech are optional but should be filled when obvious.",
    "- examples.original must stay simple and in the target language.",
    "- examples.translation must be English.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.lessonTitle ? `Lesson title: ${input.lessonTitle}` : "",
    input.lessonDescription ? `Lesson description: ${input.lessonDescription}` : "",
    seedWords ? `Seed words: ${seedWords}` : "",
    input.extraInstructions ? `Extra generation instructions: ${input.extraInstructions}` : "",
    existingWords ? `Existing words to avoid: ${existingWords}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildChaptersPrompt(input: GenerateChaptersInput) {
  const existingTitles = input.existingChapterTitles?.length
    ? input.existingChapterTitles.slice(0, 80).join(" | ")
    : "";
  return [
    "You are an expert curriculum designer for a conversational African language-learning app.",
    "Generate chapter-level curriculum themes, not lesson titles and not vocabulary dumps.",
    "Return ONLY valid JSON with this shape:",
    "{\"chapters\":[{\"title\":string,\"description\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    "- title and description must be in English.",
    "- title should name a communicative chapter theme such as Starting a Conversation or Asking for Directions.",
    "- description should explain what the learner will be able to do in that chapter.",
    "- Do not output lesson titles, unit titles, or grammar headings only.",
    `Generate exactly ${input.count} chapters unless duplicates force fewer valid results.`,
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.topic ? `Theme focus: ${input.topic}` : "",
    input.extraInstructions ? `Extra generation instructions: ${input.extraInstructions}` : "",
    existingTitles ? `Existing chapter titles to avoid: ${existingTitles}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSentencesPrompt(input: GenerateSentencesInput) {
  const allowedExpressions = input.allowedExpressions?.length
    ? input.allowedExpressions
        .slice(0, 20)
        .map((item) => `${item.text} => ${item.translations.join(" / ")}`)
        .join(" | ")
    : "";
  const allowedWords = input.allowedWords?.length
    ? input.allowedWords
        .slice(0, 20)
        .map((item) => `${item.text} => ${item.translations.join(" / ")}`)
        .join(" | ")
    : "";
  const existingSentences = input.existingSentences?.length
    ? input.existingSentences.slice(0, 40).join(" | ")
    : "";
  const situations = input.situations?.length ? input.situations.join(" | ") : "";
  const sentenceGoals = input.sentenceGoals?.length ? input.sentenceGoals.join(" | ") : "";
  const hasExplicitInventory = Boolean((input.allowedExpressions?.length || 0) + (input.allowedWords?.length || 0));
  const allowDerivedComponents = Boolean(input.allowDerivedComponents);
  return [
    "You are generating short learner-safe sentences for a language-learning app.",
    hasExplicitInventory && !allowDerivedComponents
      ? "Build each sentence only from the allowed expressions and allowed words. Do not invent components outside the provided inventory."
      : "Generate the lesson's target sentences first. Then break each sentence into reusable word and expression components. You may introduce a small amount of support content when needed for natural speech.",
    "Return ONLY valid JSON with this shape:",
    "{\"sentences\":[{\"text\":string,\"translations\":string[],\"literalTranslation\":string?,\"usageNotes\":string?,\"explanation\":string?,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":string[],\"fixed\":boolean?,\"role\":\"core\"|\"support\"}],\"meaningSegments\":[{\"text\":string,\"componentIndexes\":number[]}]}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    ...getCulturalSituationRules(input.language).map((rule) => `- ${rule}`),
    "- Use the target language for sentence text and component text.",
    "- translations, literalTranslation, usageNotes, and explanation must be in English.",
    "- components must appear in sentence order.",
    "- Every component must include its own English translation.",
    "- meaningSegments must be English teaching chunks that map the English meaning back to the sentence components.",
    "- Every meaning segment must include text and componentIndexes.",
    "- meaningSegments must cover every component exactly once, in order. Group multiple components into one English chunk when needed.",
    "- Use natural but alignment-friendly English chunks such as \"is going\" for progressive markers plus verb, instead of forcing awkward one-word mappings.",
    "- Single-word reusable items should be returned as type=word.",
    "- Multi-word components are allowed only when they are genuinely fixed formulas, idiomatic chunks, or socially taught units.",
    "- If a component has more than one token and it is a fixed chunk, return it as type=expression and set fixed=true.",
    "- If a multi-word chunk is transparently compositional, split it into separate word components instead of returning one combined component.",
    "- Do not split fixed multi-word greeting formulas or respectful chunks into separate words. Keep chunks like respectful greetings as single expression components with fixed=true.",
    "- Possessive noun phrases or transparent verb-plus-direction combinations should usually be split into words, not stored as expressions.",
    "- Do not return a bare expression or greeting formula as a full sentence. Sentences should be fuller communicative utterances, not just a standalone chunk.",
    hasExplicitInventory && !allowDerivedComponents
      ? "- Every component must exactly match one allowed word or allowed expression text."
      : "- Mark components as role=core if they represent the main lesson target, or role=support if they only help make the sentence natural.",
    allowDerivedComponents
      ? "- You may introduce at most 1 support expression or at most 2 support words per sentence."
      : "",
    "- For beginner level, keep sentences short, natural, and easy to read aloud.",
    "- Prioritize sentences built around real-life pressure points and practical daily needs before abstract demonstration sentences.",
    "- Prefer sentences that sound like things a learner would genuinely need to say in the target culture, such as power, transport, market, money, family, food, school, work, health, safety, or asking for help.",
    hasExplicitInventory && !allowDerivedComponents
      ? "- Prefer sentences that reinforce already introduced lesson content instead of adding new grammar."
      : "- Keep the sentence centered on the lesson's communicative goal, not isolated vocabulary drills.",
    input.maxSentences ? `Generate at most ${input.maxSentences} sentences.` : "",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.lessonTitle ? `Lesson title: ${input.lessonTitle}` : "",
    input.lessonDescription ? `Lesson description: ${input.lessonDescription}` : "",
    input.conversationGoal ? `Conversation goal: ${input.conversationGoal}` : "",
    situations ? `Situations: ${situations}` : "",
    sentenceGoals ? `Sentence goals: ${sentenceGoals}` : "",
    allowedExpressions ? `Allowed expressions: ${allowedExpressions}` : "Allowed expressions: none",
    allowedWords ? `Allowed words: ${allowedWords}` : "Allowed words: none",
    input.extraInstructions ? `Extra generation instructions: ${input.extraInstructions}` : "",
    existingSentences ? `Existing sentences to avoid: ${existingSentences}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildEnhancePrompt(input: EnhancePhraseInput) {
  return [
    "You are enhancing a single phrase for a language-learning app.",
    "Improve the teaching metadata only. Do not change the phrase text or its meanings.",
    "Return ONLY valid JSON with this shape:",
    "{\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...CURRICULUM_QUALITY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    "- Use the target language for examples.original and English for examples.translation.",
    "- Examples must be short, natural, and no harder than the phrase level.",
    "- Explanation should help a learner know when to use the phrase, in simple English.",
    "- difficulty must be an integer between 1 and 5.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Expression: ${input.text}`,
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
    "You are generating culturally authentic proverbs for a language-learning app.",
    "Return ONLY valid JSON with this shape:",
    "{\"proverbs\":[{\"text\":string,\"translation\":string,\"contextNote\":string?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...PROVERB_GUARDRAILS.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language as "yoruba" | "igbo" | "hausa").map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level as "beginner" | "intermediate" | "advanced").map((rule) => `- ${rule}`),
    "- translation should be concise but complete.",
    "- contextNote is required for every proverb.",
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
    "You are designing the next strong lesson or unit idea in a coherent language curriculum.",
    "Return ONLY valid JSON with this shape:",
    "{\"title\":string,\"description\":string?,\"language\":string,\"level\":string,\"objectives\":[string],\"seedExpressions\":[string],\"proverbs\":[{\"text\":string,\"translation\":string,\"contextNote\":string?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Use the target language for seedExpressions only.",
    "- Titles, descriptions, objectives, and all planning metadata must be entirely in English.",
    "- Do not include target-language words, phrases, markers, or quoted examples inside title, description, or objectives.",
    "- If you need to refer to a target-language item in planning metadata, describe its function in English instead of quoting it.",
    "- Keep objectives short and measurable.",
    "- objectives should read like stage goals from foundation to controlled practice to listening/review.",
    "- Return 3 to 5 objectives.",
    "- Return 4 to 8 seedExpressions.",
    "- seedExpressions should reflect the lesson content and difficulty, not random vocabulary.",
    // Temporarily relaxed. Beginner seed-expression length is currently too restrictive
    // for real conversational planning and is disabled until the planner rules are revisited.
    // "- For beginner level, at least 6 seedExpressions should be 1 to 3 words.",
    // "- For beginner level, every seedExpression must be 1 to 3 words.",
    // "- For beginner level, avoid full questions and full answer sentences in seedExpressions.",
    "- For beginner level, prefer reusable vocabulary chunks over complete conversational turns.",
    "- proverbs.text should be in the target language as a full proverb or saying, not an ordinary greeting or routine phrase.",
    "- proverbs.translation and contextNote should be in English.",
    "- If you cannot produce a real proverb for this lesson, return an empty proverbs array instead of ordinary phrases.",
    "- Treat the provided curriculum context as approved prior curriculum memory.",
    "- Continue from that memory instead of restarting the curriculum.",
    "- Reuse earlier content deliberately for reinforcement and spaced repetition, but avoid shallow duplication.",
    "- Do not repeat the same lesson intent, same main expression focus, or the same proverb as if it were new content unless this is an explicit review context.",
    "- Avoid phrases and proverbs already covered in the provided curriculum context unless they are being reused deliberately for reinforcement.",
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
    "You are planning a complete language-learning unit before any lesson content is generated.",
    "Return ONLY valid JSON with this shape:",
    "{\"lessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"conversationGoal\":string,\"situations\":[string],\"sentenceGoals\":[string],\"focusSummary\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Plan the whole unit first, not one lesson at a time.",
    "- Return exactly the requested lesson count.",
    "- Treat the provided curriculum context as approved prior curriculum memory.",
    "- Continue from that memory instead of restarting the curriculum from the easiest material.",
    "- Each lesson must have a distinct primary focus, not a renamed repeat of another lesson.",
    "- Lessons may recycle earlier content for retention and spaced repetition, but each lesson must introduce a clearly different communicative focus.",
    "- Do not reuse the same proverb, same main lesson intent, or the same sentence-pattern focus as if it were new content unless this is an explicit review lesson.",
    "- If extra instructions assign specific subtopics to specific lessons, follow that allocation exactly.",
    "- Titles, descriptions, objectives, and focusSummary must be in English only.",
    "- conversationGoal must be in English only and describe what the learner should be able to do in that lesson.",
    "- situations must be in English only and describe concrete scenes or uses for the lesson.",
    "- sentenceGoals must be in English only and describe the target sentence meanings the learner should reach in that lesson.",
    "- Return exactly 1 conversationGoal.",
    "- Return 2 to 4 situations.",
    "- Return 2 to 5 sentenceGoals.",
    "- Plan each lesson around communicative sentences first, not isolated vocabulary first.",
    "- Do not restart from the same easiest cluster in every lesson.",
    "- Spread the requested coverage across the lesson sequence coherently.",
    `- ${buildThemeAlignmentInstruction({ unitTitle: input.unitTitle, unitDescription: input.unitDescription, topic: input.topic, themeAnchors: input.themeAnchors })}`,
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Requested lesson count: ${input.lessonCount}`,
    input.unitTitle ? `Unit title: ${input.unitTitle}` : "",
    input.unitDescription ? `Unit description: ${input.unitDescription}` : "",
    input.topic ? `Topic: ${input.topic}` : "",
    input.curriculumInstruction ? `Curriculum instruction: ${input.curriculumInstruction}` : "",
    input.extraInstructions ? `Extra instructions: ${input.extraInstructions}` : "",
    input.existingLessonsSummary ? `Curriculum memory and existing lesson summary:\n${input.existingLessonsSummary}` : "",
    existingUnitTitles ? `Existing unit titles (avoid overlap): ${existingUnitTitles}` : "",
    existingLessonTitles ? `Existing lesson titles (avoid overlap when adding new lessons): ${existingLessonTitles}` : "",
    existingPhraseTexts ? `Existing phrase texts (reuse deliberately, avoid shallow duplication): ${existingPhraseTexts}` : "",
    existingProverbTexts ? `Existing proverb texts (avoid reuse): ${existingProverbTexts}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUnitRefactorPrompt(input: {
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
}) {
  const existingLessonTitles = input.existingLessonTitles?.length
    ? input.existingLessonTitles.slice(0, 120).join(" | ")
    : "";

  return [
    "You are planning a targeted refactor for an existing language-learning unit.",
    "Do not regenerate the whole unit. Propose minimal, precise lesson edits.",
    "Return ONLY valid JSON with this shape:",
    "{\"lessonPatches\":[{\"lessonId\":string,\"lessonTitle\":string?,\"rationale\":string?,\"operations\":[{\"type\":\"add_text_block\",\"stageIndex\":number,\"blockIndex\"?:number,\"content\":string}|{\"type\":\"move_block\",\"fromStageIndex\":number,\"fromBlockIndex\":number,\"toStageIndex\":number,\"toBlockIndex\"?:number}|{\"type\":\"remove_block\",\"stageIndex\":number,\"blockIndex\":number}|{\"type\":\"add_word_bundle\",\"wordText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"replace_word_bundle\",\"oldWordText\":string,\"newWordText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"remove_word_bundle\",\"wordText\":string}|{\"type\":\"add_sentence_bundle\",\"sentenceText\":string,\"translations\":[string],\"literalTranslation\"?:string,\"usageNotes\"?:string,\"explanation\"?:string,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":[string],\"fixed\":boolean?,\"role\":\"core\"|\"support\"}]}|{\"type\":\"replace_sentence_bundle\",\"oldSentenceText\":string,\"newSentenceText\":string,\"translations\":[string],\"literalTranslation\"?:string,\"usageNotes\"?:string,\"explanation\"?:string,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":[string],\"fixed\":boolean?,\"role\":\"core\"|\"support\"}]}|{\"type\":\"remove_sentence_bundle\",\"sentenceText\":string}|{\"type\":\"add_expression_bundle\",\"expressionText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"replace_expression_bundle\",\"oldExpressionText\":string,\"newExpressionText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"remove_expression_bundle\",\"expressionText\":string}|{\"type\":\"add_match_translation_block\",\"stageIndex\":number,\"expressionTexts\"?:string[]}]}],\"newLessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"conversationGoal\":string,\"situations\":[string],\"sentenceGoals\":[string],\"focusSummary\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Use lessonIds exactly as provided in the lesson snapshot. Do not invent lessonIds.",
    "- Only use the allowed operation types.",
    "- Use add_text_block for short helper text, explanations, or prompts inside an existing stage.",
    "- Use move_block or remove_block for precise block rearrangement only when necessary.",
    "- Prefer sentence bundle operations when the lesson's communicative flow should change.",
    "- Use add_word_bundle, replace_word_bundle, or remove_word_bundle for standalone word targets.",
    "- Use add_sentence_bundle to add a new teaching sentence with its reusable component breakdown.",
    "- Use replace_sentence_bundle when a lesson should teach a different sentence instead.",
    "- Multi-word sentence components are allowed only for genuinely fixed formulas or socially taught chunks. Mark those with fixed=true.",
    "- If a multi-word chunk is transparently compositional, split it into separate word components instead of returning one combined component.",
    "- Use remove_sentence_bundle when a sentence should no longer be taught.",
    "- Use add_expression_bundle or replace_expression_bundle only for component-level fixes.",
    "- Prefer minimal changes. Do not rewrite a whole lesson if one or two operations can fix it.",
    "- If an expression should no longer be taught in a lesson, use remove_expression_bundle.",
    "- Use add_match_translation_block to add one phrase-to-translation matching exercise after Stage 1. Put it in Stage 2 or Stage 3 only.",
    "- If lessonCount is greater than the number of existing lessons, return newLessons for the extra lessons needed.",
    "- If lessonCount is not greater than the existing lesson count, return an empty newLessons array.",
    "- Titles, descriptions, objectives, and rationale must be in English only.",
    "- Expression text must be in the target language.",
    "- translations must be in English.",
    "- Teach the standard form of the target language first.",
    `- ${buildThemeAlignmentInstruction({ unitTitle: input.unitTitle, unitDescription: input.unitDescription, topic: input.topic, themeAnchors: input.themeAnchors })}`,
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Requested lesson count after refactor: ${input.lessonCount}`,
    input.unitTitle ? `Unit title: ${input.unitTitle}` : "",
    input.unitDescription ? `Unit description: ${input.unitDescription}` : "",
    input.topic ? `Topic: ${input.topic}` : "",
    input.curriculumInstruction ? `Curriculum instruction: ${input.curriculumInstruction}` : "",
    input.extraInstructions ? `Targeted refactor instructions: ${input.extraInstructions}` : "",
    existingLessonTitles ? `Existing lesson titles: ${existingLessonTitles}` : "",
    `Existing lesson snapshot:\n${input.existingLessonsSnapshot}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function createGeminiClient(): LlmClient {
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
      language: "yoruba" | "igbo" | "hausa";
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
