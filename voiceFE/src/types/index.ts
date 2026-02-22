export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "published";

export interface Lesson {
  _id: string;
  title: string;
  language: Language;
  level: Level;
  orderIndex: number;
  description: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface Audio {
  provider: string;
  model: string;
  voice: string;
  locale: string;
  format: string;
  url: string;
  s3Key: string;
}

export interface Phrase {
  _id: string;
  lessonIds: string[];
  language: Language;
  text: string;
  translation: string;
  pronunciation: string;
  explanation: string;
  difficulty: number;
  audio: Audio;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  role: "voice_artist";
}

export interface VoiceArtistProfile {
  id: string;
  language: Language;
  displayName: string;
  isActive?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
  voiceArtist: VoiceArtistProfile;
}
