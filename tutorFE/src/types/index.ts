export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";
export type ContentType = "word" | "expression" | "sentence";
export type UnitKind = "core" | "review";
export type UnitReviewStyle = "none" | "star" | "gym";

export type LessonBlock = 
  | { type: "text"; content: string }
  | { type: "content"; contentType: "word" | "expression" | "sentence"; refId: string; translationIndex?: number }
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
  chapterId?: string | null;
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

export interface Chapter {
  _id: string;
  title: string;
  description: string;
  language: Language;
  level: Level;
  orderIndex: number;
  status: Status;
  createdBy: string;
  publishedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  _id: string;
  chapterId?: string | null;
  title: string;
  description: string;
  language: Language;
  level: Level;
  kind: UnitKind;
  reviewStyle: UnitReviewStyle;
  reviewSourceUnitIds: string[];
  orderIndex: number;
  status: Status;
  createdBy: string;
  lastAiRun?: {
    mode: "generate" | "refactor" | "regenerate";
    createdBy: string;
    createdAt: string;
    requestedLessons: number;
    createdLessons: number;
    updatedLessons?: number;
    clearedLessons?: number;
    skippedLessons: Array<{ reason: string; topic?: string; title?: string }>;
    lessonGenerationErrors: Array<{ topic?: string; error: string }>;
    contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
    lessons: Array<{
      lessonId: string;
      title: string;
      contentGenerated: number;
      sentencesGenerated: number;
      existingContentLinked: number;
      newContentSelected: number;
      reviewContentSelected: number;
      contentDroppedFromCandidates: number;
      proverbsGenerated: number;
      questionsGenerated: number;
      blocksGenerated: number;
    }>;
  } | null;
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

export interface ExpressionImageLink {
  _id: string;
  expressionId?: string;
  translationIndex?: number | null;
  imageAssetId: string;
  isPrimary: boolean;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  asset: ImageAsset | null;
}

export type PhraseImageLink = ExpressionImageLink;

export interface Expression {
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
  images?: ExpressionImageLink[];
  status: Status;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Word {
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
  lemma: string;
  partOfSpeech: string;
  status: Status;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SentenceComponentRef {
  type: "word" | "expression";
  refId: string;
  orderIndex: number;
  textSnapshot?: string;
}

export interface Sentence {
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
  literalTranslation: string;
  usageNotes: string;
  components: SentenceComponentRef[];
  status: Status;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceAudioSubmission {
  id: string;
  contentType: ContentType;
  contentId: string;
  voiceArtistUserId: string;
  language: Language;
  audio: Audio;
  status: "pending" | "accepted" | "rejected";
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
  content?: {
    id?: string;
    _id?: string;
    kind?: ContentType;
    text: string;
    translations: string[];
    selectedTranslation?: string;
  } | null;
  voiceArtist?: {
    id?: string;
    email?: string;
  } | null;
}


export interface UnitDeletedEntries {
  lessons: Lesson[];
  expressions: Expression[];
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

export type QuestionType = "multiple-choice" | "fill-in-the-gap" | "listening" | "matching" | "speaking";

export type QuestionSubtype =
  | "mc-select-translation"
  | "mc-select-context-response"
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
  | "ls-tone-recognition"
  | "sp-pronunciation-compare";

export interface QuestionMatchingPair {
  pairId: string;
  contentType?: "word" | "expression" | "sentence";
  contentId?: string;
  contentText?: string;
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
  sourceType?: "word" | "expression" | "sentence";
  sourceId?: string;
  relatedSourceRefs?: Array<{ type: "word" | "expression" | "sentence"; id: string }>;
  translationIndex: number;
  source?: string | {
    _id?: string;
    text: string;
    translations: string[];
    selectedTranslation?: string;
    selectedTranslationIndex?: number;
    status: Status;
    audio?: {
      audioUrl: string;
      audioProvider: string;
      voice: string;
      locale: string;
    };
  } | null;
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
    meaningSegments?: Array<{
      text: string;
      sourceWordIndexes: number[];
      sourceComponentIndexes?: number[];
    }>;
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
    uniqueContentCount: number;
    questionCount: number;
    listeningQuestionCount: number;
    scenarioQuestionCount: number;
  };
  findings: LessonAuditFinding[];
}
