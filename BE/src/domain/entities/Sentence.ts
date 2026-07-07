import type { ContentBaseEntity, ContentComponentRef } from "./Content.js";

export type SentenceMeaningSegment = {
  text: string;
  sourceWordIndexes: number[];
  sourceComponentIndexes: number[];
};

export type SentenceEntity = ContentBaseEntity & {
  kind: "sentence";
  literalTranslation: string;
  usageNotes: string;
  components: ContentComponentRef[];
  meaningSegments?: SentenceMeaningSegment[];
};
