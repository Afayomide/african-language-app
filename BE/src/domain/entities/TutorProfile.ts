import type { Language } from "./Lesson.js";

export type TutorProfileEntity = {
  id: string;
  _id?: string;
  userId: string;
  language?: Language | null;
  displayName: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};
