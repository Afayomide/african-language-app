export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";

export interface Lesson {
  _id: string;
  title: string;
  language: Language;
  level: Level;
  orderIndex: number;
  description: string;
  topics: string[];
  status: Status;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Example {
  original: string;
  translation: string;
}

export interface AIMeta {
  generatedByAI: boolean;
  model: string;
  reviewedByAdmin: boolean;
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
  examples: Example[];
  difficulty: number;
  aiMeta: AIMeta;
  audio: Audio;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = "vocabulary" | "practice" | "listening" | "review";

export interface ExerciseQuestion {
  _id: string;
  lessonId: string;
  phraseId: string | {
    _id: string;
    text: string;
    translation: string;
    status: Status;
  };
  type: QuestionType;
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: {
    sentence: string;
    words: string[];
    correctOrder: number[];
    meaning: string;
  };
  explanation: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  email: string;
  role: "admin" | "user";
}

export interface Tutor {
  id: string;
  userId: string;
  email: string;
  language: Language;
  displayName: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VoiceArtist {
  id: string;
  userId: string;
  email: string;
  language: Language;
  displayName: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VoiceAudioSubmission {
  id: string;
  phraseId: string;
  voiceArtistUserId: string;
  language: Language;
  audio: Audio;
  status: "pending" | "accepted" | "rejected";
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
  phrase?: {
    id?: string;
    _id?: string;
    text: string;
    translation: string;
  } | null;
  voiceArtist?: {
    id?: string;
    email?: string;
  } | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}
