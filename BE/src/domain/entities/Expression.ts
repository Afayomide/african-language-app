import type { ContentBaseEntity, ContentComponentRef } from "./Content.js";

export type ExpressionEntity = ContentBaseEntity & {
  kind: "expression";
  register: "formal" | "neutral" | "casual";
  /** Show learners this expression as one unit, never broken into its words (an idiom). */
  keepWhole?: boolean;
  components: ContentComponentRef[];
};
