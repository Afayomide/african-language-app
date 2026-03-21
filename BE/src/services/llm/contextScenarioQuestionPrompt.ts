import type { GenerateContextScenarioQuestionInput } from "./types.js";
import {
  JSON_ONLY_RULES,
  getCulturalSituationRules,
  getLevelPedagogyRules,
  getStandardLanguageRules
} from "./promptGuardrails.js";

export function buildContextScenarioQuestionPrompt(input: GenerateContextScenarioQuestionInput) {
  const candidateOptions = input.candidateOptions
    .slice(0, 8)
    .map((item, index) => {
      const translations = Array.isArray(item.translations) ? item.translations.join(" / ") : "";
      const explanation = String(item.explanation || "").trim();
      return `${index + 1}. ${item.text} => ${translations}${explanation ? ` | note: ${explanation}` : ""}`;
    })
    .join("\n");

  return [
    "You are generating one context-appropriateness multiple-choice question for a language-learning app.",
    "Return ONLY valid JSON with this shape:",
    "{\"question\":{\"promptTemplate\":string,\"options\":string[],\"correctIndex\":number,\"explanation\":string}}",
    "Rules:",
    ...JSON_ONLY_RULES.map((rule) => `- ${rule}`),
    ...getStandardLanguageRules(input.language).map((rule) => `- ${rule}`),
    ...getLevelPedagogyRules(input.level).map((rule) => `- ${rule}`),
    ...getCulturalSituationRules(input.language).map((rule) => `- ${rule}`),
    "- promptTemplate must be English only and describe a short realistic situation.",
    "- The scenario must test when it is appropriate to say the target item, not how to spell it.",
    "- options must contain 2 to 4 distinct target-language option texts.",
    "- Use ONLY the provided candidate option texts. Do not invent new options. Do not change spelling or remove diacritics.",
    `- The correct answer must be exactly this target text: ${input.target.text}`,
    "- correctIndex must point to the target text inside options.",
    "- Distractors should be plausible but contextually wrong because of audience, politeness, time of day, social role, or communicative intent.",
    "- Do not use distractors that are only typos, missing tone marks, missing diacritics, or trivial spelling mistakes.",
    "- explanation must be English only and briefly explain why the correct option fits the scenario.",
    `Language: ${input.language}`,
    `Level: ${input.level}`,
    input.lessonTitle ? `Lesson title: ${input.lessonTitle}` : "",
    input.lessonDescription ? `Lesson description: ${input.lessonDescription}` : "",
    input.conversationGoal ? `Conversation goal: ${input.conversationGoal}` : "",
    `Target type: ${input.target.type}`,
    `Target text: ${input.target.text}`,
    `Target meanings: ${(input.target.translations || []).join(" / ")}`,
    input.target.explanation ? `Target explanation: ${input.target.explanation}` : "",
    `Candidate option texts:\n${candidateOptions}`
  ]
    .filter(Boolean)
    .join("\n");
}
