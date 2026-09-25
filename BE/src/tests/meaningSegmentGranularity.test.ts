import test from "node:test";
import assert from "node:assert/strict";

import { MAX_COMPONENTS_PER_MEANING_SEGMENT, validateGeneratedSentences } from "../services/llm/outputQuality.js";
import type { GenerateSentencesInput, LlmGeneratedSentence } from "../services/llm/types.js";

const input: GenerateSentencesInput = { language: "yoruba", level: "beginner" };

const word = (text: string, translation: string, role: "core" | "support" = "support") => ({
  type: "word" as const,
  text,
  translations: [translation],
  fixed: false,
  role
});

// The sentence a local model glossed as three chains: "Yes" / "it is a lot of money" /
// "I do not want to buy". Nine words, three hovers, none of them about a word.
function refusal(segments: LlmGeneratedSentence["meaningSegments"]): LlmGeneratedSentence {
  return {
    text: "Bẹ́ẹ̀ ni, owó ńlá ni, mi ò fẹ́ rà.",
    translations: ["Yes, it is a lot of money, I do not want to buy."],
    components: [
      word("Bẹ́ẹ̀", "so"),
      word("ni", "it is"),
      word("owó", "money"),
      word("ńlá", "large"),
      word("ni", "is"),
      word("mi", "I"),
      word("ò", "not", "core"),
      word("fẹ́", "want"),
      word("rà", "buy")
    ],
    meaningSegments: segments
  };
}

test("a meaning segment that glosses a whole clause is rejected", () => {
  const result = validateGeneratedSentences(
    [
      refusal([
        { text: "Yes", componentIndexes: [0, 1] },
        { text: "it is a lot of money", componentIndexes: [2, 3, 4] },
        { text: "I do not want to buy", componentIndexes: [5, 6, 7, 8] }
      ])
    ],
    input
  );
  assert.equal(result.accepted.length, 0);
  const reasons = result.rejected[0]!.reasons;
  assert.ok(reasons.some((r) => r.includes("groups 3 components")), reasons.join("; "));
  assert.ok(reasons.some((r) => r.includes("groups 4 components")), reasons.join("; "));
});

test("word-by-word segments pass, including a two-word idiom glossed as one", () => {
  const result = validateGeneratedSentences(
    [
      refusal([
        { text: "Yes", componentIndexes: [0, 1] },
        { text: "it is", componentIndexes: [4] },
        { text: "a lot of", componentIndexes: [3] },
        { text: "money", componentIndexes: [2] },
        { text: "I", componentIndexes: [5] },
        { text: "do not", componentIndexes: [6] },
        { text: "want", componentIndexes: [7] },
        { text: "to buy", componentIndexes: [8] }
      ])
    ],
    input
  );
  assert.equal(result.rejected.length, 0, JSON.stringify(result.rejected));
  assert.equal(result.accepted.length, 1);
});

test("the ceiling is two components per segment", () => {
  assert.equal(MAX_COMPONENTS_PER_MEANING_SEGMENT, 2);
});
