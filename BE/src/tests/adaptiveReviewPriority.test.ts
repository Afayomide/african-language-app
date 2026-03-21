import test from "node:test";
import assert from "node:assert/strict";

import type { LearnerContentPerformanceEntity } from "../domain/entities/LearnerContentPerformance.js";
import type { LearnerQuestionMissEntity } from "../domain/entities/LearnerQuestionMiss.js";
import type { QuestionEntity } from "../domain/entities/Question.js";
import {
  compareAdaptiveReviewMissedQuestions,
  scoreAdaptiveReviewTarget
} from "../application/services/adaptiveReviewPriority.js";

function makeQuestion(overrides: Partial<QuestionEntity>): QuestionEntity {
  const now = new Date("2026-03-21T00:00:00.000Z");
  return {
    id: "question-1",
    lessonId: "lesson-1",
    translationIndex: 0,
    type: "multiple-choice",
    subtype: "mc-select-translation",
    promptTemplate: "What does {phrase} mean?",
    options: ["a", "b"],
    correctIndex: 0,
    explanation: "",
    status: "published",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makeMiss(overrides: Partial<LearnerQuestionMissEntity>): LearnerQuestionMissEntity {
  const now = new Date("2026-03-21T00:00:00.000Z");
  return {
    id: "miss-1",
    userId: "user-1",
    lessonId: "lesson-1",
    questionId: "question-1",
    questionType: "multiple-choice",
    questionSubtype: "mc-select-translation",
    missCount: 1,
    firstMissedAt: now,
    lastMissedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makePerformance(overrides: Partial<LearnerContentPerformanceEntity>): LearnerContentPerformanceEntity {
  const now = new Date("2026-03-21T00:00:00.000Z");
  return {
    id: "perf-1",
    userId: "user-1",
    language: "yoruba",
    contentType: "expression",
    contentId: "content-1",
    exposureCount: 1,
    attemptCount: 1,
    correctCount: 0,
    wrongCount: 0,
    retryCount: 0,
    speakingFailureCount: 0,
    listeningFailureCount: 0,
    contextScenarioFailureCount: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("compareAdaptiveReviewMissedQuestions prioritizes missed scenario questions above generic misses", () => {
  const scenario = {
    question: makeQuestion({
      id: "scenario-question",
      subtype: "mc-select-context-response",
      promptTemplate: "You greet an elder in the morning. Which do you say?"
    }),
    miss: makeMiss({
      questionId: "scenario-question",
      questionSubtype: "mc-select-context-response",
      missCount: 1,
      lastMissedAt: new Date("2026-03-20T00:00:00.000Z")
    })
  };

  const generic = {
    question: makeQuestion({
      id: "generic-question",
      subtype: "mc-select-translation"
    }),
    miss: makeMiss({
      id: "miss-2",
      questionId: "generic-question",
      missCount: 4,
      lastMissedAt: new Date("2026-03-21T00:00:00.000Z")
    })
  };

  const sorted = [generic, scenario].sort(compareAdaptiveReviewMissedQuestions);
  assert.equal(sorted[0]?.question.id, "scenario-question");
});

test("scoreAdaptiveReviewTarget weights context-scenario failures above ordinary wrong attempts", () => {
  const baseline = makePerformance({
    wrongCount: 2,
    retryCount: 0,
    speakingFailureCount: 0,
    listeningFailureCount: 0,
    contextScenarioFailureCount: 0,
    attemptCount: 2,
    correctCount: 0
  });
  const scenarioHeavy = makePerformance({
    wrongCount: 2,
    retryCount: 0,
    speakingFailureCount: 0,
    listeningFailureCount: 0,
    contextScenarioFailureCount: 1,
    attemptCount: 2,
    correctCount: 0
  });

  assert.equal(scoreAdaptiveReviewTarget(baseline), 8);
  assert.equal(scoreAdaptiveReviewTarget(scenarioHeavy), 13);
});
