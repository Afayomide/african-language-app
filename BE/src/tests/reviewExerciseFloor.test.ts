import test from "node:test";
import assert from "node:assert/strict";

import {
  computeReviewExerciseFloor,
  computeReviewSelectionCeiling,
  MIN_REVIEW_EXERCISES_PER_LESSON,
  MIN_VIABLE_REVIEW_EXERCISES,
  type LessonQuestionCandidate
} from "../application/services/lessonQuestionSelection.js";

/** Review-mode drafts as the sentence builder emits them, for one source sentence. */
function sentenceCandidates(sourceKey: string): LessonQuestionCandidate<null>[] {
  return [
    { stage: 1, sourceGroup: "sentence", sourceKey, questionType: "fill-gap", questionSubtype: "fg-word-order", payload: null },
    { stage: 1, sourceGroup: "sentence", sourceKey, questionType: "multiple-choice", questionSubtype: "mc-select-missing-word", payload: null },
    { stage: 2, sourceGroup: "sentence", sourceKey, questionType: "fill-gap", questionSubtype: "ls-fg-gap-fill", payload: null },
    { stage: 2, sourceGroup: "sentence", sourceKey, questionType: "fill-gap", questionSubtype: "fg-word-order", payload: null },
    { stage: 3, sourceGroup: "sentence", sourceKey, questionType: "multiple-choice", questionSubtype: "ls-mc-select-missing-word", payload: null },
    { stage: 3, sourceGroup: "sentence", sourceKey, questionType: "speaking", questionSubtype: "sp-pronunciation-compare", payload: null }
  ];
}

test("the ceiling respects the per-source limit of 2 for review lessons", () => {
  // One sentence offers six drafts, but a review lesson may take only two questions from any
  // single source. This is the limit that made a flat requirement of 8 unreachable.
  assert.equal(computeReviewSelectionCeiling(sentenceCandidates("sentence:a")), 2);
});

test("the ceiling grows with sources and then hits stage capacity", () => {
  const ceilingFor = (sources: number) =>
    computeReviewSelectionCeiling(
      Array.from({ length: sources }, (_, index) => sentenceCandidates(`sentence:${index}`)).flat()
    );

  assert.equal(ceilingFor(2), 4);
  assert.equal(ceilingFor(3), 6);
  assert.equal(ceilingFor(4), 8);
  // Stage capacity is 2 + 3 + 5 = 10, so more sources cannot lift it past that.
  assert.ok(ceilingFor(8) <= 10, "ceiling must not exceed total stage capacity");
});

test("the target never asks for more than the selector could choose", () => {
  for (let sources = 1; sources <= 8; sources += 1) {
    const candidates = Array.from({ length: sources }, (_, index) => sentenceCandidates(`sentence:${index}`)).flat();
    const ceiling = computeReviewSelectionCeiling(candidates);
    const target = computeReviewExerciseFloor(ceiling);
    assert.ok(target <= ceiling, `target ${target} exceeds ceiling ${ceiling} at ${sources} source(s)`);
    assert.ok(target <= MIN_REVIEW_EXERCISES_PER_LESSON, `target ${target} exceeds the fixed maximum`);
  }
});

test("a rich lesson is still held to the full target", () => {
  // The regression guard: relaxing this for thin lessons must not relax it for healthy ones.
  assert.equal(computeReviewExerciseFloor(10), MIN_REVIEW_EXERCISES_PER_LESSON);
  assert.equal(computeReviewExerciseFloor(8), MIN_REVIEW_EXERCISES_PER_LESSON);
});

test("the failure line sits below the target, so a thin review warns rather than fails", () => {
  // The property that matters: there must be room between "worth a warning" and "worth
  // destroying the unit". Requiring 8 while the ceiling was 8 left no room at all.
  assert.ok(
    MIN_VIABLE_REVIEW_EXERCISES < MIN_REVIEW_EXERCISES_PER_LESSON,
    "the hard failure must be strictly below the target"
  );
  assert.ok(MIN_VIABLE_REVIEW_EXERCISES >= 3, "a review lesson has three stages and should fill them");
});

test("computeReviewExerciseFloor handles a missing or nonsense ceiling", () => {
  assert.equal(computeReviewExerciseFloor(0), 0);
  assert.equal(computeReviewExerciseFloor(-3), 0);
  assert.equal(computeReviewExerciseFloor(Number.NaN), 0);
  assert.equal(computeReviewExerciseFloor(6.7), 6);
});

test("the ceiling is 0 when there is nothing to select", () => {
  assert.equal(computeReviewSelectionCeiling([]), 0);
});
