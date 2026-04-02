import type { ContentBaseEntity } from "./Content.js";

export type WordEntity = ContentBaseEntity & {
  kind: "word";
  lemma: string;
  partOfSpeech: string;
  image?: {
    imageAssetId?: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
};
