import test from "node:test";
import assert from "node:assert/strict";

import { isSentenceLikeExpressionText } from "../services/content/expressionShape.js";

test("a greeting plus the person addressed is a sentence, not a set phrase", () => {
  // Stored as an expression, `Ẹ káàárọ̀, Màmá` competed both with the real sentence and with
  // the greeting it contains, and was introduced as if it were one vocabulary item.
  assert.equal(isSentenceLikeExpressionText("Ẹ káàárọ̀, Màmá"), true);
  assert.equal(isSentenceLikeExpressionText("Ẹ káàárọ̀, bàbá"), true);
});

test("a set phrase without a comma is still a set phrase", () => {
  for (const text of ["Ẹ káàárọ̀", "Níbo ni", "Bẹ́ẹ̀ ni", "Ẹ fún mi ni"]) {
    assert.equal(isSentenceLikeExpressionText(text), false, text);
  }
});

test("a question-shaped phrase is allowed, a full stop is not", () => {
  assert.equal(isSentenceLikeExpressionText("Èló ni?"), false);
  assert.equal(isSentenceLikeExpressionText("Omi ni."), true);
});

test("anything longer than a set phrase is a sentence", () => {
  assert.equal(isSentenceLikeExpressionText("Ẹ fún mi ni omi kan"), true);
});
