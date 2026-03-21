export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "published";
export type ContentType = "word" | "expression" | "sentence";

export interface Chapter {
  _id: string;
  title: string;
  description: string;
  language: Language;
  level: Level;
  orderIndex: number;
  status: "draft" | "finished" | "published";
}

export interface Unit {
  _id: string;
  chapterId?: string | null;
  title: string;
  description: string;
  language: Language;
  level: Level;
  kind: "core" | "review";
  reviewStyle: "none" | "star" | "gym";
  reviewSourceUnitIds: string[];
  orderIndex: number;
  status: "draft" | "finished" | "published";
}

export interface Lesson {
  _id: string;
  unitId: string;
  title: string;
  language: Language;
  level: Level;
  orderIndex: number;
  description: string;
  status: "draft" | "finished" | "published";
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
  referenceType?: "none" | "ai_baseline" | "human_reference" | "learner_recording";
  workflowStatus?: "missing" | "baseline" | "requested" | "submitted" | "accepted" | "rejected";
  reviewStatus?: "unreviewed" | "pending" | "accepted" | "rejected";
  analysis?: {
    durationMs?: number;
    sampleRate?: number;
    channelCount?: number;
    peak?: number;
    rms?: number;
    waveformPeaks?: number[];
    pitchContour?: Array<{ timeMs: number; hz: number; midi?: number; confidence?: number }>;
    spectrogram?: Array<{ timeMs: number; bins: Array<{ hz: number; amplitude: number }> }>;
  };
}

export interface Expression {
  _id: string;
  lessonIds: string[];
  language: Language;
  text: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  difficulty: number;
  audio: Audio;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceContent {
  _id: string;
  id?: string;
  kind?: ContentType;
  language: Language;
  text: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  difficulty: number;
  audio: Audio;
  status: Status | "finished";
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

export interface VoiceQueueItem {
  contentType: ContentType;
  content: VoiceContent;
  lessons: Lesson[];
  units: Unit[];
  chapters: Chapter[];
  latestSubmission: null | {
    id: string;
    status: "pending" | "accepted" | "rejected";
    rejectionReason: string;
    createdAt: string;
  };
}

export interface VoiceSubmissionItem {
  id: string;
  contentType: ContentType;
  contentId: string;
  status: "pending" | "accepted" | "rejected";
  rejectionReason: string;
  createdAt: string;
  content: VoiceContent | null;
  lessons: Lesson[];
  units: Unit[];
  chapters: Chapter[];
  audio: Audio;
}
