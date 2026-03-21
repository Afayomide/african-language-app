import test from "node:test";
import assert from "node:assert/strict";

import type { LlmClient } from "../services/llm/types.js";
import {
  buildAiContextScenarioQuestionDraft,
  contentSupportsContextScenario
} from "../application/services/contextScenarioQuestions.js";

const EMPTY_AUDIO = {
  provider: "",
  model: "",
  voice: "",
  locale: "",
  format: "",
  url: "",
  s3Key: ""
} as const;

function createStubLlm(overrides?: Partial<LlmClient>): LlmClient {
  return {
    modelName: "stub",
    generateWords: async () => [],
    generateExpressions: async () => [],
    generatePhrases: async () => [],
    generateSentences: async () => [],
    generateContextScenarioQuestion: async () => null,
    generateChapters: async () => [],
    generateProverbs: async () => [],
    enhanceExpression: async () => ({}),
    enhancePhrase: async () => ({}),
    suggestLesson: async () => ({
      title: "",
      language: "yoruba",
      level: "beginner",
      objectives: [],
      seedExpressions: []
    }),
    planUnitLessons: async () => [],
    planUnitRefactor: async () => ({ lessonPatches: [], newLessons: [] }),
    ...overrides
  };
}

test("contentSupportsContextScenario gates social-context expressions only", () => {
  assert.equal(
    contentSupportsContextScenario({
      id: "1",
      text: "Ẹ káàárọ̀",
      translations: ["Good morning"],
      explanation: "A respectful morning greeting.",
      difficulty: 1,
      audio: EMPTY_AUDIO
    }),
    true
  );

  assert.equal(
    contentSupportsContextScenario({
      id: "2",
      text: "àga",
      translations: ["chair"],
      explanation: "",
      difficulty: 1,
      audio: EMPTY_AUDIO
    }),
    false
  );
});

test("buildAiContextScenarioQuestionDraft sanitizes AI output to known candidate options", async () => {
  let callCount = 0;
  const llm = createStubLlm({
    generateContextScenarioQuestion: async () => {
      callCount += 1;
      return {
        promptTemplate: "You greet your grandmother in the morning. Which do you say?",
        options: ["Ẹ káàárọ̀", "Ẹ káàsán", "Made up option", "Ẹ káalẹ́"],
        correctIndex: 0,
        explanation: "The respectful morning greeting fits this situation."
      };
    }
  });

  const draft = await buildAiContextScenarioQuestionDraft({
    llm,
    language: "yoruba",
    level: "beginner",
    lessonTitle: "Morning greetings",
    lessonDescription: "Respectful greetings",
    conversationGoal: "Greet elders correctly",
    contentType: "expression",
    content: {
      id: "1",
      text: "Ẹ káàárọ̀",
      translations: ["Good morning"],
      explanation: "Respectful morning greeting",
      difficulty: 1,
      audio: EMPTY_AUDIO
    },
    lessonPool: [
      {
        id: "1",
        text: "Ẹ káàárọ̀",
        translations: ["Good morning"],
        explanation: "Respectful morning greeting",
        difficulty: 1,
        audio: EMPTY_AUDIO
      },
      {
        id: "2",
        text: "Ẹ káàsán",
        translations: ["Good afternoon"],
        explanation: "Respectful afternoon greeting",
        difficulty: 1,
        audio: EMPTY_AUDIO
      }
    ],
    languagePool: [
      {
        id: "3",
        text: "Ẹ káalẹ́",
        translations: ["Good evening"],
        explanation: "Respectful evening greeting",
        difficulty: 1,
        audio: EMPTY_AUDIO
      }
    ]
  });

  assert.equal(callCount, 1);
  assert.deepEqual(draft, {
    type: "multiple-choice",
    subtype: "mc-select-context-response",
    promptTemplate: "You greet your grandmother in the morning. Which do you say?",
    options: ["Ẹ káàárọ̀", "Ẹ káàsán", "Ẹ káalẹ́"],
    correctIndex: 0,
    explanation: "The respectful morning greeting fits this situation."
  });
});

test("buildAiContextScenarioQuestionDraft skips non-contextual content without calling the LLM", async () => {
  let callCount = 0;
  const llm = createStubLlm({
    generateContextScenarioQuestion: async () => {
      callCount += 1;
      return null;
    }
  });

  const draft = await buildAiContextScenarioQuestionDraft({
    llm,
    language: "yoruba",
    level: "beginner",
    contentType: "word",
    content: {
      id: "1",
      text: "àga",
      translations: ["chair"],
      explanation: "",
      difficulty: 1,
      audio: EMPTY_AUDIO
    },
    lessonPool: [],
    languagePool: []
  });

  assert.equal(callCount, 0);
  assert.equal(draft, null);
});
