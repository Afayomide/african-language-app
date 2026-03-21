import test from "node:test";
import assert from "node:assert/strict";

import {
  findContextResponseTypoOnlyDistractors,
  validateContextResponseQuestion
} from "../interfaces/http/validators/question.validators.js";

test("validateContextResponseQuestion accepts a valid contextual response question", () => {
  const error = validateContextResponseQuestion({
    sourceText: "Ẹ káàárọ̀",
    options: ["Ẹ káàárọ̀", "Ẹ káàsán", "Ẹ káalẹ́"],
    correctIndex: 0
  });

  assert.equal(error, null);
});

test("validateContextResponseQuestion rejects typo-only distractors", () => {
  const error = validateContextResponseQuestion({
    sourceText: "Ẹ káàárọ̀",
    options: ["Ẹ káàárọ̀", "E kaaaro", "Ẹ káàsán"],
    correctIndex: 0
  });

  assert.equal(error, "typo_only_distractors_not_allowed");
});

test("validateContextResponseQuestion rejects a correct option that does not match the source text", () => {
  const error = validateContextResponseQuestion({
    sourceText: "Ẹ káàárọ̀",
    options: ["Káàárọ̀", "Ẹ káàárọ̀", "Ẹ káàsán"],
    correctIndex: 0
  });

  assert.equal(error, "correct_option_must_match_source");
});

test("findContextResponseTypoOnlyDistractors finds spelling-only or diacritic-only variants", () => {
  const distractors = findContextResponseTypoOnlyDistractors("Ẹ káàárọ̀", [
    "Ẹ káàárọ̀",
    "E kaaaro",
    "Ẹ káàsán",
    "E káàárọ̀"
  ]);

  assert.deepEqual(distractors, ["E kaaaro", "E káàárọ̀"]);
});
