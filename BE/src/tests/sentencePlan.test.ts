import test from "node:test";
import assert from "node:assert/strict";

import { clampSentencesPerLesson, resolveSentencePlan, LESSON_GENERATION_LIMITS } from "../config/lessonGeneration.js";

test("a requested zero survives the controller clamp", () => {
  // clampNewTargetsPerLesson would raise 0 to 1, which is how "no sentences" was being
  // turned back into "one sentence" before the request ever reached the generator.
  assert.equal(clampSentencesPerLesson(0), 0);
  assert.equal(clampSentencesPerLesson(2), 2);
  assert.equal(clampSentencesPerLesson(99), LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON);
  assert.equal(clampSentencesPerLesson(Number.NaN), LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON);
});

test("asking for no sentences gives a lesson with none, and no floor to fail against", () => {
  const plan = resolveSentencePlan({ sentencesPerLesson: 0, isReviewLesson: false });
  assert.equal(plan.sentenceFree, true);
  assert.equal(plan.targetNewSentences, 0);
  // Zero floor and zero target: nothing is borrowed from the database to make up a quota.
  assert.equal(plan.floor, 0);
  assert.equal(plan.minSources, 0);
});

test("a review lesson is always sentence-based, even when asked for none", () => {
  const plan = resolveSentencePlan({ sentencesPerLesson: 0, isReviewLesson: true });
  assert.equal(plan.sentenceFree, false);
  assert.equal(plan.targetNewSentences, LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON);
  assert.equal(plan.floor, 2);
});

test("a normal request is unchanged", () => {
  const plan = resolveSentencePlan({ sentencesPerLesson: 2, isReviewLesson: false });
  assert.deepEqual(
    { free: plan.sentenceFree, targets: plan.targetNewSentences, min: plan.minSources, floor: plan.floor },
    { free: false, targets: 2, min: 3, floor: 2 }
  );
});

test("a request above the cap is clamped, not treated as sentence-free", () => {
  const plan = resolveSentencePlan({ sentencesPerLesson: 99, isReviewLesson: false });
  assert.equal(plan.sentenceFree, false);
  assert.equal(plan.targetNewSentences, LESSON_GENERATION_LIMITS.MAX_NEW_TARGETS_PER_LESSON);
});

test("a missing or unusable value keeps the old default rather than emptying the lesson", () => {
  for (const value of [Number.NaN, Infinity]) {
    const plan = resolveSentencePlan({ sentencesPerLesson: value, isReviewLesson: false });
    assert.equal(plan.sentenceFree, false, `${value} must not mean "no sentences"`);
    assert.ok(plan.targetNewSentences >= LESSON_GENERATION_LIMITS.MIN_NEW_TARGETS_PER_LESSON);
  }
});

test("a negative value is treated as none rather than rejected", () => {
  assert.equal(resolveSentencePlan({ sentencesPerLesson: -1, isReviewLesson: false }).sentenceFree, true);
});
