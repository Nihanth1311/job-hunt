ALTER TABLE "jobs" ADD COLUMN "required_exp_months" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "fit" text DEFAULT 'check' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "fit_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_fit_idx" ON "jobs" USING btree ("fit");