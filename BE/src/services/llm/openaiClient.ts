import OpenAI from "openai";
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

function buildWordsPrompt(input: GenerateWordsInput) {
  const seedWords = input.seedWords?.length ? input.seedWords.join(", ") : "";
  const existingWords = input.existingWords?.length
    ? input.existingWords.slice(0, 60).join(" | ")
    : "";
  return [
    "You are generating single words for a language lesson.",
    "Return ONLY valid JSON with this shape:",
    "{\"words\":[{\"text\":string,\"translations\":string[],\"lemma\":string?,\"partOfSpeech\":string?,\"pronunciation\":string?,\"explanation\":string?,\"examples\":[{\"original\":string,\"translation\":string}]?,\"difficulty\":number?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    "- text must be exactly one target-language word.",
    "- translations must contain at least one item.",
    "- examples.original must be in the target language and examples.translation in English.",
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
    "You are planning chapter-level curriculum for a language-learning app.",
    "Generate high-level chapter themes, not lessons, units, or isolated vocabulary lists.",
    "Return ONLY valid JSON with this shape:",
    "{\"chapters\":[{\"title\":string,\"description\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    "- title and description must be in English.",
    "- title should describe a communicative chapter theme such as Starting a Conversation or Talking About Family.",
    "- description should explain what the learner will be able to do in that chapter.",
    "- Do not return lesson titles, unit titles, or grammar labels only.",
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
    "{\"sentences\":[{\"text\":string,\"translations\":string[],\"literalTranslation\":string?,\"usageNotes\":string?,\"explanation\":string?,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":string[],\"role\":\"core\"|\"support\"}]}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    ...getCulturalSituationRules(input.language).map((rule) => `- ${rule}`),
    "- Use the target language for sentence text and component text.",
    "- translations, literalTranslation, usageNotes, and explanation must be in English.",
    "- components must appear in sentence order.",
    "- Every component must include its own English translation.",
    "- If a component has more than one token, treat it as an expression, not a word.",
    "- Do not split fixed multi-word greeting formulas or respectful chunks into separate words. Keep chunks like respectful greetings as single expression components.",
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
    "You are generating proverbs for a language lesson.",
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
    "Suggest a lesson outline.",
    "Return ONLY valid JSON with this shape:",
    "{\"title\":string,\"description\":string?,\"language\":string,\"level\":string,\"objectives\":[string],\"seedExpressions\":[string],\"proverbs\":[{\"text\":string,\"translation\":string,\"contextNote\":string?}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Use the target language for seedExpressions.",
    "- proverbs.text should be in the target language as a full proverb or saying, not an ordinary greeting or routine phrase.",
    "- proverbs.translation and contextNote should be in English.",
    "- If you cannot produce a real proverb for this lesson, return an empty proverbs array instead of ordinary phrases.",
    "- Keep objectives short and measurable.",
    "- For beginner level, at least 6 seedExpressions should be 1 to 3 words.",
    "- For beginner level, at most 1 seedPhrase may be longer than 3 words.",
    "- For beginner level, avoid full questions and full answer sentences in seedExpressions.",
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
    "{\"lessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"conversationGoal\":string,\"situations\":[string],\"sentenceGoals\":[string],\"focusSummary\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Plan the whole unit first, not one lesson at a time.",
    "- Return exactly the requested lesson count.",
    "- Each lesson must have a distinct primary focus, not a renamed repeat of another lesson.",
    "- Lessons may recycle earlier content for retention, but each lesson must have a clearly different communicative focus.",
    "- If extra instructions assign subtopics to specific lessons, follow that allocation exactly.",
    "- Titles, descriptions, objectives, and focusSummary must be in English only.",
    "- conversationGoal must be in English only and describe what the learner should be able to do in that lesson.",
    "- situations must be in English only and describe concrete scenes or uses for the lesson.",
    "- sentenceGoals must be in English only and describe the target sentence meanings the learner should reach in that lesson.",
    "- Return exactly 1 conversationGoal.",
    "- Return 2 to 4 situations.",
    "- Return 2 to 5 sentenceGoals.",
    "- Plan each lesson around communicative sentences first, not isolated vocabulary first.",
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
    "Plan a targeted refactor for an existing language-learning unit.",
    "Do not regenerate the whole unit. Propose precise lesson edits only.",
    "Return ONLY valid JSON with this shape:",
    "{\"lessonPatches\":[{\"lessonId\":string,\"lessonTitle\":string?,\"rationale\":string?,\"operations\":[{\"type\":\"add_text_block\",\"stageIndex\":number,\"blockIndex\"?:number,\"content\":string}|{\"type\":\"move_block\",\"fromStageIndex\":number,\"fromBlockIndex\":number,\"toStageIndex\":number,\"toBlockIndex\"?:number}|{\"type\":\"remove_block\",\"stageIndex\":number,\"blockIndex\":number}|{\"type\":\"add_word_bundle\",\"wordText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"replace_word_bundle\",\"oldWordText\":string,\"newWordText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"remove_word_bundle\",\"wordText\":string}|{\"type\":\"add_sentence_bundle\",\"sentenceText\":string,\"translations\":[string],\"literalTranslation\"?:string,\"usageNotes\"?:string,\"explanation\"?:string,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":[string],\"role\":\"core\"|\"support\"}]}|{\"type\":\"replace_sentence_bundle\",\"oldSentenceText\":string,\"newSentenceText\":string,\"translations\":[string],\"literalTranslation\"?:string,\"usageNotes\"?:string,\"explanation\"?:string,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":[string],\"role\":\"core\"|\"support\"}]}|{\"type\":\"remove_sentence_bundle\",\"sentenceText\":string}|{\"type\":\"add_expression_bundle\",\"expressionText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"replace_expression_bundle\",\"oldExpressionText\":string,\"newExpressionText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"remove_expression_bundle\",\"expressionText\":string}|{\"type\":\"add_match_translation_block\",\"stageIndex\":number,\"expressionTexts\"?:string[]}]}],\"newLessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"conversationGoal\":string,\"situations\":[string],\"sentenceGoals\":[string],\"focusSummary\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa"
    ).map((rule) => `- ${rule}`),
    "- Use lessonIds exactly as provided in the lesson snapshot. Do not invent lessonIds.",
    "- Only use the allowed operation types.",
    "- Prefer minimal changes over broad rewrites.",
    "- Prefer sentence bundle operations when the lesson's communicative flow should change.",
    "- Use add_word_bundle, replace_word_bundle, or remove_word_bundle for standalone word targets.",
    "- Use add_sentence_bundle to add a new teaching sentence with its reusable component breakdown.",
    "- Use replace_sentence_bundle when a lesson should teach a different sentence instead.",
    "- Use remove_sentence_bundle when a sentence should no longer be taught.",
    "- Use add_expression_bundle or replace_expression_bundle only for component-level fixes.",
    "- Use move_block and remove_block only for precise block-level fixes.",
    "- Use add_match_translation_block to add one phrase-to-translation matching exercise after Stage 1. Put it in Stage 2 or Stage 3 only.",
    "- If lessonCount is greater than the number of existing lessons, return newLessons for the extra lessons.",
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

export function createOpenAiClient(): LlmClient {
  const client = buildClient();

  return {
    modelName: OPENAI_MODEL,
    async generateChapters(input: GenerateChaptersInput): Promise<LlmGeneratedChapter[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildChaptersPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ chapters: LlmGeneratedChapter[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.chapters) ? payload.chapters : [];
    },
    async generateWords(input: GenerateWordsInput): Promise<LlmGeneratedWord[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildWordsPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ words: LlmGeneratedWord[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.words) ? payload.words : [];
    },
    async generatePhrases(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildPhrasesPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async generateExpressions(input: GeneratePhrasesInput): Promise<LlmGeneratedPhrase[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildPhrasesPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ phrases: LlmGeneratedPhrase[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.phrases) ? payload.phrases : [];
    },
    async generateSentences(input: GenerateSentencesInput): Promise<LlmGeneratedSentence[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildSentencesPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ sentences: LlmGeneratedSentence[] }>(text, "invalid_llm_json");
      return Array.isArray(payload.sentences) ? payload.sentences : [];
    },
    async generateContextScenarioQuestion(
      input: GenerateContextScenarioQuestionInput
    ): Promise<LlmGeneratedContextScenarioQuestion | null> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildContextScenarioQuestionPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<{ question?: LlmGeneratedContextScenarioQuestion | null }>(text, "invalid_llm_json");
      return payload.question && typeof payload.question === "object" ? payload.question : null;
    },
    async enhancePhrase(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildEnhancePrompt(input)
      });

      const text = response.output_text?.trim() || "";
      return parseJson<Partial<LlmGeneratedPhrase>>(text, "invalid_llm_json");
    },
    async enhanceExpression(input: EnhancePhraseInput): Promise<Partial<LlmGeneratedPhrase>> {
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
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: buildUnitRefactorPrompt(input)
      });

      const text = response.output_text?.trim() || "";
      const payload = parseJson<LlmUnitRefactorPlan>(text, "invalid_llm_json");
      return {
        lessonPatches: Array.isArray(payload.lessonPatches) ? payload.lessonPatches : [],
        newLessons: Array.isArray(payload.newLessons) ? payload.newLessons : []
      };
    }
  };
}
