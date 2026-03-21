import type { ContentBaseEntity } from "./Content.js";

export type WordEntity = ContentBaseEntity & {
  kind: "word";
  lemma: string;
  partOfSpeech: string;
};
