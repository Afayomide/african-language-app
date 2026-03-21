import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { QuestionEntity } from "../../domain/entities/Question.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type {
  LlmClient,
  LlmGeneratedContextScenarioQuestion
} from "../../services/llm/types.js";

export type ScenarioTeachingContent = Pick<
  WordEntity | ExpressionEntity | SentenceEntity,
  "id" | "text" | "translations" | "explanation" | "difficulty" | "audio"
>;

export type ContextScenarioQuestionDraft = {
  type: "multiple-choice";
  subtype: "mc-select-context-response";
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  explanation: string;
};

const CONTEXT_SCENARIO_SIGNAL_PATTERNS = [
  /good morning/,
  /good afternoon/,
  /good evening/,
  /good night/,
  /how are you/,
  /are you well/,
  /\bthank\b/,
  /\bthanks\b/,
  /\bgrateful\b/,
  /\bsorry\b/,
  /excuse me/,
  /\bpardon\b/,
  /\bwelcome\b/,
  /\bplease\b/,
  /\bgoodbye\b/,
  /\bfarewell\b/,
  /see you/,
  /\bgreet/,
  /\bgreeting/,
  /\bhello\b/,
  /\brespectful\b/,
  /\bpolite\b/,
  /\belder\b/
];

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function makeUniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of values) {
    const value = String(row || "").trim();
    if (!value) continue;
    const key = normalizeText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function contentSupportsContextScenario(content: ScenarioTeachingContent) {
  const haystack = normalizeText(
    [
      content.text,
      ...(Array.isArray(content.translations) ? content.translations : []),
      String(content.explanation || "")
    ].join(" ")
  );
  if (!haystack) return false;
  return CONTEXT_SCENARIO_SIGNAL_PATTERNS.some((pattern) => pattern.test(haystack));
}

function buildCandidateOptionPool(
  content: ScenarioTeachingContent,
  lessonPool: ScenarioTeachingContent[],
  languagePool: ScenarioTeachingContent[]
) {
  const contextual = [...lessonPool, ...languagePool].filter(
    (item) => item.id !== content.id && contentSupportsContextScenario(item)
  );
  const fallback = [...lessonPool, ...languagePool].filter((item) => item.id !== content.id);
  const ordered = [content, ...contextual, ...fallback];
  const seen = new Set<string>();
  const result: ScenarioTeachingContent[] = [];

  for (const item of ordered) {
    const text = String(item.text || "").trim();
    if (!text) continue;
    const key = normalizeText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 8) break;
  }

  return result;
}

function sanitizeContextScenarioQuestion(input: {
  generated: LlmGeneratedContextScenarioQuestion;
  targetText: string;
  candidateTexts: string[];
  fallbackExplanation: string;
}): ContextScenarioQuestionDraft | null {
  const promptTemplate = String(input.generated.promptTemplate || "").trim();
  if (!promptTemplate) return null;

  const allowedCanonical = new Map(
    makeUniqueTexts(input.candidateTexts).map((text) => [normalizeText(text), text] as const)
  );
  const targetText = allowedCanonical.get(normalizeText(input.targetText)) || String(input.targetText || "").trim();
  if (!targetText) return null;

  const options: string[] = [];
  for (const rawOption of Array.isArray(input.generated.options) ? input.generated.options : []) {
    const canonical = allowedCanonical.get(normalizeText(String(rawOption || "")));
    if (!canonical) continue;
    if (options.some((item) => normalizeText(item) === normalizeText(canonical))) continue;
    options.push(canonical);
    if (options.length >= 4) break;
  }

  if (!options.some((item) => normalizeText(item) === normalizeText(targetText))) {
    options.unshift(targetText);
  }

  const sanitizedOptions = makeUniqueTexts(options).slice(0, 4);
  if (sanitizedOptions.length < 2) return null;

  const correctIndex = sanitizedOptions.findIndex((item) => normalizeText(item) === normalizeText(targetText));
  if (correctIndex < 0) return null;

  return {
    type: "multiple-choice",
    subtype: "mc-select-context-response",
    promptTemplate,
    options: sanitizedOptions,
    correctIndex,
    explanation: String(input.generated.explanation || "").trim() || input.fallbackExplanation
  };
}

export async function buildAiContextScenarioQuestionDraft(input: {
  llm: LlmClient;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  lessonTitle?: string;
  lessonDescription?: string;
  conversationGoal?: string;
  contentType: "word" | "expression";
  content: ScenarioTeachingContent;
  lessonPool: ScenarioTeachingContent[];
  languagePool: ScenarioTeachingContent[];
}): Promise<ContextScenarioQuestionDraft | null> {
  if (!contentSupportsContextScenario(input.content)) return null;

  const candidates = buildCandidateOptionPool(input.content, input.lessonPool, input.languagePool);
  if (candidates.length < 2) return null;

  let generated: LlmGeneratedContextScenarioQuestion | null = null;
  try {
    generated = await input.llm.generateContextScenarioQuestion({
      language: input.language,
      level: input.level,
      lessonTitle: input.lessonTitle,
      lessonDescription: input.lessonDescription,
      conversationGoal: input.conversationGoal,
      target: {
        type: input.contentType,
        text: String(input.content.text || "").trim(),
        translations: Array.isArray(input.content.translations) ? input.content.translations : [],
        explanation: String(input.content.explanation || "").trim()
      },
      candidateOptions: candidates.map((item) => ({
        text: String(item.text || "").trim(),
        translations: Array.isArray(item.translations) ? item.translations : [],
        explanation: String(item.explanation || "").trim()
      }))
    });
  } catch {
    return null;
  }

  if (!generated) return null;

  return sanitizeContextScenarioQuestion({
    generated,
    targetText: String(input.content.text || "").trim(),
    candidateTexts: candidates.map((item) => String(item.text || "").trim()),
    fallbackExplanation:
      String(input.content.explanation || "").trim() ||
      `The most appropriate response here is ${String(input.content.text || "").trim()}.`
  });
}
