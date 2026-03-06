import type { Language, Level, Status } from "./Lesson.js";

export type UnitEntity = {
  id: string;
  _id?: string;
  title: string;
  description: string;
  language: Language;
  level: Level;
  orderIndex: number;
  status: Status;
  createdBy: string;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
