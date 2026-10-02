CREATE TABLE "application_events" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"track" text DEFAULT 'fullstack' NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"applied_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"source" text NOT NULL,
	"publisher" text,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salary_min_lpa" real,
	"salary_max_lpa" real,
	"salary_estimated" boolean DEFAULT false NOT NULL,
	"salary_bucket" text DEFAULT 'unknown' NOT NULL,
	"mentions_ctc" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"track" text DEFAULT 'fullstack' NOT NULL,
	"exp_min" integer,
	"exp_max" integer,
	"exp_fit" boolean DEFAULT true NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	CONSTRAINT "jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"track" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"job_id" text,
	"application_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_posted_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "jobs_seen_idx" ON "jobs" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "jobs_category_idx" ON "jobs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");