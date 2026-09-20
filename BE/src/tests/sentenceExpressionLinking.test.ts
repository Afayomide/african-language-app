import test from "node:test";
import assert from "node:assert/strict";

import {
  applyExpressionMerges,
  planExpressionMerges,
  remapIndex,
  type LinkableComponent
} from "../application/services/sentenceExpressionLinking.js";

const normalize = (value: string) => value.trim().toLocaleLowerCase("yo");
const expressions = new Map([
  ["ẹ káàárọ̀", { id: "e-kaaro", text: "Ẹ káàárọ̀" }],
  ["ẹ fún mi ni", { id: "e-fun-mi-ni", text: "Ẹ fún mi ni" }],
  ["fún mi", { id: "fun-mi", text: "fún mi" }]
]);
const find = (text: string) => expressions.get(text);
const words = (...texts: string[]): LinkableComponent[] => texts.map((text) => ({ type: "word", text }));

test("a run of words that spells an expression is linked to it", () => {
  const components = words("Ẹ", "káàárọ̀", "Màmá");
  const plans = planExpressionMerges(components, find, normalize);
  assert.deepEqual(
    plans.map((p) => [p.start, p.length, p.expression.id]),
    [[0, 2, "e-kaaro"]]
  );
  assert.deepEqual(
    applyExpressionMerges(components, plans).map((c) => [c.type, c.text]),
    [["expression", "Ẹ káàárọ̀"], ["word", "Màmá"]]
  );
});

test("the longest expression wins", () => {
  const plans = planExpressionMerges(words("Ẹ", "fún", "mi", "ni", "omi"), find, normalize);
  assert.deepEqual(plans.map((p) => p.expression.id), ["e-fun-mi-ni"]);
});

test("words that spell nothing are left alone", () => {
  const components = words("Màmá", "wà", "dáadáa");
  assert.deepEqual(planExpressionMerges(components, find, normalize), []);
  assert.deepEqual(applyExpressionMerges(components, []).length, 3);
});

test("an existing expression component is never merged across", () => {
  const components: LinkableComponent[] = [
    { type: "expression", text: "Ẹ káàárọ̀" },
    { type: "word", text: "fún" },
    { type: "word", text: "mi" }
  ];
  const plans = planExpressionMerges(components, find, normalize);
  assert.deepEqual(plans.map((p) => [p.start, p.expression.id]), [[1, "fun-mi"]]);
});

test("the merged words' meanings are kept as part glosses", () => {
  const components: LinkableComponent[] = [
    { type: "word", text: "Ẹ", gloss: "you (respectful)" },
    { type: "word", text: "káàárọ̀", gloss: "good morning" }
  ];
  const plans = planExpressionMerges(components, find, normalize);
  assert.deepEqual(plans[0].partGlosses, ["you (respectful)", "good morning"]);
  const [merged] = applyExpressionMerges(components, plans) as any[];
  assert.deepEqual(merged.partGlosses, ["you (respectful)", "good morning"]);
});

test("meaning-map positions follow the merge", () => {
  // [Ẹ][káàárọ̀][Màmá] -> [Ẹ káàárọ̀][Màmá]
  const plans = planExpressionMerges(words("Ẹ", "káàárọ̀", "Màmá"), find, normalize);
  assert.equal(remapIndex(0, plans), 0);
  assert.equal(remapIndex(1, plans), 0);
  assert.equal(remapIndex(2, plans), 1);
});

test("positions after two merges shift by both", () => {
  // [Ẹ][káàárọ̀][fún][mi][omi] -> [Ẹ káàárọ̀][fún mi][omi]
  const plans = planExpressionMerges(words("Ẹ", "káàárọ̀", "fún", "mi", "omi"), find, normalize);
  assert.equal(plans.length, 2);
  assert.equal(remapIndex(4, plans), 2);
});
