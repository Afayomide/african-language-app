export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";

export type LessonBlock = 
  | { type: "text"; content: string }
  | { type: "phrase"; refId: string }
  | { type: "proverb"; refId: string }
  | { type: "question"; refId: string };

export interface Lesson {
  _id: string;
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

export interface Proverb {
  _id: string;
  lessonIds: string[];
  language: Language;
  text: string;
  translation: string;
  contextNote: string;
  aiMeta: AIMeta;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-missing-word"
  | "fg-word-order"
  | "fg-gap-fill"
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  | "ls-dictation"
  | "ls-tone-recognition";

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
  subtype: QuestionSubtype;
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
  id: string;
  email: string;
  role: "tutor";
}

export interface TutorProfile {
  id: string;
  language: Language;
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  tutor: TutorProfile;
}
