import type { Language } from "./Lesson.js";

export type VoiceArtistProfileEntity = {
  id: string;
  _id?: string;
  userId: string;
  language: Language;
  displayName: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};
