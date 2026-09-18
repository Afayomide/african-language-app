import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MIN_SENTENCE_WORDS, getMinSentenceWords } from "../config/lessonGeneration.js";

function withEnv(value: string | undefined, run: () => void) {
  const previous = process.env.MIN_SENTENCE_WORDS;
  if (value === undefined) delete process.env.MIN_SENTENCE_WORDS;
  else process.env.MIN_SENTENCE_WORDS = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.MIN_SENTENCE_WORDS;
    else process.env.MIN_SENTENCE_WORDS = previous;
  }
}

test("getMinSentenceWords defaults to the previous hard-coded behaviour", () => {
  withEnv(undefined, () => {
    assert.equal(getMinSentenceWords(), DEFAULT_MIN_SENTENCE_WORDS);
    assert.equal(getMinSentenceWords(), 2);
  });
});

test("getMinSentenceWords allows single-word sentences when asked", () => {
  withEnv("1", () => assert.equal(getMinSentenceWords(), 1));
});

test("getMinSentenceWords accepts a stricter value", () => {
  withEnv("4", () => assert.equal(getMinSentenceWords(), 4));
});

test("getMinSentenceWords falls back rather than disabling the check", () => {
  // 0 or negative would let an empty token list through as a sentence; "empty text" is a
  // separate rejection and this rule must not be the thing that stops catching it.
  for (const value of ["0", "-1", "", "  ", "abc", "1.9", "1abc", "1.9e", "null"]) {
    withEnv(value, () =>
      assert.equal(getMinSentenceWords(), DEFAULT_MIN_SENTENCE_WORDS, `expected fallback for ${JSON.stringify(value)}`)
    );
  }
});

test("getMinSentenceWords is read per call, not captured at import", () => {
  withEnv("1", () => assert.equal(getMinSentenceWords(), 1));
  withEnv("3", () => assert.equal(getMinSentenceWords(), 3));
  withEnv(undefined, () => assert.equal(getMinSentenceWords(), DEFAULT_MIN_SENTENCE_WORDS));
});
