export type PhraseExample = {
  original: string;
  translation: string;
};

export type PhraseAudio = {
  provider: string;
  model: string;
  voice: string;
  locale: string;
  format: string;
  url: string;
  s3Key: string;
};

export type PhraseAiMeta = {
  generatedByAI: boolean;
  model: string;
  reviewedByAdmin: boolean;
};

export type PhraseEntity = {
  id: string;
  _id?: string;
  lessonIds: string[];
  language: "yoruba" | "igbo" | "hausa";
  text: string;
  translation: string;
  pronunciation: string;
  explanation: string;
  examples: PhraseExample[];
  difficulty: number;
  aiMeta: PhraseAiMeta;
  audio: PhraseAudio;
  status: "draft" | "finished" | "published";
  createdAt: Date;
  updatedAt: Date;
};
