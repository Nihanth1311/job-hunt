-- Rename every resume as "<role type> · <company> · <job title>" (made for a job) or
-- "<role type> · Base" (base resumes), e.g. "FE · Stripe · Frontend Engineer", "BE · Base".
-- Same naming as resumeName() in src/shared/types.ts, which names new resumes.

-- Made for a job that still exists: role type, company, job title.
UPDATE "resume_versions" AS rv
SET "label" = (CASE rv."track" WHEN 'frontend' THEN 'FE' WHEN 'backend' THEN 'BE' WHEN 'fullstack' THEN 'FS' WHEN 'devops' THEN 'DevOps' WHEN 'data' THEN 'DS' WHEN 'security' THEN 'Sec' ELSE rv."track" END)
  || ' · ' || j."company" || ' · ' || left(j."title", 70)
FROM "jobs" AS j
WHERE rv."job_id" = j."id";
--> statement-breakpoint

-- Base resumes still called "Base" (or nothing): role type · Base.
UPDATE "resume_versions"
SET "label" = (CASE "track" WHEN 'frontend' THEN 'FE' WHEN 'backend' THEN 'BE' WHEN 'fullstack' THEN 'FS' WHEN 'devops' THEN 'DevOps' WHEN 'data' THEN 'DS' WHEN 'security' THEN 'Sec' ELSE "track" END) || ' · Base'
WHERE "job_id" IS NULL AND "label" IN ('Base', '');
--> statement-breakpoint

-- Everything else (a name you gave it, a job that's gone): role type in front of the name it has.
UPDATE "resume_versions"
SET "label" = (CASE "track" WHEN 'frontend' THEN 'FE' WHEN 'backend' THEN 'BE' WHEN 'fullstack' THEN 'FS' WHEN 'devops' THEN 'DevOps' WHEN 'data' THEN 'DS' WHEN 'security' THEN 'Sec' ELSE "track" END) || ' · ' || "label"
WHERE "job_id" IS NULL AND "label" NOT LIKE '% · %';
