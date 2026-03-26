import type { Language, Level, Status } from "./Lesson.js";

export type ChapterEntity = {
  id: string;
  _id?: string;
  languageId?: string | null;
  title: string;
  description: string;
  language: Language;
  level: Level;
  orderIndex: number;
  status: Status;
  createdBy: string;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
