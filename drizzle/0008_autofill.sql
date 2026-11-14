CREATE TABLE "autofill_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"resume_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"apply_url" text NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helper_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "autofill_runs" ADD CONSTRAINT "autofill_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autofill_runs" ADD CONSTRAINT "autofill_runs_resume_id_resume_versions_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_devices" ADD CONSTRAINT "helper_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autofill_runs_user_idx" ON "autofill_runs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "autofill_runs_job_idx" ON "autofill_runs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "helper_devices_token_idx" ON "helper_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "helper_devices_user_idx" ON "helper_devices" USING btree ("user_id");