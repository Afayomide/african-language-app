export type Language = "yoruba" | "igbo" | "hausa";
export type Level = "beginner" | "intermediate" | "advanced";
export type Status = "draft" | "finished" | "published";
export type ContentType = "word" | "expression" | "sentence";
export type UnitKind = "core" | "review";
export type UnitReviewStyle = "none" | "star" | "gym";
export type CurriculumBuildJobStatus = "queued" | "running" | "planned" | "completed" | "failed" | "cancelled";
export type CurriculumBuildStepKey = "architect" | "generator" | "critic" | "refiner";
export type CurriculumBuildStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

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

export interface CurriculumBuildJobStep {
  key: CurriculumBuildStepKey;
  status: CurriculumBuildStepStatus;
  attempts: number;
  message?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CurriculumBuildJobChapterPlan {
  title: string;
  description: string;
  orderIndex: number;
  status: "planned" | "created";
  chapterId?: string | null;
}

export interface CurriculumBuildJobUnitPlan {
  chapterId: string;
  chapterTitle: string;
  title: string;
  description: string;
  orderIndex: number;
  status: "planned" | "created";
  unitId?: string | null;
}

export interface CurriculumBuildJobLessonPlan {
  chapterId: string;
  chapterTitle: string;
  unitId: string;
  unitTitle: string;
  title: string;
  description: string;
  orderIndex: number;
  status: "planned" | "created";
  lessonId?: string | null;
}

export interface CurriculumBuildArtifact {
  _id: string;
  id?: string;
  jobId: string;
  stepKey: "architect" | "generator" | "critic" | "refiner";
  phaseKey:
    | "architect_plan"
    | "architect_checkpoint"
    | "chapter_shells"
    | "unit_plan"
    | "unit_checkpoint"
    | "unit_shells"
    | "lesson_plan"
    | "lesson_checkpoint"
    | "lesson_shells"
    | "content_plan"
    | "content_generation"
    | "content_checkpoint"
    | "final_review";
  scopeType: "job" | "chapter" | "unit" | "lesson";
  scopeId?: string | null;
  scopeTitle?: string | null;
  attempt: number;
  status: "draft" | "accepted" | "rejected" | "applied" | "failed";
  summary: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  critic?: {
    ok: boolean;
    summary: string;
    issues: string[];
    issueDetails?: Record<string, unknown>[];
  } | null;
  refiner?: {
    fixed: boolean;
    summary: string;
    fixesApplied: string[];
    unresolvedIssues: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumBuildJob {
  _id: string;
  id?: string;
  language: Language;
  level: Level;
  requestedChapterCount: number;
  topic: string;
  extraInstructions: string;
  cefrTarget: string;
  status: CurriculumBuildJobStatus;
  currentStepKey: CurriculumBuildStepKey;
  steps: CurriculumBuildJobStep[];
  artifacts: {
    memorySummary: string;
    priorChapterTitles: string[];
    priorUnitTitles: string[];
    chapterPlan: CurriculumBuildJobChapterPlan[];
    unitPlan: CurriculumBuildJobUnitPlan[];
    lessonPlan: CurriculumBuildJobLessonPlan[];
    architectNotes: string[];
    criticSummary: string;
    criticIssues: string[];
    refinerSummary: string;
  };
  errors: Array<{
    stepKey?: CurriculumBuildStepKey | null;
    message: string;
    details?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  createdBy: string;
  startedAt?: string | null;
  finishedAt?: string | null;
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
  image?: {
    imageAssetId?: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
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
  _id: string;
  email: string;
  role: "admin" | "user";
}

export type UserRole = "admin" | "learner" | "tutor" | "voice_artist";

export interface AdminUserRecord {
  id: string;
  email: string;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
  tutorProfile?: {
    userId?: string;
    language: Language;
    displayName?: string;
    isActive: boolean;
  } | null;
  voiceArtistProfile?: {
    userId?: string;
    language: Language;
    displayName?: string;
    isActive: boolean;
  } | null;
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

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LessonAuditFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface LessonAuditResult {
  ok: boolean;
  publishBlocked: boolean;
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
