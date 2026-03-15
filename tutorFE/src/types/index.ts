export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";

export type LessonBlock = 
  | { type: "text"; content: string }
  | { type: "phrase"; refId: string; translationIndex?: number }
  | { type: "proverb"; refId: string }
  | { type: "question"; refId: string };

export type LessonStage = {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  blocks: LessonBlock[];
};

export interface Lesson {
  _id: string;
  title: string;
  unitId: string;
  language: Language;
  level: Level;
  orderIndex: number;
  description: string;
  topics: string[];
  proverbs: Array<{ text: string; translation: string; contextNote: string }>;
  stages: LessonStage[];
  status: Status;
  createdBy: string;
  publishedAt?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  _id: string;
  title: string;
  description: string;
  language: Language;
  level: Level;
  orderIndex: number;
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

export interface ImageAsset {
  _id: string;
  url: string;
  thumbnailUrl?: string;
  storageKey?: string;
  mimeType: string;
  width?: number;
  height?: number;
  description: string;
  altText: string;
  tags: string[];
  languageNeutralLabel?: string;
  status: "draft" | "approved";
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhraseImageLink {
  _id: string;
  phraseId: string;
  translationIndex?: number | null;
  imageAssetId: string;
  isPrimary: boolean;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  asset: ImageAsset | null;
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
    translations: string[];
    selectedTranslation?: string;
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
  translations: string[];
  pronunciation: string;
  explanation: string;
  examples: Example[];
  difficulty: number;
  aiMeta: AIMeta;
  audio: Audio;
  images?: PhraseImageLink[];
  status: Status;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnitDeletedEntries {
  lessons: Lesson[];
  phrases: Phrase[];
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

export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening" | "matching";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-missing-word"
  | "fg-word-order"
  | "fg-letter-order"
  | "fg-gap-fill"
  | "ls-mc-select-translation"
  | "ls-mc-select-missing-word"
  | "ls-fg-word-order"
  | "ls-fg-gap-fill"
  | "mt-match-image"
  | "mt-match-translation"
  | "ls-dictation"
  | "ls-tone-recognition";

export interface QuestionMatchingPair {
  pairId: string;
  phraseId: string;
  phraseText: string;
  translationIndex: number;
  translation: string;
  image?: {
    imageAssetId: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
}

export interface ExerciseQuestion {
  _id: string;
  lessonId: string;
  relatedPhraseIds?: string[];
  translationIndex: number;
  phraseId:
    | string
    | {
        _id: string;
        text: string;
        translations: string[];
        selectedTranslation?: string;
        selectedTranslationIndex?: number;
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
  interactionData?: {
    matchingPairs?: QuestionMatchingPair[];
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

export interface LessonAuditFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface LessonAuditResult {
  ok: boolean;
  errors: number;
  warnings: number;
  metrics: {
    stageCount: number;
    blockCount: number;
    uniquePhraseCount: number;
    questionCount: number;
    listeningQuestionCount: number;
  };
  findings: LessonAuditFinding[];
}
