CREATE TABLE "analytics_ai_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"insights" jsonb NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_result_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"test_session_id" integer NOT NULL,
	"test_name" text NOT NULL,
	"total_questions" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_result_topic_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_result_id" integer NOT NULL,
	"lesson" text NOT NULL,
	"topic" text NOT NULL,
	"total_questions" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"legacy_claimed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawings" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"canvas_data" text DEFAULT '[]' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drawings_question_id_unique" UNIQUE("question_id")
);
--> statement-breakpoint
CREATE TABLE "question_review_stats" (
	"question_id" integer PRIMARY KEY NOT NULL,
	"total_served" integer DEFAULT 0 NOT NULL,
	"total_reviewed" integer DEFAULT 0 NOT NULL,
	"correct_review_count" integer DEFAULT 0 NOT NULL,
	"wrong_review_count" integer DEFAULT 0 NOT NULL,
	"repetition_stage" integer DEFAULT 0 NOT NULL,
	"last_served_at" timestamp,
	"last_reviewed_at" timestamp,
	"next_eligible_at" timestamp,
	"last_outcome" text,
	"last_test_session_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"resource_id" integer,
	"image_url" text,
	"description" text,
	"lesson" text NOT NULL,
	"topic" text,
	"publisher" text,
	"test_name" text,
	"test_no" text,
	"options" jsonb,
	"choice" text,
	"solution_url" text,
	"solution_youtube_url" text,
	"solution_youtube_start_second" integer,
	"solution_youtube_end_second" integer,
	"category" text DEFAULT 'TYT' NOT NULL,
	"source" text DEFAULT 'Banka' NOT NULL,
	"status" text DEFAULT 'Cozulmedi' NOT NULL,
	"has_drawing" boolean DEFAULT false NOT NULL,
	"is_osym_badge" boolean DEFAULT false NOT NULL,
	"is_premium_badge" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_session_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_session_id" integer NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"timer" integer,
	"elapsed" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"inline_draw_enabled" boolean DEFAULT false NOT NULL,
	"collapsed_lessons" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_session_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_session_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"time_limit_seconds" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_solutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_session_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"user_answer" text,
	"status" text DEFAULT 'Cozulmedi' NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"canvas_data" text,
	"inline_drawings" json,
	"temp_drawing" text,
	"current_index" integer,
	"timer" integer,
	"elapsed" integer,
	"inline_draw_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_review_stats" (
	"note_id" text PRIMARY KEY NOT NULL,
	"total_served" integer DEFAULT 0 NOT NULL,
	"repetition_stage" integer DEFAULT 0 NOT NULL,
	"last_served_at" timestamp,
	"next_eligible_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer,
	"resource_id" integer,
	"category" text DEFAULT 'TYT' NOT NULL,
	"lesson" text NOT NULL,
	"title" text DEFAULT 'Yeni Not' NOT NULL,
	"topic" text,
	"note_type" text DEFAULT 'text' NOT NULL,
	"description" text,
	"drawing_data" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"publisher" text,
	"category" text DEFAULT 'TYT' NOT NULL,
	"lesson" text,
	"topic" text,
	"resource_type" text DEFAULT 'Soru Bankası' NOT NULL,
	"target_question_count" integer DEFAULT 0,
	"cover_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_exams" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"exam_type" text DEFAULT 'Genel' NOT NULL,
	"category" text DEFAULT 'TYT' NOT NULL,
	"resource_id" integer,
	"lesson" text,
	"topic" text,
	"publisher" text,
	"exam_date" timestamp DEFAULT now() NOT NULL,
	"exam_no" integer,
	"target_question_count" integer,
	"duration_minutes" integer,
	"total_net" real DEFAULT 0 NOT NULL,
	"details" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_schedule_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"slot_key" text NOT NULL,
	"category" text,
	"lesson" text NOT NULL,
	"topic" text,
	"activity_type" text NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"slot_key" text NOT NULL,
	"day" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"category" text,
	"lesson" text NOT NULL,
	"topic" text,
	"activity_type" text NOT NULL,
	"resource_id" integer,
	"resource_name" text,
	"target_questions" integer,
	"exam_no" integer,
	"notes" text,
	"color" text DEFAULT 'indigo' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"practice_exam_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_ai_insights" ADD CONSTRAINT "analytics_ai_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_result_summaries" ADD CONSTRAINT "test_result_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_result_topic_stats" ADD CONSTRAINT "test_result_topic_stats_test_result_id_test_result_summaries_id_fk" FOREIGN KEY ("test_result_id") REFERENCES "public"."test_result_summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_review_stats" ADD CONSTRAINT "question_review_stats_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_session_progress" ADD CONSTRAINT "test_session_progress_test_session_id_test_sessions_id_fk" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_session_questions" ADD CONSTRAINT "test_session_questions_test_session_id_test_sessions_id_fk" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_session_questions" ADD CONSTRAINT "test_session_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_solutions" ADD CONSTRAINT "test_solutions_test_session_id_test_sessions_id_fk" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_solutions" ADD CONSTRAINT "test_solutions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_review_stats" ADD CONSTRAINT "note_review_stats_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_exams" ADD CONSTRAINT "practice_exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_exams" ADD CONSTRAINT "practice_exams_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_schedule_completions" ADD CONSTRAINT "study_schedule_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_slots" ADD CONSTRAINT "study_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_ai_insights_user_id_uq" ON "analytics_ai_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_ai_insights_requested_at_idx" ON "analytics_ai_insights" USING btree ("requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_result_summaries_test_session_id_uq" ON "test_result_summaries" USING btree ("test_session_id");--> statement-breakpoint
CREATE INDEX "test_result_summaries_user_id_idx" ON "test_result_summaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_result_summaries_completed_at_idx" ON "test_result_summaries" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "test_result_topic_stats_result_id_idx" ON "test_result_topic_stats" USING btree ("test_result_id");--> statement-breakpoint
CREATE INDEX "test_result_topic_stats_lesson_topic_idx" ON "test_result_topic_stats" USING btree ("lesson","topic");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uq" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "question_review_stats_next_eligible_idx" ON "question_review_stats" USING btree ("next_eligible_at");--> statement-breakpoint
CREATE INDEX "question_review_stats_updated_at_idx" ON "question_review_stats" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "question_review_stats_last_outcome_idx" ON "question_review_stats" USING btree ("last_outcome");--> statement-breakpoint
CREATE INDEX "questions_user_id_idx" ON "questions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "questions_resource_id_idx" ON "questions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "questions_category_idx" ON "questions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "questions_lesson_idx" ON "questions" USING btree ("lesson");--> statement-breakpoint
CREATE INDEX "questions_topic_idx" ON "questions" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "questions_source_idx" ON "questions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "questions_created_at_idx" ON "questions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "questions_updated_at_idx" ON "questions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "questions_badge_flags_idx" ON "questions" USING btree ("is_osym_badge","is_premium_badge");--> statement-breakpoint
CREATE INDEX "test_session_progress_session_id_idx" ON "test_session_progress" USING btree ("test_session_id");--> statement-breakpoint
CREATE INDEX "test_session_questions_session_id_idx" ON "test_session_questions" USING btree ("test_session_id");--> statement-breakpoint
CREATE INDEX "test_session_questions_question_id_idx" ON "test_session_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "test_sessions_user_id_idx" ON "test_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_solutions_session_id_idx" ON "test_solutions" USING btree ("test_session_id");--> statement-breakpoint
CREATE INDEX "test_solutions_question_id_idx" ON "test_solutions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "note_review_stats_next_eligible_idx" ON "note_review_stats" USING btree ("next_eligible_at");--> statement-breakpoint
CREATE INDEX "note_review_stats_updated_at_idx" ON "note_review_stats" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_resource_id_idx" ON "notes" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "notes_category_idx" ON "notes" USING btree ("category");--> statement-breakpoint
CREATE INDEX "notes_lesson_idx" ON "notes" USING btree ("lesson");--> statement-breakpoint
CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "notes_pinned_updated_at_idx" ON "notes" USING btree ("pinned","updated_at");--> statement-breakpoint
CREATE INDEX "resources_user_id_idx" ON "resources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resources_category_idx" ON "resources" USING btree ("category");--> statement-breakpoint
CREATE INDEX "resources_lesson_idx" ON "resources" USING btree ("lesson");--> statement-breakpoint
CREATE INDEX "resources_resource_type_idx" ON "resources" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "resources_updated_at_idx" ON "resources" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "practice_exams_user_id_idx" ON "practice_exams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "practice_exams_category_idx" ON "practice_exams" USING btree ("category");--> statement-breakpoint
CREATE INDEX "practice_exams_exam_date_idx" ON "practice_exams" USING btree ("exam_date");--> statement-breakpoint
CREATE INDEX "study_schedule_completions_user_id_idx" ON "study_schedule_completions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_schedule_completions_user_slot_uq" ON "study_schedule_completions" USING btree ("user_id","slot_key");--> statement-breakpoint
CREATE INDEX "study_slots_user_id_idx" ON "study_slots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_slots_slot_key_idx" ON "study_slots" USING btree ("user_id","slot_key");--> statement-breakpoint
CREATE INDEX "study_slots_day_idx" ON "study_slots" USING btree ("user_id","day");