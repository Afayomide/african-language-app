import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutoReviewUnitDescription,
  buildAutoReviewUnitTitle,
  getTrailingCoreUnitsSinceLastReview
} from "../application/services/reviewUnitScheduling.js";

test("getTrailingCoreUnitsSinceLastReview returns only core units after the most recent review unit", () => {
  const trailing = getTrailingCoreUnitsSinceLastReview([
    { id: "u1", title: "Greetings", kind: "core" },
    { id: "u2", title: "Family", kind: "core" },
    { id: "u3", title: "Review: Greetings + Family", kind: "review" },
    { id: "u4", title: "Market", kind: "core" }
  ]);

  assert.deepEqual(trailing.map((unit) => unit.id), ["u4"]);
});

test("buildAutoReviewUnitTitle makes duplicate review titles unique", () => {
  const title = buildAutoReviewUnitTitle(
    [
      { id: "u1", title: "Greetings", kind: "core" },
      { id: "u2", title: "Family", kind: "core" }
    ],
    new Set(["review: greetings + family"])
  );

  assert.equal(title, "Review: Greetings + Family (2)");
});

test("buildAutoReviewUnitDescription describes sentence-focused review behavior", () => {
  const description = buildAutoReviewUnitDescription([
    { id: "u1", title: "Greetings", kind: "core" },
    { id: "u2", title: "Family", kind: "core" }
  ]);

  assert.match(description, /Sentence-focused review unit/i);
  assert.match(description, /without introducing new targets/i);
});
