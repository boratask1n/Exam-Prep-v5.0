CREATE TABLE "question_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"lesson" varchar(255) NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"activity_type" varchar(50) DEFAULT 'Schedule' NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_activity_logs" ADD CONSTRAINT "question_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;