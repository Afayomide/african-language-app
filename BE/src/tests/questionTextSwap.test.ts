import test from "node:test";
import assert from "node:assert/strict";

import { letters, swapInText, swapQuestionWord } from "../services/content/questionTextSwap.js";

const SPEC = { from: "Màmá", to: "Ìyá", fromId: "69d91264ce1c85da93a6f9f0", toId: "69e066bc94de573cc400d0d9" };

test("a letter-order question is rebuilt from the new word, not letter-substituted", () => {
  // The live question in the first lesson of the course. Màmá is four letters and Ìyá is three,
  // so substituting inside the array would leave a stray letter and an order that overruns.
  const result = swapQuestionWord(
    {
      subtype: "fg-letter-order",
      prompt_template: "Arrange the letters to spell the phrase for: {meaning}",
      options: ["M", "à", "m", "á"],
      review_data: { words: ["M", "à", "m", "á"], meaning: "Mother", sentence: "Màmá", correctOrder: [0, 1, 2, 3] }
    },
    SPEC
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.fields.options, ["Ì", "y", "á"]);
  assert.equal((result.fields.review_data as any).sentence, "Ìyá");
  assert.deepEqual((result.fields.review_data as any).words, ["Ì", "y", "á"]);
  assert.deepEqual((result.fields.review_data as any).correctOrder, [0, 1, 2]);
  // The English meaning is not ours to rewrite: Ìyá means Mom as readily as Mother.
  assert.equal((result.fields.review_data as any).meaning, "Mother");
});

test("letters keeps an accent with its vowel", () => {
  assert.deepEqual(letters("Ìyá"), ["Ì", "y", "á"]);
  assert.equal(letters("Ẹ̀gbọ́n").join(""), "Ẹ̀gbọ́n");
});

test("the target language is swapped and the English is left alone", () => {
  const result = swapQuestionWord(
    {
      subtype: "fg-word-order",
      prompt_template: "Build the English meaning of this sentence.",
      options: ["Good", "morning", "Mom,", "it", "is", "fine."],
      review_data: {
        words: ["Good", "morning", "Mom,", "it", "is", "fine."],
        meaning: "Good morning Mom, it is fine.",
        sentence: "Ẹ káàárọ̀ Màmá, dáadáa ni.",
        correctOrder: [0, 1, 2, 3, 4, 5]
      }
    },
    SPEC
  );

  assert.equal(result.changed, true);
  assert.equal((result.fields.review_data as any).sentence, "Ẹ káàárọ̀ Ìyá, dáadáa ni.");
  // "Mom" is English and stays, in the options and in the meaning.
  assert.equal(result.fields.options, undefined);
  assert.equal((result.fields.review_data as any).meaning, "Good morning Mom, it is fine.");
});

test("a distractor is swapped like any other occurrence", () => {
  const result = swapQuestionWord(
    {
      subtype: "mc-select-context-response",
      prompt_template: "You are greeting your father in the morning. Which word would you use?",
      options: ["Ẹ káàsán", "Màmá", "bàbá"],
      correct_index: 2
    },
    SPEC
  );

  assert.deepEqual(result.fields.options, ["Ẹ káàsán", "Ìyá", "bàbá"]);
});

test("a swap that would make two options identical is refused, not guessed", () => {
  // Ìyá already being an option means the swapped question has two right-looking answers.
  const result = swapQuestionWord(
    { subtype: "mc-select-missing-word", options: ["Ìyá", "Màmá", "bàbá"], correct_index: 0 },
    SPEC
  );

  assert.equal(result.refused, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.fields, {});
  assert.match(result.warnings[0]!, /duplicate/);
});

test("a matching pair moves its word id along with its text", () => {
  const result = swapQuestionWord(
    {
      subtype: "mt-match-image",
      options: [],
      interaction_data: {
        matchingPairs: [
          { pairId: "word-69d91265ce1c85da93a6f9fa-1", contentId: "69d91265ce1c85da93a6f9fa", contentText: "àbúrò", translation: "younger sibling" },
          { pairId: "word-69d91264ce1c85da93a6f9f0-3", contentId: "69d91264ce1c85da93a6f9f0", contentText: "Màmá", translation: "Mother" }
        ]
      }
    },
    SPEC
  );

  const pairs = (result.fields.interaction_data as any).matchingPairs;
  assert.equal(pairs[1].contentText, "Ìyá");
  assert.equal(pairs[1].contentId, "69e066bc94de573cc400d0d9");
  assert.equal(pairs[1].pairId, "word-69e066bc94de573cc400d0d9-3");
  // The pair that had nothing to do with the swap is untouched.
  assert.equal(pairs[0].contentId, "69d91265ce1c85da93a6f9fa");
  assert.equal(pairs[0].contentText, "àbúrò");
});

test("a lower-case mention in prose keeps its case", () => {
  assert.equal(
    swapInText("Like 'màmá', elders are referred to with the respectful plural pronoun.", SPEC),
    "Like 'ìyá', elders are referred to with the respectful plural pronoun."
  );
  assert.equal(swapInText("Màmá mi ni.", SPEC), "Ìyá mi ni.");
});

test("a question that never mentions the word is left completely alone", () => {
  const result = swapQuestionWord(
    {
      subtype: "fg-word-order",
      options: ["Bàbá", "ẹ", "káàárọ̀"],
      review_data: { sentence: "Bàbá, ẹ káàárọ̀.", words: ["Bàbá", "ẹ", "káàárọ̀"], meaning: "Dad, good morning." }
    },
    SPEC
  );

  assert.equal(result.changed, false);
  assert.equal(result.refused, false);
  assert.deepEqual(result.fields, {});
});
