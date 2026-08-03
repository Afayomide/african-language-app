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
  SENTENCE_PROMPT_GUARDRAILS,
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
  const anchorSentences = input.anchorSentences?.length
    ? input.anchorSentences
        .slice(0, 8)
        .map((item) => `${item.text} => ${item.translations.slice(0, 2).join(" / ")}`)
        .join(" | ")
    : "";
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
    ...SENTENCE_PROMPT_GUARDRAILS.map((rule) => `- ${rule}`),
    "- Use the target language for sentence text and component text.",
    "- translations, literalTranslation, usageNotes, and explanation must be in English.",
    "- Do not use English contractions anywhere in English output. Write expanded forms such as \"that is\", \"do not\", \"I am\", and \"you are\".",
    "- components must appear in sentence order.",
    "- Every component must include its own English translation.",
    "- meaningSegments must be English teaching chunks that map the English meaning back to the sentence components.",
    "- Every meaning segment must include text and componentIndexes.",
    "- meaningSegments must be listed in natural English translation order and must cover every component exactly once. componentIndexes may point to source components in a different order when English word order differs from the target language. Group multiple components into one English chunk when needed.",
    "- Use natural but alignment-friendly English chunks such as \"is going\" for progressive markers plus verb, instead of forcing awkward one-word mappings.",
    "- Single-word reusable items should be returned as type=word.",
    "- Multi-word components are allowed only when they are genuinely fixed formulas, idiomatic chunks, or socially taught units. Mark those with fixed=true.",
    "- If a component has more than one token and it is a fixed chunk, return it as type=expression and set fixed=true.",
    "- If a multi-word chunk is transparently compositional, split it into separate word components instead of returning one combined component.",
    "- Possessive noun phrases or transparent verb-plus-direction combinations should usually be split into words, not stored as expressions.",
    "- Do not return a bare expression or greeting formula as a full sentence. Sentences should be fuller communicative utterances, not just a standalone chunk.",
    hasExplicitInventory && !allowDerivedComponents
      ? "- Every component must exactly match one allowed word, one allowed expression, or one word inside an allowed expression when that expression is breakable."
      : "- Mark components as role=core if they represent the main lesson target, or role=support if they only help make the sentence natural.",
    allowDerivedComponents
      ? "- You may introduce at most 1 support expression or at most 2 support words per sentence."
      : "",
    "- For beginner level, keep sentences short, natural, and easy to read aloud.",
    "- Prioritize sentences built around real-life pressure points and practical daily needs before abstract demonstration sentences.",
    "- Prefer sentences that sound like things a learner would genuinely need to say in the target culture, such as power, transport, market, money, family, food, school, work, health, safety, or asking for help.",
    anchorSentences
      ? "- Treat the provided anchor sentences as the exact review territory. Stay close to those anchor meanings."
      : "",
    // Keep in step with buildSentencesPrompt in prompts.ts: goals beat anchors, because review
    // goals are written from the same inventory the anchors come from.
    anchorSentences
      ? "- Sentence goals outrank anchor sentences. If a sentence goal states a meaning, render that exact meaning, even when an anchor sentence already says it. Reproduce the anchor verbatim in that case instead of altering a word to make it different."
      : "",
    anchorSentences
      ? "- Only for sentences BEYOND the sentence goals: recombine the allowed inventory into genuinely different structures, and do not repeat an anchor that a sentence goal already covers."
      : "",
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
    anchorSentences ? `Anchor sentences: ${anchorSentences}` : "",
    allowedExpressions ? `Allowed expressions: ${allowedExpressions}` : "Allowed expressions: none",
    allowedWords ? `Allowed words: ${allowedWords}` : "Allowed words: none",
    input.extraInstructions ? `Extra generation instructions: ${input.extraInstructions}` : "",
    existingSentences
      ? `Existing sentences already available for reuse when they exactly fit the lesson goal: ${existingSentences}`
      : ""
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
    ...getStandardLanguageRules(input.language as "yoruba" | "igbo" | "hausa" | "pidgin").map((rule) => `- ${rule}`),
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
      input.language as "yoruba" | "igbo" | "hausa" | "pidgin"
    ).map((rule) => `- ${rule}`),
    "- Use the target language for seedExpressions.",
    "- Titles, descriptions, objectives, and all planning metadata must be entirely in English.",
    "- Do not include target-language words, phrases, markers, or quoted examples inside title, description, or objectives.",
    "- If you need to refer to a target-language item in planning metadata, describe its function in English instead of quoting it.",
    "- proverbs.text should be in the target language as a full proverb or saying, not an ordinary greeting or routine phrase.",
    "- proverbs.translation and contextNote should be in English.",
    "- If you cannot produce a real proverb for this lesson, return an empty proverbs array instead of ordinary phrases.",
    "- Keep objectives short and measurable.",
    // Temporarily relaxed. Beginner seed-expression length is currently too restrictive
    // for real conversational planning and is disabled until the planner rules are revisited.
    // "- For beginner level, at least 6 seedExpressions should be 1 to 3 words.",
    // "- For beginner level, every seedExpression must be 1 to 3 words.",
    // "- For beginner level, avoid full questions and full answer sentences in seedExpressions.",
    "- Treat the provided curriculum context as approved prior curriculum memory.",
    "- Continue the curriculum like a teacher from that memory, not from scratch.",
    "- Reuse earlier content deliberately for reinforcement and spaced repetition, but avoid shallow duplication.",
    "- Do not repeat prior lessons with renamed titles, and do not reuse the same lesson intent, same main expression focus, or the same proverb as if it were new content unless this is an explicit review context.",
    "- Build progression from known concepts to slightly harder ones.",
    "- Avoid phrases/proverbs already used in existing data unless they are being reused deliberately for reinforcement.",
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
  reviewMode?: boolean;
  reviewInventorySummary?: string;
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
    "{\"lessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"conversationGoal\":string,\"situations\":[string],\"sentenceGoals\":[string],\"focusSummary\":string,\"targetWords\":[{\"text\":string,\"translations\":[string]}],\"targetExpressions\":[{\"text\":string,\"translations\":[string]}]}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa" | "pidgin"
    ).map((rule) => `- ${rule}`),
    "- Plan the whole unit first, not one lesson at a time.",
    "- Return exactly the requested lesson count.",
    "- Treat the provided curriculum context as approved prior curriculum memory.",
    "- Continue from that memory instead of restarting the curriculum from the easiest material.",
    "- Each lesson must have a distinct primary focus, not a renamed repeat of another lesson.",
    "- Lessons may recycle earlier content for retention and spaced repetition, but each lesson must have a clearly different communicative focus.",
    "- Do not reuse the same proverb, same main lesson intent, or the same sentence-pattern focus as if it were new content unless this is an explicit review lesson.",
    "- If extra instructions assign subtopics to specific lessons, follow that allocation exactly.",
    "- Titles, descriptions, objectives, and focusSummary must be in English only.",
    "- If you mention a target-language word or phrase in English metadata, wrap it in simple ASCII quotes and keep the surrounding sentence fully English.",
    "- conversationGoal must be in English only and describe what the learner should be able to do in that lesson.",
    "- situations must be in English only and describe concrete scenes or uses for the lesson.",
    "- sentenceGoals must be in English only and describe the target sentence meanings the learner should reach in that lesson.",
    "- Do not put target-language text inside sentenceGoals. Write English meanings only. Example: write \"How are you?\" not \"Báwo ni? (How are you?)\".",
    "- Return exactly 1 conversationGoal.",
    "- Return 2 to 4 situations.",
    "- Return 2 to 5 sentenceGoals.",
    "- targetWords and targetExpressions are the exact teachable items for the lesson, not helper/context words.",
    "- For each non-review core lesson, return 1 to 2 total targets across targetWords and targetExpressions.",
    "- Put single-token teachable items in targetWords and multi-word phrase targets in targetExpressions. A target expression is not automatically a fixed component; break it into word components if the parts have standalone meaning.",
    "- Do not put names, family members, pronouns, particles, or other context-only helper items in targetWords unless the lesson is specifically teaching that item.",
    "- If extra instructions name exact targets for a lesson, copy those exact targets into targetWords/targetExpressions.",
    "- Plan each lesson around communicative sentences first, not isolated vocabulary first.",
    "- Do not restart from the same easiest cluster in every lesson.",
    "- Spread requested coverage across the lesson sequence coherently.",
    ...(input.reviewMode
      ? [
          "- This is a review unit plan.",
          "- Review lesson conversationGoal, situations, and sentenceGoals must stay within the previously taught review inventory provided below.",
          "- Do not propose new teachable meanings, new target vocabulary, or new communicative territory outside that review inventory.",
          "- Fresh review practice is allowed only by recombining known words, known expressions, and already taught sentence patterns.",
          "- Plan review lessons as anchored variation on previously taught sentences, not open-ended new sentence invention.",
          "- For review unit plans, leave targetWords and targetExpressions empty unless the target is explicitly already known review practice."
        ]
      : []),
    `- ${buildThemeAlignmentInstruction({ unitTitle: input.unitTitle, unitDescription: input.unitDescription, topic: input.topic, themeAnchors: input.themeAnchors })}`,
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    `Requested lesson count: ${input.lessonCount}`,
    input.unitTitle ? `Unit title: ${input.unitTitle}` : "",
    input.unitDescription ? `Unit description: ${input.unitDescription}` : "",
    input.topic ? `Topic: ${input.topic}` : "",
    input.curriculumInstruction ? `Curriculum instruction: ${input.curriculumInstruction}` : "",
    input.extraInstructions ? `Extra instructions: ${input.extraInstructions}` : "",
    input.reviewInventorySummary ? `Review inventory summary:\n${input.reviewInventorySummary}` : "",
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
    "Plan a targeted refactor for an existing language-learning unit.",
    "Do not regenerate the whole unit. Propose precise lesson edits only.",
    "Return ONLY valid JSON with this shape:",
    "{\"lessonPatches\":[{\"lessonId\":string,\"lessonTitle\":string?,\"rationale\":string?,\"operations\":[{\"type\":\"add_text_block\",\"stageIndex\":number,\"blockIndex\"?:number,\"content\":string}|{\"type\":\"move_block\",\"fromStageIndex\":number,\"fromBlockIndex\":number,\"toStageIndex\":number,\"toBlockIndex\"?:number}|{\"type\":\"remove_block\",\"stageIndex\":number,\"blockIndex\":number}|{\"type\":\"add_word_bundle\",\"wordText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"replace_word_bundle\",\"oldWordText\":string,\"newWordText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"remove_word_bundle\",\"wordText\":string}|{\"type\":\"add_sentence_bundle\",\"sentenceText\":string,\"translations\":[string],\"literalTranslation\"?:string,\"usageNotes\"?:string,\"explanation\"?:string,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":[string],\"fixed\":boolean?,\"role\":\"core\"|\"support\"}]}|{\"type\":\"replace_sentence_bundle\",\"oldSentenceText\":string,\"newSentenceText\":string,\"translations\":[string],\"literalTranslation\"?:string,\"usageNotes\"?:string,\"explanation\"?:string,\"components\":[{\"type\":\"word\"|\"expression\",\"text\":string,\"translations\":[string],\"fixed\":boolean?,\"role\":\"core\"|\"support\"}]}|{\"type\":\"remove_sentence_bundle\",\"sentenceText\":string}|{\"type\":\"add_expression_bundle\",\"expressionText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"replace_expression_bundle\",\"oldExpressionText\":string,\"newExpressionText\":string,\"translations\"?:string[],\"explanation\"?:string,\"pronunciation\"?:string}|{\"type\":\"remove_expression_bundle\",\"expressionText\":string}|{\"type\":\"add_match_translation_block\",\"stageIndex\":number,\"expressionTexts\"?:string[]}]}],\"newLessons\":[{\"title\":string,\"description\":string,\"objectives\":[string],\"conversationGoal\":string,\"situations\":[string],\"sentenceGoals\":[string],\"focusSummary\":string}]}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getSuggestionGuardrails(
      input.level as "beginner" | "intermediate" | "advanced",
      input.language as "yoruba" | "igbo" | "hausa" | "pidgin"
    ).map((rule) => `- ${rule}`),
    "- Use lessonIds exactly as provided in the lesson snapshot. Do not invent lessonIds.",
    "- Only use the allowed operation types.",
    "- Prefer minimal changes over broad rewrites.",
    "- Prefer sentence bundle operations when the lesson's communicative flow should change.",
    "- Use add_word_bundle, replace_word_bundle, or remove_word_bundle for standalone word targets.",
    "- Use add_sentence_bundle to add a new teaching sentence with its reusable component breakdown.",
    "- Use replace_sentence_bundle when a lesson should teach a different sentence instead.",
    "- Multi-word components are allowed only when they are genuinely fixed formulas, idiomatic chunks, or socially taught units.",
    "- If a multi-word chunk is transparently compositional, split it into separate word components instead of returning one combined component.",
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
      language: "yoruba" | "igbo" | "hausa" | "pidgin";
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
      reviewMode?: boolean;
      reviewInventorySummary?: string;
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
