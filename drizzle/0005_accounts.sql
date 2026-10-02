CREATE TABLE "invites" (
	"email" text PRIMARY KEY NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_jobs" (
	"source_key" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"data" jsonb NOT NULL,
	"posted_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_secrets" (
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_secrets_user_id_name_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_dedupe_key_unique";--> statement-breakpoint
-- Everything that existed before accounts belongs to the first admin, whose id is "owner".
ALTER TABLE "jobs" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "fetch_runs" ADD COLUMN "user_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "fetch_runs" SET "user_id" = 'owner' WHERE "source" <> 'companies';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
-- App-wide state (company site health) is shared: user_id "".
UPDATE "settings" SET "user_id" = '' WHERE "key" = 'state:companyHealth';--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_secrets" ADD CONSTRAINT "user_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raw_jobs_posted_idx" ON "raw_jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "applications_user_idx" ON "applications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_dedupe_idx" ON "jobs" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_user_idx" ON "jobs" USING btree ("user_id");
