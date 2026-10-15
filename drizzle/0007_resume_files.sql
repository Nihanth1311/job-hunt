CREATE TABLE "resume_files" (
	"resume_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"pdf" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_resume_id_resume_versions_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;