import type { ContentBaseEntity, ContentComponentRef } from "./Content.js";

export type SentenceEntity = ContentBaseEntity & {
  kind: "sentence";
  literalTranslation: string;
  usageNotes: string;
  components: ContentComponentRef[];
};
