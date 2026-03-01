export const LANGUAGE_VALUES = ["yoruba", "igbo", "hausa"] as const;
export const LEVEL_VALUES = ["beginner", "intermediate", "advanced"] as const;
export const STATUS_VALUES = ["draft", "finished", "published"] as const;

export type Language = (typeof LANGUAGE_VALUES)[number];
export type Level = (typeof LEVEL_VALUES)[number];
export type Status = (typeof STATUS_VALUES)[number];

export type LessonBlock = 
  | { type: "text"; content: string }
  | { type: "phrase"; refId: string }
  | { type: "proverb"; refId: string }
  | { type: "question"; refId: string };

export type LessonEntity = {
  id: string;
  _id?: string;
  title: string;
  language: Language;
  level: Level;
  orderIndex: number;
  description: string;
  topics: string[];
  proverbs: Array<{ text: string; translation: string; contextNote: string }>;
  blocks: LessonBlock[];
  status: Status;
  createdBy: string;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
