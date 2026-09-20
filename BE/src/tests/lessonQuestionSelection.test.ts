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

test("a lesson that introduces one item still fills its stages", () => {
  // The pacing the curriculum uses is one new item per lesson. The per-item limits used to
  // stop at 2 questions in stage 1 and 1 in stage 3, so such a lesson ended at ~13 blocks
  // no matter how many sentences it had. It should now draw more from the single item and
  // from a fourth sentence in stage 3.
  const targetSubtypes: Record<1 | 2 | 3, string[]> = {
    1: ["mc-select-translation", "ls-mc-select-translation", "fg-letter-order", "sp-pronunciation-compare"],
    2: ["mc-select-context-response", "mc-select-missing-word", "mt-match-translation"],
    3: ["ls-mc-select-translation", "sp-pronunciation-compare", "mc-select-translation"]
  };
  const candidates: LessonQuestionCandidate<string>[] = [];
  for (const stage of [1, 2, 3] as const) {
    for (const questionSubtype of targetSubtypes[stage]) {
      candidates.push(
        makeCandidate({
          stage,
          sourceGroup: questionSubtype === "mt-match-translation" ? "lesson" : "target",
          sourceKey: questionSubtype === "mt-match-translation" ? "lesson:all" : "word:ni",
          questionType: questionSubtype.startsWith("ls-") ? "listening" : "multiple-choice",
          questionSubtype
        })
      );
    }
    // Each sentence offers a different exercise in each stage, as generation does: the same
    // source and subtype cannot be selected twice across a lesson.
    const sentenceSubtypes = ["fg-word-order", "ls-fg-gap-fill", "mc-select-translation", "mc-select-missing-word"];
    for (const index of [1, 2, 3, 4]) {
      candidates.push(
        makeCandidate({
          stage,
          sourceGroup: "sentence",
          sourceKey: `sentence:${index}`,
          questionType: stage === 3 ? "listening" : "fill-in-the-gap",
          questionSubtype: sentenceSubtypes[(index + stage) % sentenceSubtypes.length]!
        })
      );
    }
  }

  const plan = selectLessonQuestionPlan(candidates, { lessonKey: "one-item-lesson", lessonMode: "core" });
  const perStage = [1, 2, 3].map(
    (stage) => plan.selectedCandidates.filter((candidate) => candidate.stage === stage).length
  );
  const fromTheItem = plan.selectedCandidates.filter((candidate) => candidate.sourceKey === "word:ni").length;

  assert.ok(perStage[0] >= 3, `stage 1 should hold at least 3 questions, got ${perStage[0]}`);
  assert.ok(perStage[2] >= 4, `stage 3 should hold at least 4 questions, got ${perStage[2]}`);
  assert.ok(fromTheItem >= 5, `the single new item should carry at least 5 questions, got ${fromTheItem}`);
  assert.ok(
    plan.selectedCandidates.length >= 12,
    `a one-item lesson should reach at least 12 questions, got ${plan.selectedCandidates.length}`
  );
});
