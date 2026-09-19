/**
 * Drizzle schema — Postgres port of the Mongoose models.
 *
 * Conventions
 * -----------
 * - PKs are 24-char ObjectId-hex `text` ids (see ids.ts). New rows default via
 *   `genObjectId()`; migrated rows keep their existing `_id` hex verbatim.
 * - `created_at` / `updated_at` are `timestamptz` (Mongo `timestamps: true`).
 *   `updated_at` is set by the app on write — Postgres won't auto-touch it.
 * - Soft delete stays `is_deleted` + `deleted_at`, matching every existing query.
 * - Normalized to tables: lesson stages/blocks and sentence/expression
 *   components (relational, reverse-queried by refId). Everything else that was
 *   an embedded document stays a typed jsonb column (see jsonTypes.ts).
 * - Enum strategy: `pgEnum` for the five ubiquitous, stable enums; `text().$type`
 *   for the many model-local status/kind unions (no ALTER TYPE churn while the
 *   product is still moving).
 * - Foreign keys: added only on the freshly-built child tables (stages/blocks),
 *   which are guaranteed consistent post-migration. Existing cross-entity refs
 *   stay plain indexed `text` (Mongo never enforced them; adding FKs now would
 *   trip on pre-existing orphans). Add them later after an orphan audit.
 *
 * Unique-index note: Mongo used `{language, textNormalized, isDeleted}` unique.
 * We express the actual intent as a PARTIAL unique index over active rows only
 * (`WHERE is_deleted = false`), which correctly allows unlimited soft-deleted
 * duplicates while keeping active text unique.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { genObjectId } from "./ids.js";
import type {
  ContentAiMeta,
  ContentAudio,
  ContentExample,
  ContentImage,
  CurriculumArtifactReport,
  CurriculumJobArtifacts,
  CurriculumJobErrors,
  CurriculumJobSteps,
  LanguageBranding,
  LanguageLearningConfig,
  LanguageSpeechConfig,
  LessonInlineProverb,
  QuestionInteractionData,
  QuestionReviewData,
  QuestionSourceRef,
  QuestionSubtype,
  QuestionType,
  SentenceMeaningSegment,
  UnitAiPreviewPlanSummary,
  UnitAiRunSummary,
  UserRole
} from "./jsonTypes.js";

/* ================================================================== */
/* Enums                                                              */
/* ================================================================== */

export const languageEnum = pgEnum("language", ["yoruba", "igbo", "hausa", "pidgin"]);
export const levelEnum = pgEnum("level", ["beginner", "intermediate", "advanced"]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "finished", "published"]);
export const contentTypeEnum = pgEnum("content_type", ["word", "expression", "sentence"]);
export const lessonKindEnum = pgEnum("lesson_kind", ["core", "review"]);

/* ================================================================== */
/* Column factories (fresh builders per table — Drizzle builders are  */
/* stateful, so we never reuse an instance across tables)             */
/* ================================================================== */

const pk = () => text("id").primaryKey().$defaultFn(genObjectId);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

const softDelete = () => ({
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

/** Shared base columns for word / expression / sentence (mirrors buildBaseContentFields). */
const contentBase = () => ({
  languageId: text("language_id"),
  language: languageEnum("language").notNull(),
  text: text("text").notNull(),
  textNormalized: text("text_normalized").notNull(),
  translations: text("translations").array().notNull().default(sql`'{}'::text[]`),
  pronunciation: text("pronunciation").notNull().default(""),
  explanation: text("explanation").notNull().default(""),
  examples: jsonb("examples").$type<ContentExample[]>().notNull().default(sql`'[]'::jsonb`),
  difficulty: integer("difficulty").notNull().default(1),
  aiMeta: jsonb("ai_meta").$type<ContentAiMeta>().notNull().default(sql`'{}'::jsonb`),
  audio: jsonb("audio").$type<ContentAudio>().notNull().default(sql`'{}'::jsonb`),
  status: contentStatusEnum("status").notNull().default("draft"),
  ...softDelete()
});

/* ================================================================== */
/* Content: words / expressions / sentences / components              */
/* ================================================================== */

export const words = pgTable(
  "words",
  {
    id: pk(),
    ...contentBase(),
    lemma: text("lemma").notNull().default(""),
    partOfSpeech: text("part_of_speech").notNull().default(""),
    image: jsonb("image").$type<ContentImage>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("words_lang_textnorm_active_uq")
      .on(t.language, t.textNormalized)
      .where(sql`${t.isDeleted} = false`),
    index("words_text_normalized_idx").on(t.textNormalized),
    index("words_language_status_active_idx").on(t.language, t.status, t.isDeleted),
    check("words_difficulty_range", sql`${t.difficulty} between 1 and 5`)
  ]
);

export const expressions = pgTable(
  "expressions",
  {
    id: pk(),
    ...contentBase(),
    register: text("register").$type<"formal" | "neutral" | "casual">().notNull().default("neutral"),
    // An idiom learners should see as one unit: `Bẹ́ẹ̀ ni` is "yes", and splitting it into
    // "so" + "is" teaches nothing. When true the learner payload sends no word breakdown, so
    // the expression is never split into separate tappable words. Set by an admin.
    keepWhole: boolean("keep_whole").notNull().default(false),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("expressions_lang_textnorm_active_uq")
      .on(t.language, t.textNormalized)
      .where(sql`${t.isDeleted} = false`),
    index("expressions_text_normalized_idx").on(t.textNormalized),
    index("expressions_language_status_active_idx").on(t.language, t.status, t.isDeleted),
    check("expressions_difficulty_range", sql`${t.difficulty} between 1 and 5`)
  ]
);

export const sentences = pgTable(
  "sentences",
  {
    id: pk(),
    ...contentBase(),
    literalTranslation: text("literal_translation").notNull().default(""),
    usageNotes: text("usage_notes").notNull().default(""),
    meaningSegments: jsonb("meaning_segments")
      .$type<SentenceMeaningSegment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("sentences_lang_textnorm_active_uq")
      .on(t.language, t.textNormalized)
      .where(sql`${t.isDeleted} = false`),
    index("sentences_text_normalized_idx").on(t.textNormalized),
    index("sentences_language_status_active_idx").on(t.language, t.status, t.isDeleted),
    check("sentences_difficulty_range", sql`${t.difficulty} between 1 and 5`)
  ]
);

/**
 * Normalized from Sentence.components[] / Expression.components[].
 *
 * These are split into two tables rather than one polymorphic table so that the
 * PARENT side can be a real enforced foreign key with ON DELETE CASCADE — the DB
 * guarantees no orphans and cleans up hard deletes for us.
 *
 * `ref_id` stays polymorphic (word|expression) and therefore cannot be an FK in
 * either design. The (type, ref_id) index powers reverse lookups such as
 * inspectExpressionRefs ("which sentences reference this expression?") — that
 * question now needs a UNION across both tables.
 */
export const sentenceComponents = pgTable(
  "sentence_components",
  {
    id: pk(),
    sentenceId: text("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    type: text("type").$type<"word" | "expression">().notNull(),
    refId: text("ref_id").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    textSnapshot: text("text_snapshot").notNull().default(""),
    // This occurrence's meaning, when the shared word row cannot supply it. Yoruba `sí`
    // is two different words -- "to/towards" and the negative existential in `ò sí`
    // ("is not present") -- but the unique index allows only one `sí` row, and the
    // learner payload always shows translations[0]. Nullable: null means "use the word
    // row", so existing rows and non-ambiguous words behave exactly as before.
    gloss: text("gloss"),
    // For an expression component: what each of the expression's words means in THIS
    // sentence, in the expression's component order. `ni` inside `Níbo ni` is "is" in
    // `Níbo ni omi?` but "are" in `Níbo ni o wà?`, which one expression-level gloss cannot
    // say. Null (or an empty slot) falls back to expression_components.gloss.
    partGlosses: text("part_glosses").array()
  },
  (t) => [
    index("sentence_components_parent_idx").on(t.sentenceId, t.orderIndex),
    index("sentence_components_ref_idx").on(t.type, t.refId)
  ]
);

export const expressionComponents = pgTable(
  "expression_components",
  {
    id: pk(),
    expressionId: text("expression_id")
      .notNull()
      .references(() => expressions.id, { onDelete: "cascade" }),
    type: text("type").$type<"word" | "expression">().notNull(),
    refId: text("ref_id").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    textSnapshot: text("text_snapshot").notNull().default(""),
    // What this word means inside the expression, shown in the expression's word breakdown.
    // Without it the breakdown fell back to the word row's first translation -- "am" for
    // `ni` in `Níbo ni`. Null means "use the word row", as before.
    gloss: text("gloss")
  },
  (t) => [
    index("expression_components_parent_idx").on(t.expressionId, t.orderIndex),
    index("expression_components_ref_idx").on(t.type, t.refId)
  ]
);

/* ================================================================== */
/* Curriculum structure: languages / chapters / units / lessons       */
/* ================================================================== */

export const languages = pgTable(
  "languages",
  {
    id: pk(),
    code: languageEnum("code").notNull(),
    name: text("name").notNull(),
    nativeName: text("native_name").notNull(),
    status: text("status").$type<"active" | "hidden" | "archived">().notNull().default("active"),
    orderIndex: integer("order_index").notNull().default(0),
    locale: text("locale").notNull().default(""),
    region: text("region").notNull().default(""),
    branding: jsonb("branding").$type<LanguageBranding>().notNull().default(sql`'{}'::jsonb`),
    speechConfig: jsonb("speech_config").$type<LanguageSpeechConfig>().notNull().default(sql`'{}'::jsonb`),
    learningConfig: jsonb("learning_config")
      .$type<LanguageLearningConfig>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("languages_code_uq").on(t.code),
    index("languages_status_order_idx").on(t.status, t.orderIndex)
  ]
);

export const chapters = pgTable(
  "chapters",
  {
    id: pk(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    languageId: text("language_id"),
    language: languageEnum("language").notNull(),
    level: levelEnum("level").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("chapters_language_active_order_idx").on(t.language, t.isDeleted, t.orderIndex, t.createdAt),
    index("chapters_language_id_active_order_idx").on(t.languageId, t.isDeleted, t.orderIndex, t.createdAt)
  ]
);

export const units = pgTable(
  "units",
  {
    id: pk(),
    chapterId: text("chapter_id"),
    languageId: text("language_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    language: languageEnum("language").notNull(),
    level: levelEnum("level").notNull(),
    kind: lessonKindEnum("kind").notNull().default("core"),
    reviewStyle: text("review_style").$type<"none" | "star" | "gym">().notNull().default("none"),
    reviewSourceUnitIds: text("review_source_unit_ids").array().notNull().default(sql`'{}'::text[]`),
    orderIndex: integer("order_index").notNull().default(0),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    lastAiRun: jsonb("last_ai_run").$type<UnitAiRunSummary>(),
    lastAiPreviewPlan: jsonb("last_ai_preview_plan").$type<UnitAiPreviewPlanSummary>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("units_chapter_active_order_idx").on(t.chapterId, t.isDeleted, t.orderIndex, t.createdAt),
    index("units_language_active_order_idx").on(t.language, t.isDeleted, t.orderIndex, t.createdAt),
    index("units_language_id_active_order_idx").on(t.languageId, t.isDeleted, t.orderIndex, t.createdAt)
  ]
);

export const lessons = pgTable(
  "lessons",
  {
    id: pk(),
    title: text("title").notNull(),
    unitId: text("unit_id").notNull(),
    languageId: text("language_id"),
    language: languageEnum("language").notNull(),
    level: levelEnum("level").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    description: text("description").notNull().default(""),
    topics: text("topics").array().notNull().default(sql`'{}'::text[]`),
    kind: lessonKindEnum("kind").notNull().default("core"),
    proverbs: jsonb("proverbs").$type<LessonInlineProverb[]>().notNull().default(sql`'[]'::jsonb`),
    status: contentStatusEnum("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("lessons_unit_active_order_idx").on(t.unitId, t.isDeleted, t.orderIndex, t.createdAt),
    index("lessons_language_active_order_idx").on(t.language, t.isDeleted, t.orderIndex, t.createdAt),
    index("lessons_language_id_active_order_idx").on(t.languageId, t.isDeleted, t.orderIndex, t.createdAt)
  ]
);

/** Normalized from Lesson.stages[]. order_index preserves former array position. */
export const lessonStages = pgTable(
  "lesson_stages",
  {
    id: pk(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default("")
  },
  (t) => [index("lesson_stages_lesson_order_idx").on(t.lessonId, t.orderIndex)]
);

/** Normalized from Lesson.stages[].blocks[]. content_type/ref_id stays polymorphic. */
export const lessonBlocks = pgTable(
  "lesson_blocks",
  {
    id: pk(),
    stageId: text("stage_id")
      .notNull()
      .references(() => lessonStages.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    type: text("type").$type<"text" | "content" | "proverb" | "question">().notNull(),
    content: text("content"),
    contentType: text("content_type").$type<"word" | "expression" | "sentence">(),
    refId: text("ref_id"),
    translationIndex: integer("translation_index").notNull().default(0)
  },
  (t) => [
    index("lesson_blocks_stage_order_idx").on(t.stageId, t.orderIndex),
    index("lesson_blocks_ref_idx").on(t.contentType, t.refId)
  ]
);

/* ================================================================== */
/* Proverbs & exercise questions                                      */
/* ================================================================== */

export const proverbs = pgTable(
  "proverbs",
  {
    id: pk(),
    lessonIds: text("lesson_ids").array().notNull().default(sql`'{}'::text[]`),
    deletedLessonIds: text("deleted_lesson_ids").array().notNull().default(sql`'{}'::text[]`),
    languageId: text("language_id"),
    language: languageEnum("language").notNull(),
    text: text("text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    translation: text("translation").notNull().default(""),
    contextNote: text("context_note").notNull().default(""),
    aiMeta: jsonb("ai_meta").$type<ContentAiMeta>().notNull().default(sql`'{}'::jsonb`),
    status: contentStatusEnum("status").notNull().default("draft"),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("proverbs_lesson_ids_gin").using("gin", t.lessonIds),
    index("proverbs_deleted_lesson_ids_gin").using("gin", t.deletedLessonIds),
    index("proverbs_language_status_active_idx").on(t.language, t.status, t.isDeleted, t.createdAt),
    index("proverbs_language_normtext_active_idx").on(t.language, t.normalizedText, t.isDeleted)
  ]
);

export const exerciseQuestions = pgTable(
  "exercise_questions",
  {
    id: pk(),
    lessonId: text("lesson_id").notNull(),
    sourceType: text("source_type").$type<"word" | "expression" | "sentence">(),
    sourceId: text("source_id"),
    relatedSourceRefs: jsonb("related_source_refs")
      .$type<QuestionSourceRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    translationIndex: integer("translation_index").notNull().default(0),
    type: text("type").$type<QuestionType>().notNull(),
    subtype: text("subtype").$type<QuestionSubtype>().notNull(),
    promptTemplate: text("prompt_template").notNull().default("What is {phrase} in English?"),
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    correctIndex: integer("correct_index").notNull().default(0),
    reviewData: jsonb("review_data").$type<QuestionReviewData>().notNull().default(sql`'{}'::jsonb`),
    interactionData: jsonb("interaction_data")
      .$type<QuestionInteractionData>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    explanation: text("explanation").notNull().default(""),
    status: contentStatusEnum("status").notNull().default("draft"),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("exercise_questions_lesson_status_active_idx").on(t.lessonId, t.status, t.isDeleted, t.createdAt),
    index("exercise_questions_lesson_type_status_active_idx").on(
      t.lessonId,
      t.type,
      t.status,
      t.isDeleted,
      t.createdAt
    ),
    index("exercise_questions_source_idx").on(t.sourceType, t.sourceId, t.isDeleted)
  ]
);

/* ================================================================== */
/* Lesson / unit content links                                        */
/* ================================================================== */

export const lessonContentItems = pgTable(
  "lesson_content_items",
  {
    id: pk(),
    lessonId: text("lesson_id").notNull(),
    unitId: text("unit_id").notNull(),
    contentType: contentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    role: text("role").$type<"introduce" | "review" | "practice">().notNull(),
    stageIndex: integer("stage_index"),
    orderIndex: integer("order_index").notNull().default(0),
    createdBy: text("created_by").notNull(),
    ...timestamps()
  },
  (t) => [
    index("lesson_content_items_lesson_order_idx").on(t.lessonId, t.orderIndex, t.createdAt),
    uniqueIndex("lesson_content_items_unique").on(t.lessonId, t.contentType, t.contentId)
  ]
);

export const unitContentItems = pgTable(
  "unit_content_items",
  {
    id: pk(),
    unitId: text("unit_id").notNull(),
    contentType: contentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    role: text("role").$type<"introduce" | "review">().notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    sourceUnitId: text("source_unit_id"),
    createdBy: text("created_by").notNull(),
    ...timestamps()
  },
  (t) => [
    index("unit_content_items_unit_order_idx").on(t.unitId, t.orderIndex, t.createdAt),
    uniqueIndex("unit_content_items_unique").on(t.unitId, t.contentType, t.contentId)
  ]
);

/* ================================================================== */
/* Images                                                             */
/* ================================================================== */

export const imageAssets = pgTable(
  "image_assets",
  {
    id: pk(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url").notNull().default(""),
    storageKey: text("storage_key").notNull().default(""),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    description: text("description").notNull().default(""),
    altText: text("alt_text").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    languageNeutralLabel: text("language_neutral_label").notNull().default(""),
    status: text("status").$type<"draft" | "approved">().notNull().default("draft"),
    uploadedBy: text("uploaded_by").notNull(),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("image_assets_status_active_idx").on(t.status, t.isDeleted, t.createdAt),
    index("image_assets_uploaded_by_active_idx").on(t.uploadedBy, t.isDeleted, t.createdAt)
  ]
);

export const expressionImageLinks = pgTable(
  "expression_image_links",
  {
    id: pk(),
    expressionId: text("expression_id").notNull(),
    translationIndex: integer("translation_index"),
    imageAssetId: text("image_asset_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    ...softDelete(),
    ...timestamps()
  },
  (t) => [
    index("expression_image_links_expression_active_idx").on(t.expressionId, t.isDeleted, t.createdAt),
    index("expression_image_links_asset_active_idx").on(t.imageAssetId, t.isDeleted, t.createdAt),
    index("expression_image_links_expr_asset_ti_idx").on(
      t.expressionId,
      t.imageAssetId,
      t.translationIndex,
      t.isDeleted
    )
  ]
);

/* ================================================================== */
/* Users                                                              */
/* ================================================================== */

export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    roles: text("roles").array().$type<UserRole[]>().notNull().default(sql`'{learner}'::text[]`),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    index("users_roles_gin").using("gin", t.roles)
  ]
);

/* ================================================================== */
/* Learner state & progress                                           */
/* ================================================================== */

export const learnerProfiles = pgTable(
  "learner_profiles",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    activeLanguageId: text("active_language_id"),
    name: text("name").notNull().default(""),
    displayName: text("display_name").notNull().default(""),
    username: text("username").notNull().default(""),
    avatarUrl: text("avatar_url").notNull().default(""),
    proficientLanguage: text("proficient_language").notNull().default(""),
    countryOfOrigin: text("country_of_origin").notNull().default(""),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    currentLanguage: languageEnum("current_language").notNull().default("yoruba"),
    dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(10),
    totalXp: bigint("total_xp", { mode: "number" }).notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActiveDate: timestamp("last_active_date", { withTimezone: true }),
    completedLessonsCount: integer("completed_lessons_count").notNull().default(0),
    achievements: text("achievements").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("learner_profiles_user_uq").on(t.userId),
    uniqueIndex("learner_profiles_username_uq").on(t.username).where(sql`${t.username} <> ''`),
    index("learner_profiles_current_language_idx").on(t.currentLanguage, t.updatedAt),
    index("learner_profiles_streak_xp_idx").on(t.currentStreak, t.totalXp),
    check("learner_profiles_daily_goal_range", sql`${t.dailyGoalMinutes} between 1 and 120`)
  ]
);

export const learnerLanguageStates = pgTable(
  "learner_language_states",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    languageId: text("language_id"),
    languageCode: languageEnum("language_code").notNull(),
    isEnrolled: boolean("is_enrolled").notNull().default(true),
    dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(10),
    totalXp: bigint("total_xp", { mode: "number" }).notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActiveDate: timestamp("last_active_date", { withTimezone: true }),
    completedLessonsCount: integer("completed_lessons_count").notNull().default(0),
    achievements: text("achievements").array().notNull().default(sql`'{}'::text[]`),
    currentChapterId: text("current_chapter_id"),
    currentUnitId: text("current_unit_id"),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("learner_language_states_user_code_uq").on(t.userId, t.languageCode),
    uniqueIndex("learner_language_states_user_langid_uq")
      .on(t.userId, t.languageId)
      .where(sql`${t.languageId} is not null`),
    check("learner_language_states_daily_goal_range", sql`${t.dailyGoalMinutes} between 1 and 120`)
  ]
);

/**
 * Normalized from weeklyActivity[] on learner_profiles AND learner_language_states.
 * One row per (user, language, day) so we can aggregate streaks/totals and upsert a
 * single day atomically. `language_code` is nullable: NULL = the profile-level
 * (all-languages) aggregate that learner_profiles.weeklyActivity used to hold.
 * `nullsNotDistinct` makes the unique index treat that NULL as a single slot.
 */
export const learnerActivityDays = pgTable(
  "learner_activity_days",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    languageCode: languageEnum("language_code"),
    activityDate: date("activity_date").notNull(),
    minutes: integer("minutes").notNull().default(0),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("learner_activity_days_lang_unique")
      .on(t.userId, t.languageCode, t.activityDate)
      .where(sql`${t.languageCode} is not null`),
    uniqueIndex("learner_activity_days_global_unique")
      .on(t.userId, t.activityDate)
      .where(sql`${t.languageCode} is null`),
    index("learner_activity_days_user_date_idx").on(t.userId, t.activityDate),
    check("learner_activity_days_minutes_nonneg", sql`${t.minutes} >= 0`)
  ]
);

export const learnerContentPerformance = pgTable(
  "learner_content_performance",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    language: languageEnum("language").notNull(),
    contentType: contentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    exposureCount: integer("exposure_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    speakingFailureCount: integer("speaking_failure_count").notNull().default(0),
    listeningFailureCount: integer("listening_failure_count").notNull().default(0),
    contextScenarioFailureCount: integer("context_scenario_failure_count").notNull().default(0),
    lastLessonId: text("last_lesson_id"),
    lastQuestionType: text("last_question_type").$type<QuestionType>(),
    lastQuestionSubtype: text("last_question_subtype").$type<QuestionSubtype>(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("learner_content_performance_unique").on(t.userId, t.contentType, t.contentId),
    index("learner_content_performance_user_lang_idx").on(t.userId, t.language, t.updatedAt)
  ]
);

export const learnerQuestionMisses = pgTable(
  "learner_question_misses",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    questionId: text("question_id").notNull(),
    questionType: text("question_type").$type<QuestionType>().notNull(),
    questionSubtype: text("question_subtype").$type<QuestionSubtype>().notNull(),
    sourceType: text("source_type").$type<"word" | "expression" | "sentence">(),
    sourceId: text("source_id"),
    missCount: integer("miss_count").notNull().default(0),
    firstMissedAt: timestamp("first_missed_at", { withTimezone: true }).notNull(),
    lastMissedAt: timestamp("last_missed_at", { withTimezone: true }).notNull(),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("learner_question_misses_unique").on(t.userId, t.questionId),
    index("learner_question_misses_user_lesson_idx").on(t.userId, t.lessonId, t.lastMissedAt)
  ]
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    status: text("status").$type<"not_started" | "in_progress" | "completed">().notNull().default("not_started"),
    progressPercent: integer("progress_percent").notNull().default(0),
    xpEarned: integer("xp_earned").notNull().default(0),
    currentStageIndex: integer("current_stage_index").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("lesson_progress_user_lesson_uq").on(t.userId, t.lessonId),
    index("lesson_progress_user_status_idx").on(t.userId, t.status, t.updatedAt),
    index("lesson_progress_lesson_status_idx").on(t.lessonId, t.status, t.updatedAt),
    check("lesson_progress_percent_range", sql`${t.progressPercent} between 0 and 100`)
  ]
);

/** Normalized from LessonProgress.stepProgress[] — updated one step at a time. */
export const lessonStepProgress = pgTable(
  "lesson_step_progress",
  {
    id: pk(),
    lessonProgressId: text("lesson_progress_id")
      .notNull()
      .references(() => lessonProgress.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    status: text("status").$type<"locked" | "available" | "completed">().notNull().default("available"),
    score: doublePrecision("score").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (t) => [uniqueIndex("lesson_step_progress_unique").on(t.lessonProgressId, t.stepKey)]
);

/** Normalized from LessonProgress.stageProgress[]. stage_id stays plain text (not an
 *  FK to lesson_stages) so migration isn't coupled to remapping embedded stage ids. */
export const lessonStageProgress = pgTable(
  "lesson_stage_progress",
  {
    id: pk(),
    lessonProgressId: text("lesson_progress_id")
      .notNull()
      .references(() => lessonProgress.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),
    stageIndex: integer("stage_index").notNull().default(0),
    status: text("status")
      .$type<"not_started" | "in_progress" | "completed">()
      .notNull()
      .default("not_started"),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (t) => [uniqueIndex("lesson_stage_progress_unique").on(t.lessonProgressId, t.stageId)]
);

/* ================================================================== */
/* Tutor & voice                                                      */
/* ================================================================== */

export const tutorProfiles = pgTable(
  "tutor_profiles",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    language: languageEnum("language"),
    displayName: text("display_name").notNull().default(""),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("tutor_profiles_user_uq").on(t.userId),
    index("tutor_profiles_active_idx").on(t.isActive, t.createdAt),
    index("tutor_profiles_language_active_idx").on(t.language, t.isActive, t.createdAt)
  ]
);

export const voiceArtistProfiles = pgTable(
  "voice_artist_profiles",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    language: languageEnum("language").notNull(),
    displayName: text("display_name").notNull().default(""),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps()
  },
  (t) => [
    uniqueIndex("voice_artist_profiles_user_uq").on(t.userId),
    index("voice_artist_profiles_language_active_idx").on(t.language, t.isActive, t.createdAt)
  ]
);

export const voiceAudioSubmissions = pgTable(
  "voice_audio_submissions",
  {
    id: pk(),
    contentType: contentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    voiceArtistUserId: text("voice_artist_user_id").notNull(),
    voiceArtistProfileId: text("voice_artist_profile_id").notNull(),
    language: languageEnum("language").notNull(),
    audio: jsonb("audio").$type<ContentAudio>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").$type<"pending" | "accepted" | "rejected">().notNull().default("pending"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps()
  },
  (t) => [
    index("voice_audio_submissions_status_idx").on(t.status, t.createdAt),
    index("voice_audio_submissions_artist_status_idx").on(t.voiceArtistUserId, t.status, t.createdAt),
    index("voice_audio_submissions_content_status_idx").on(
      t.contentType,
      t.contentId,
      t.status,
      t.createdAt
    )
  ]
);

/* ================================================================== */
/* Curriculum build pipeline                                          */
/* ================================================================== */

export const curriculumBuildJobs = pgTable(
  "curriculum_build_jobs",
  {
    id: pk(),
    languageId: text("language_id"),
    language: languageEnum("language").notNull(),
    level: levelEnum("level").notNull(),
    requestedChapterCount: integer("requested_chapter_count").notNull(),
    topic: text("topic").notNull().default(""),
    extraInstructions: text("extra_instructions").notNull().default(""),
    cefrTarget: text("cefr_target").notNull().default(""),
    status: text("status")
      .$type<"queued" | "running" | "planned" | "completed" | "failed" | "cancelled">()
      .notNull()
      .default("queued"),
    currentStepKey: text("current_step_key")
      .$type<"architect" | "generator" | "critic" | "refiner">()
      .notNull()
      .default("architect"),
    steps: jsonb("steps").$type<CurriculumJobSteps>().notNull().default(sql`'[]'::jsonb`),
    artifacts: jsonb("artifacts").$type<CurriculumJobArtifacts>(),
    errors: jsonb("errors").$type<CurriculumJobErrors>().notNull().default(sql`'[]'::jsonb`),
    createdBy: text("created_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps()
  },
  (t) => [
    index("curriculum_build_jobs_created_by_idx").on(t.createdBy, t.createdAt),
    index("curriculum_build_jobs_status_idx").on(t.status, t.updatedAt),
    index("curriculum_build_jobs_language_level_idx").on(t.language, t.level, t.createdAt),
    check("curriculum_build_jobs_chapter_count_range", sql`${t.requestedChapterCount} between 1 and 30`)
  ]
);

export const curriculumBuildArtifacts = pgTable(
  "curriculum_build_artifacts",
  {
    id: pk(),
    jobId: text("job_id").notNull(),
    stepKey: text("step_key").$type<"architect" | "generator" | "critic" | "refiner">().notNull(),
    phaseKey: text("phase_key").notNull(),
    scopeType: text("scope_type").$type<"job" | "chapter" | "unit" | "lesson">().notNull(),
    scopeId: text("scope_id"),
    scopeTitle: text("scope_title"),
    attempt: integer("attempt").notNull(),
    status: text("status").$type<"draft" | "accepted" | "rejected" | "applied" | "failed">().notNull(),
    summary: text("summary").notNull().default(""),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    critic: jsonb("critic").$type<CurriculumArtifactReport>(),
    refiner: jsonb("refiner").$type<CurriculumArtifactReport>(),
    ...timestamps()
  },
  (t) => [
    index("curriculum_build_artifacts_job_idx").on(t.jobId, t.createdAt),
    index("curriculum_build_artifacts_job_phase_scope_idx").on(t.jobId, t.phaseKey, t.scopeId, t.attempt)
  ]
);

/* ================================================================== */
/* Inferred row types (handy for the repositories/mappers)            */
/* ================================================================== */

export type WordRow = typeof words.$inferSelect;
export type NewWordRow = typeof words.$inferInsert;
export type ExpressionRow = typeof expressions.$inferSelect;
export type NewExpressionRow = typeof expressions.$inferInsert;
export type SentenceRow = typeof sentences.$inferSelect;
export type NewSentenceRow = typeof sentences.$inferInsert;
export type SentenceComponentRow = typeof sentenceComponents.$inferSelect;
export type NewSentenceComponentRow = typeof sentenceComponents.$inferInsert;
export type ExpressionComponentRow = typeof expressionComponents.$inferSelect;
export type NewExpressionComponentRow = typeof expressionComponents.$inferInsert;
export type LanguageRow = typeof languages.$inferSelect;
export type NewLanguageRow = typeof languages.$inferInsert;
export type ChapterRow = typeof chapters.$inferSelect;
export type NewChapterRow = typeof chapters.$inferInsert;
export type UnitRow = typeof units.$inferSelect;
export type NewUnitRow = typeof units.$inferInsert;
export type LessonRow = typeof lessons.$inferSelect;
export type NewLessonRow = typeof lessons.$inferInsert;
export type LessonStageRow = typeof lessonStages.$inferSelect;
export type NewLessonStageRow = typeof lessonStages.$inferInsert;
export type LessonBlockRow = typeof lessonBlocks.$inferSelect;
export type NewLessonBlockRow = typeof lessonBlocks.$inferInsert;
export type ProverbRow = typeof proverbs.$inferSelect;
export type NewProverbRow = typeof proverbs.$inferInsert;
export type ExerciseQuestionRow = typeof exerciseQuestions.$inferSelect;
export type NewExerciseQuestionRow = typeof exerciseQuestions.$inferInsert;
export type LessonContentItemRow = typeof lessonContentItems.$inferSelect;
export type NewLessonContentItemRow = typeof lessonContentItems.$inferInsert;
export type UnitContentItemRow = typeof unitContentItems.$inferSelect;
export type NewUnitContentItemRow = typeof unitContentItems.$inferInsert;
export type ImageAssetRow = typeof imageAssets.$inferSelect;
export type NewImageAssetRow = typeof imageAssets.$inferInsert;
export type ExpressionImageLinkRow = typeof expressionImageLinks.$inferSelect;
export type NewExpressionImageLinkRow = typeof expressionImageLinks.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type LearnerProfileRow = typeof learnerProfiles.$inferSelect;
export type NewLearnerProfileRow = typeof learnerProfiles.$inferInsert;
export type LearnerLanguageStateRow = typeof learnerLanguageStates.$inferSelect;
export type NewLearnerLanguageStateRow = typeof learnerLanguageStates.$inferInsert;
export type LearnerContentPerformanceRow = typeof learnerContentPerformance.$inferSelect;
export type NewLearnerContentPerformanceRow = typeof learnerContentPerformance.$inferInsert;
export type LearnerQuestionMissRow = typeof learnerQuestionMisses.$inferSelect;
export type NewLearnerQuestionMissRow = typeof learnerQuestionMisses.$inferInsert;
export type LessonProgressRow = typeof lessonProgress.$inferSelect;
export type NewLessonProgressRow = typeof lessonProgress.$inferInsert;
export type LessonStepProgressRow = typeof lessonStepProgress.$inferSelect;
export type NewLessonStepProgressRow = typeof lessonStepProgress.$inferInsert;
export type LessonStageProgressRow = typeof lessonStageProgress.$inferSelect;
export type NewLessonStageProgressRow = typeof lessonStageProgress.$inferInsert;
export type LearnerActivityDayRow = typeof learnerActivityDays.$inferSelect;
export type NewLearnerActivityDayRow = typeof learnerActivityDays.$inferInsert;
export type TutorProfileRow = typeof tutorProfiles.$inferSelect;
export type NewTutorProfileRow = typeof tutorProfiles.$inferInsert;
export type VoiceArtistProfileRow = typeof voiceArtistProfiles.$inferSelect;
export type NewVoiceArtistProfileRow = typeof voiceArtistProfiles.$inferInsert;
export type VoiceAudioSubmissionRow = typeof voiceAudioSubmissions.$inferSelect;
export type NewVoiceAudioSubmissionRow = typeof voiceAudioSubmissions.$inferInsert;
export type CurriculumBuildJobRow = typeof curriculumBuildJobs.$inferSelect;
export type NewCurriculumBuildJobRow = typeof curriculumBuildJobs.$inferInsert;
export type CurriculumBuildArtifactRow = typeof curriculumBuildArtifacts.$inferSelect;
export type NewCurriculumBuildArtifactRow = typeof curriculumBuildArtifacts.$inferInsert;
