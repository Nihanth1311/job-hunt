ALTER TABLE "jobs" ADD COLUMN "description_is_preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "description_is_preview" = true WHERE "source" = 'adzuna';
