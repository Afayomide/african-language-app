import test from "node:test";
import assert from "node:assert/strict";

import { buildDisplayComponents } from "../application/use-cases/learner/lesson/LearnerLessonUseCases.js";
import type { ResolvedContentEntity } from "../application/services/ContentLookupService.js";
import type { ContentComponentRef } from "../domain/entities/Content.js";

const base = {
  language: "yoruba",
  textNormalized: "",
  pronunciation: "",
  explanation: "",
  examples: [],
  difficulty: 1,
  aiMeta: {},
  audio: {},
  status: "draft"
} as const;

function word(id: string, text: string, translations: string[]): ResolvedContentEntity {
  return { ...base, id, kind: "word", text, translations, lemma: "", partOfSpeech: "" } as unknown as ResolvedContentEntity;
}

function expression(id: string, text: string, components: ContentComponentRef[], keepWhole = false): ResolvedContentEntity {
  return { ...base, id, kind: "expression", text, translations: [], register: "neutral", keepWhole, components } as unknown as ResolvedContentEntity;
}

function sentence(components: ContentComponentRef[]): ResolvedContentEntity {
  return { ...base, id: "s1", kind: "sentence", text: "", translations: [], literalTranslation: "", usageNotes: "", components } as unknown as ResolvedContentEntity;
}

// `ni` leads its dictionary entry with "am" -- the default these tests prove is no longer shown.
const map = new Map<string, ResolvedContentEntity>([
  ["word:nibo", word("nibo", "Níbo", ["where"])],
  ["word:ni", word("ni", "ni", ["am", "is", "are"])],
  ["word:omi", word("omi", "omi", ["water"])],
  ["word:bee", word("bee", "Bẹ́ẹ̀", ["so"])],
  [
    "expression:nibo-ni",
    expression("nibo-ni", "Níbo ni", [
      { type: "word", refId: "nibo", orderIndex: 0, textSnapshot: "Níbo", gloss: "where" },
      { type: "word", refId: "ni", orderIndex: 1, textSnapshot: "ni", gloss: "is" }
    ])
  ],
  [
    "expression:bee-ni",
    expression(
      "bee-ni",
      "Bẹ́ẹ̀ ni",
      [
        { type: "word", refId: "bee", orderIndex: 0, textSnapshot: "Bẹ́ẹ̀" },
        { type: "word", refId: "ni", orderIndex: 1, textSnapshot: "ni" }
      ],
      true
    )
  ]
]);

test("a word inside an expression shows the meaning stored for this sentence", () => {
  const components = buildDisplayComponents(
    sentence([
      { type: "expression", refId: "nibo-ni", orderIndex: 0, textSnapshot: "Níbo ni", partGlosses: ["where", "are"] }
    ]),
    map
  );
  const parts = components?.[0].components;
  assert.deepEqual(parts?.map((p) => [p.text, p.selectedTranslation]), [["Níbo", "where"], ["ni", "are"]]);
});

test("without a sentence meaning it falls back to the expression's own, never the dictionary's 'am'", () => {
  const components = buildDisplayComponents(
    sentence([{ type: "expression", refId: "nibo-ni", orderIndex: 0, textSnapshot: "Níbo ni" }]),
    map
  );
  assert.equal(components?.[0].components?.[1].selectedTranslation, "is");
});

test("an empty slot in the sentence meanings falls back to the expression's own", () => {
  const components = buildDisplayComponents(
    sentence([{ type: "expression", refId: "nibo-ni", orderIndex: 0, textSnapshot: "Níbo ni", partGlosses: ["", "are"] }]),
    map
  );
  assert.deepEqual(components?.[0].components?.map((p) => p.selectedTranslation), ["where", "are"]);
});

test("a keep-whole expression is sent with no breakdown, inside a sentence and on its own", () => {
  const inSentence = buildDisplayComponents(
    sentence([
      { type: "expression", refId: "bee-ni", orderIndex: 0, textSnapshot: "Bẹ́ẹ̀ ni" },
      { type: "word", refId: "omi", orderIndex: 1, textSnapshot: "omi" }
    ]),
    map
  );
  assert.equal(inSentence?.[0].text, "Bẹ́ẹ̀ ni");
  assert.equal(inSentence?.[0].components, undefined);
  assert.equal(buildDisplayComponents(map.get("expression:bee-ni")!, map), undefined);
});

test("an expression shown on its own lists its words with their expression meanings", () => {
  const parts = buildDisplayComponents(map.get("expression:nibo-ni")!, map);
  assert.deepEqual(parts?.map((p) => [p.text, p.selectedTranslation]), [["Níbo", "where"], ["ni", "is"]]);
});
