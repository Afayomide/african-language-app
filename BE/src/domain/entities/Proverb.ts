import type { Language, Status } from "./Lesson.js";

export type ProverbAiMeta = {
  generatedByAI: boolean;
  model: string;
  reviewedByAdmin: boolean;
};

export type ProverbEntity = {
  id: string;
  _id?: string;
  lessonIds: string[];
  language: Language;
  text: string;
  translation: string;
  contextNote: string;
  aiMeta: ProverbAiMeta;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
};

