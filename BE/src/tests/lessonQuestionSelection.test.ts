import test from "node:test";
import assert from "node:assert/strict";

import {
  createLessonQuestionSelectionState,
  selectLessonQuestionPlan,
  type LessonQuestionCandidate
} from "../application/services/lessonQuestionSelection.js";

function makeCandidate(
  overrides: Partial<LessonQuestionCandidate<string>> & Pick<LessonQuestionCandidate<string>, "stage" | "sourceGroup" | "sourceKey" | "questionType" | "questionSubtype">
): LessonQuestionCandidate<string> {
  return {
    payload: `${overrides.sourceKey}:${overrides.questionSubtype}:${overrides.stage}`,
    ...overrides
  };
}

test("selectLessonQuestionPlan does not repeat the same source and subtype across stages", () => {
  const plan = selectLessonQuestionPlan([
    makeCandidate({
      stage: 2,
      sourceGroup: "sentence",
      sourceKey: "sentence:1",
      questionType: "fill-in-the-gap",
      questionSubtype: "fg-word-order"
    }),
    makeCandidate({
      stage: 3,
      sourceGroup: "sentence",
      sourceKey: "sentence:1",
      questionType: "fill-in-the-gap",
      questionSubtype: "fg-word-order"
    }),
    makeCandidate({
      stage: 3,
      sourceGroup: "sentence",
      sourceKey: "sentence:2",
      questionType: "fill-in-the-gap",
      questionSubtype: "fg-word-order"
    })
  ]);

  const selectedKeys = plan.selectedCandidates.map((candidate) => `${candidate.sourceKey}:${candidate.questionSubtype}`);
  const uniqueKeys = new Set(selectedKeys);

  assert.equal(selectedKeys.length, uniqueKeys.size);
  assert.equal(
    plan.selectedCandidates.filter(
      (candidate) => candidate.sourceKey === "sentence:1" && candidate.questionSubtype === "fg-word-order"
    ).length,
    1
  );
});

test("createLessonQuestionSelectionState schedules subtype coverage across core lessons", () => {
  const state = createLessonQuestionSelectionState({
    lessons: [
      { lessonKey: "lesson-1", lessonMode: "core" },
      { lessonKey: "lesson-2", lessonMode: "core" },
      { lessonKey: "lesson-3", lessonMode: "core" },
      { lessonKey: "lesson-4", lessonMode: "core" }
    ]
  });

  const plannedLessons = Array.from(state.lessonPlans.values()).sort((left, right) => left.lessonIndex - right.lessonIndex);
  const requiredSubtypeKeys = plannedLessons.flatMap((lesson) =>
    [1, 2, 3].flatMap((stage) =>
      lesson.stageRequirements[stage as 1 | 2 | 3].map(
        (requirement) => `${requirement.stage}:${requirement.sourceGroup}:${requirement.questionSubtype}`
      )
    )
  );

  assert.equal(plannedLessons.length, 4);
  assert.ok(requiredSubtypeKeys.includes("2:sentence:mc-select-translation"));
  assert.ok(requiredSubtypeKeys.some((key) => key.endsWith(":sentence:fg-word-order")));
  assert.ok(requiredSubtypeKeys.includes("3:sentence:ls-mc-select-translation"));
  assert.ok(requiredSubtypeKeys.includes("2:lesson:mt-match-translation"));
});

test("selectLessonQuestionPlan prioritizes scheduled subtype requirements for the current lesson", () => {
  const selectionState = createLessonQuestionSelectionState({
    lessons: [
      { lessonKey: "lesson-1", lessonMode: "core" },
      { lessonKey: "lesson-2", lessonMode: "core" },
      { lessonKey: "lesson-3", lessonMode: "core" }
    ]
  });
  const lessonPlan = selectionState.lessonPlans.get("lesson-2");
  assert.ok(lessonPlan);

  const stage3Requirements = lessonPlan!.stageRequirements[3];
  const sentenceRequirement = stage3Requirements.find((requirement) => requirement.sourceGroup === "sentence");
  assert.ok(sentenceRequirement);

  const fallbackSubtype =
    sentenceRequirement!.questionSubtype === "fg-word-order" ? "mc-select-translation" : "fg-word-order";
  const questionTypeForRequirement =
    sentenceRequirement!.questionSubtype === "sp-pronunciation-compare"
      ? "speaking"
      : sentenceRequirement!.questionSubtype === "ls-mc-select-translation"
        ? "listening"
        : sentenceRequirement!.questionSubtype === "mc-select-translation"
          ? "multiple-choice"
          : "fill-in-the-gap";

  const plan = selectLessonQuestionPlan(
    [
      makeCandidate({
        stage: 3,
        sourceGroup: "sentence",
        sourceKey: "sentence:required",
        questionType: questionTypeForRequirement,
        questionSubtype: sentenceRequirement!.questionSubtype
      }),
      makeCandidate({
        stage: 3,
        sourceGroup: "sentence",
        sourceKey: "sentence:fallback",
        questionType: fallbackSubtype === "mc-select-translation" ? "multiple-choice" : "fill-in-the-gap",
        questionSubtype: fallbackSubtype
      })
    ],
    {
      lessonKey: "lesson-2",
      selectionState
    }
  );

  assert.equal(plan.selectedCandidates[0]?.questionSubtype, sentenceRequirement!.questionSubtype);
});
