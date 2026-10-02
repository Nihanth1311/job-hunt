ALTER TABLE "jobs" ADD COLUMN "company_url" text;--> statement-breakpoint
UPDATE "jobs" SET "company_url" = "url" WHERE "source" IN ('greenhouse', 'lever', 'ashby') AND "url" <> '';
