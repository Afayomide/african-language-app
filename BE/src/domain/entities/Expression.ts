import type { ContentBaseEntity, ContentComponentRef } from "./Content.js";

export type ExpressionEntity = ContentBaseEntity & {
  kind: "expression";
  register: "formal" | "neutral" | "casual";
  components: ContentComponentRef[];
};
