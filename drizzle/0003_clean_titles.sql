-- Strip posters' tags like "[DT] :" from the start of job titles.
UPDATE "jobs" SET "title" = btrim(regexp_replace("title", '^\s*\[[^]]{1,12}\]\s*[:|–-]?\s*', '')) WHERE "title" ~ '^\s*\[[^]]{1,12}\]';
