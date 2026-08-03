CREATE TYPE "public"."content_status" AS ENUM('draft', 'finished', 'published');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('word', 'expression', 'sentence');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('yoruba', 'igbo', 'hausa', 'pidgin');--> statement-breakpoint
CREATE TYPE "public"."lesson_kind" AS ENUM('core', 'review');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"level" "level" NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"published_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_build_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"step_key" text NOT NULL,
	"phase_key" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"scope_title" text,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"critic" jsonb,
	"refiner" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_build_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"level" "level" NOT NULL,
	"requested_chapter_count" integer NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"extra_instructions" text DEFAULT '' NOT NULL,
	"cefr_target" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_step_key" text DEFAULT 'architect' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifacts" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_build_jobs_chapter_count_range" CHECK ("curriculum_build_jobs"."requested_chapter_count" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "exercise_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"related_source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"translation_index" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"subtype" text NOT NULL,
	"prompt_template" text DEFAULT 'What is {phrase} in English?' NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"correct_index" integer DEFAULT 0 NOT NULL,
	"review_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"interaction_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expression_components" (
	"id" text PRIMARY KEY NOT NULL,
	"expression_id" text NOT NULL,
	"type" text NOT NULL,
	"ref_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"text_snapshot" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expression_image_links" (
	"id" text PRIMARY KEY NOT NULL,
	"expression_id" text NOT NULL,
	"translation_index" integer,
	"image_asset_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expressions" (
	"id" text PRIMARY KEY NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"text" text NOT NULL,
	"text_normalized" text NOT NULL,
	"translations" text[] DEFAULT '{}'::text[] NOT NULL,
	"pronunciation" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"ai_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"register" text DEFAULT 'neutral' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expressions_difficulty_range" CHECK ("expressions"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text DEFAULT '' NOT NULL,
	"storage_key" text DEFAULT '' NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"description" text DEFAULT '' NOT NULL,
	"alt_text" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"language_neutral_label" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"uploaded_by" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" text PRIMARY KEY NOT NULL,
	"code" "language" NOT NULL,
	"name" text NOT NULL,
	"native_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"speech_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"learning_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_activity_days" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language_code" "language",
	"activity_date" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_activity_days_minutes_nonneg" CHECK ("learner_activity_days"."minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "learner_content_performance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language" "language" NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" text NOT NULL,
	"exposure_count" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"speaking_failure_count" integer DEFAULT 0 NOT NULL,
	"listening_failure_count" integer DEFAULT 0 NOT NULL,
	"context_scenario_failure_count" integer DEFAULT 0 NOT NULL,
	"last_lesson_id" text,
	"last_question_type" text,
	"last_question_subtype" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_language_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language_id" text,
	"language_code" "language" NOT NULL,
	"is_enrolled" boolean DEFAULT true NOT NULL,
	"daily_goal_minutes" integer DEFAULT 10 NOT NULL,
	"total_xp" bigint DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" timestamp with time zone,
	"completed_lessons_count" integer DEFAULT 0 NOT NULL,
	"achievements" text[] DEFAULT '{}'::text[] NOT NULL,
	"current_chapter_id" text,
	"current_unit_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_language_states_daily_goal_range" CHECK ("learner_language_states"."daily_goal_minutes" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "learner_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"active_language_id" text,
	"name" text DEFAULT '' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"proficient_language" text DEFAULT '' NOT NULL,
	"country_of_origin" text DEFAULT '' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"current_language" "language" DEFAULT 'yoruba' NOT NULL,
	"daily_goal_minutes" integer DEFAULT 10 NOT NULL,
	"total_xp" bigint DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" timestamp with time zone,
	"completed_lessons_count" integer DEFAULT 0 NOT NULL,
	"achievements" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_profiles_daily_goal_range" CHECK ("learner_profiles"."daily_goal_minutes" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "learner_question_misses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"question_id" text NOT NULL,
	"question_type" text NOT NULL,
	"question_subtype" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"miss_count" integer DEFAULT 0 NOT NULL,
	"first_missed_at" timestamp with time zone NOT NULL,
	"last_missed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"stage_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"content_type" text,
	"ref_id" text,
	"translation_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" text NOT NULL,
	"role" text NOT NULL,
	"stage_index" integer,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"current_stage_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_percent_range" CHECK ("lesson_progress"."progress_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "lesson_stage_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_progress_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"stage_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lesson_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_step_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_progress_id" text NOT NULL,
	"step_key" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"unit_id" text NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"level" "level" NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"kind" "lesson_kind" DEFAULT 'core' NOT NULL,
	"proverbs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"published_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proverbs" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"deleted_lesson_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"translation" text DEFAULT '' NOT NULL,
	"context_note" text DEFAULT '' NOT NULL,
	"ai_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentence_components" (
	"id" text PRIMARY KEY NOT NULL,
	"sentence_id" text NOT NULL,
	"type" text NOT NULL,
	"ref_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"text_snapshot" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentences" (
	"id" text PRIMARY KEY NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"text" text NOT NULL,
	"text_normalized" text NOT NULL,
	"translations" text[] DEFAULT '{}'::text[] NOT NULL,
	"pronunciation" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"ai_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"literal_translation" text DEFAULT '' NOT NULL,
	"usage_notes" text DEFAULT '' NOT NULL,
	"meaning_segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentences_difficulty_range" CHECK ("sentences"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "tutor_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language" "language",
	"display_name" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" text NOT NULL,
	"role" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"source_unit_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text,
	"language_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"language" "language" NOT NULL,
	"level" "level" NOT NULL,
	"kind" "lesson_kind" DEFAULT 'core' NOT NULL,
	"review_style" text DEFAULT 'none' NOT NULL,
	"review_source_unit_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"last_ai_run" jsonb,
	"last_ai_preview_plan" jsonb,
	"published_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"roles" text[] DEFAULT '{learner}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_artist_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language" "language" NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_audio_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" text NOT NULL,
	"voice_artist_user_id" text NOT NULL,
	"voice_artist_profile_id" text NOT NULL,
	"language" "language" NOT NULL,
	"audio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" text PRIMARY KEY NOT NULL,
	"language_id" text,
	"language" "language" NOT NULL,
	"text" text NOT NULL,
	"text_normalized" text NOT NULL,
	"translations" text[] DEFAULT '{}'::text[] NOT NULL,
	"pronunciation" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"ai_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"lemma" text DEFAULT '' NOT NULL,
	"part_of_speech" text DEFAULT '' NOT NULL,
	"image" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "words_difficulty_range" CHECK ("words"."difficulty" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "expression_components" ADD CONSTRAINT "expression_components_expression_id_expressions_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."expressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_stage_id_lesson_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."lesson_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_stage_progress" ADD CONSTRAINT "lesson_stage_progress_lesson_progress_id_lesson_progress_id_fk" FOREIGN KEY ("lesson_progress_id") REFERENCES "public"."lesson_progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_stages" ADD CONSTRAINT "lesson_stages_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_step_progress" ADD CONSTRAINT "lesson_step_progress_lesson_progress_id_lesson_progress_id_fk" FOREIGN KEY ("lesson_progress_id") REFERENCES "public"."lesson_progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_components" ADD CONSTRAINT "sentence_components_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_language_active_order_idx" ON "chapters" USING btree ("language","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "chapters_language_id_active_order_idx" ON "chapters" USING btree ("language_id","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "curriculum_build_artifacts_job_idx" ON "curriculum_build_artifacts" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "curriculum_build_artifacts_job_phase_scope_idx" ON "curriculum_build_artifacts" USING btree ("job_id","phase_key","scope_id","attempt");--> statement-breakpoint
CREATE INDEX "curriculum_build_jobs_created_by_idx" ON "curriculum_build_jobs" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "curriculum_build_jobs_status_idx" ON "curriculum_build_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "curriculum_build_jobs_language_level_idx" ON "curriculum_build_jobs" USING btree ("language","level","created_at");--> statement-breakpoint
CREATE INDEX "exercise_questions_lesson_status_active_idx" ON "exercise_questions" USING btree ("lesson_id","status","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "exercise_questions_lesson_type_status_active_idx" ON "exercise_questions" USING btree ("lesson_id","type","status","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "exercise_questions_source_idx" ON "exercise_questions" USING btree ("source_type","source_id","is_deleted");--> statement-breakpoint
CREATE INDEX "expression_components_parent_idx" ON "expression_components" USING btree ("expression_id","order_index");--> statement-breakpoint
CREATE INDEX "expression_components_ref_idx" ON "expression_components" USING btree ("type","ref_id");--> statement-breakpoint
CREATE INDEX "expression_image_links_expression_active_idx" ON "expression_image_links" USING btree ("expression_id","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "expression_image_links_asset_active_idx" ON "expression_image_links" USING btree ("image_asset_id","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "expression_image_links_expr_asset_ti_idx" ON "expression_image_links" USING btree ("expression_id","image_asset_id","translation_index","is_deleted");--> statement-breakpoint
CREATE UNIQUE INDEX "expressions_lang_textnorm_active_uq" ON "expressions" USING btree ("language","text_normalized") WHERE "expressions"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "expressions_text_normalized_idx" ON "expressions" USING btree ("text_normalized");--> statement-breakpoint
CREATE INDEX "expressions_language_status_active_idx" ON "expressions" USING btree ("language","status","is_deleted");--> statement-breakpoint
CREATE INDEX "image_assets_status_active_idx" ON "image_assets" USING btree ("status","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "image_assets_uploaded_by_active_idx" ON "image_assets" USING btree ("uploaded_by","is_deleted","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "languages_code_uq" ON "languages" USING btree ("code");--> statement-breakpoint
CREATE INDEX "languages_status_order_idx" ON "languages" USING btree ("status","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_activity_days_lang_unique" ON "learner_activity_days" USING btree ("user_id","language_code","activity_date") WHERE "learner_activity_days"."language_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_activity_days_global_unique" ON "learner_activity_days" USING btree ("user_id","activity_date") WHERE "learner_activity_days"."language_code" is null;--> statement-breakpoint
CREATE INDEX "learner_activity_days_user_date_idx" ON "learner_activity_days" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_content_performance_unique" ON "learner_content_performance" USING btree ("user_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "learner_content_performance_user_lang_idx" ON "learner_content_performance" USING btree ("user_id","language","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_language_states_user_code_uq" ON "learner_language_states" USING btree ("user_id","language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_language_states_user_langid_uq" ON "learner_language_states" USING btree ("user_id","language_id") WHERE "learner_language_states"."language_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_profiles_user_uq" ON "learner_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_profiles_username_uq" ON "learner_profiles" USING btree ("username") WHERE "learner_profiles"."username" <> '';--> statement-breakpoint
CREATE INDEX "learner_profiles_current_language_idx" ON "learner_profiles" USING btree ("current_language","updated_at");--> statement-breakpoint
CREATE INDEX "learner_profiles_streak_xp_idx" ON "learner_profiles" USING btree ("current_streak","total_xp");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_question_misses_unique" ON "learner_question_misses" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "learner_question_misses_user_lesson_idx" ON "learner_question_misses" USING btree ("user_id","lesson_id","last_missed_at");--> statement-breakpoint
CREATE INDEX "lesson_blocks_stage_order_idx" ON "lesson_blocks" USING btree ("stage_id","order_index");--> statement-breakpoint
CREATE INDEX "lesson_blocks_ref_idx" ON "lesson_blocks" USING btree ("content_type","ref_id");--> statement-breakpoint
CREATE INDEX "lesson_content_items_lesson_order_idx" ON "lesson_content_items" USING btree ("lesson_id","order_index","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_content_items_unique" ON "lesson_content_items" USING btree ("lesson_id","content_type","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_user_lesson_uq" ON "lesson_progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_user_status_idx" ON "lesson_progress" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "lesson_progress_lesson_status_idx" ON "lesson_progress" USING btree ("lesson_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_stage_progress_unique" ON "lesson_stage_progress" USING btree ("lesson_progress_id","stage_id");--> statement-breakpoint
CREATE INDEX "lesson_stages_lesson_order_idx" ON "lesson_stages" USING btree ("lesson_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_step_progress_unique" ON "lesson_step_progress" USING btree ("lesson_progress_id","step_key");--> statement-breakpoint
CREATE INDEX "lessons_unit_active_order_idx" ON "lessons" USING btree ("unit_id","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "lessons_language_active_order_idx" ON "lessons" USING btree ("language","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "lessons_language_id_active_order_idx" ON "lessons" USING btree ("language_id","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "proverbs_lesson_ids_gin" ON "proverbs" USING gin ("lesson_ids");--> statement-breakpoint
CREATE INDEX "proverbs_deleted_lesson_ids_gin" ON "proverbs" USING gin ("deleted_lesson_ids");--> statement-breakpoint
CREATE INDEX "proverbs_language_status_active_idx" ON "proverbs" USING btree ("language","status","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "proverbs_language_normtext_active_idx" ON "proverbs" USING btree ("language","normalized_text","is_deleted");--> statement-breakpoint
CREATE INDEX "sentence_components_parent_idx" ON "sentence_components" USING btree ("sentence_id","order_index");--> statement-breakpoint
CREATE INDEX "sentence_components_ref_idx" ON "sentence_components" USING btree ("type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sentences_lang_textnorm_active_uq" ON "sentences" USING btree ("language","text_normalized") WHERE "sentences"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "sentences_text_normalized_idx" ON "sentences" USING btree ("text_normalized");--> statement-breakpoint
CREATE INDEX "sentences_language_status_active_idx" ON "sentences" USING btree ("language","status","is_deleted");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_profiles_user_uq" ON "tutor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tutor_profiles_active_idx" ON "tutor_profiles" USING btree ("is_active","created_at");--> statement-breakpoint
CREATE INDEX "tutor_profiles_language_active_idx" ON "tutor_profiles" USING btree ("language","is_active","created_at");--> statement-breakpoint
CREATE INDEX "unit_content_items_unit_order_idx" ON "unit_content_items" USING btree ("unit_id","order_index","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_content_items_unique" ON "unit_content_items" USING btree ("unit_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "units_chapter_active_order_idx" ON "units" USING btree ("chapter_id","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "units_language_active_order_idx" ON "units" USING btree ("language","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE INDEX "units_language_id_active_order_idx" ON "units" USING btree ("language_id","is_deleted","order_index","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_roles_gin" ON "users" USING gin ("roles");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_artist_profiles_user_uq" ON "voice_artist_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_artist_profiles_language_active_idx" ON "voice_artist_profiles" USING btree ("language","is_active","created_at");--> statement-breakpoint
CREATE INDEX "voice_audio_submissions_status_idx" ON "voice_audio_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "voice_audio_submissions_artist_status_idx" ON "voice_audio_submissions" USING btree ("voice_artist_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "voice_audio_submissions_content_status_idx" ON "voice_audio_submissions" USING btree ("content_type","content_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "words_lang_textnorm_active_uq" ON "words" USING btree ("language","text_normalized") WHERE "words"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "words_text_normalized_idx" ON "words" USING btree ("text_normalized");--> statement-breakpoint
CREATE INDEX "words_language_status_active_idx" ON "words" USING btree ("language","status","is_deleted");