-- Moderation performance indexes
-- 1) Fast lookup for /case and /remove-case by guild + case number
CREATE INDEX IF NOT EXISTS "modlog_guild_case_lookup"
ON "mod_logs" ("guild_id", "case_number");

-- 2) Fast counting for threshold checks (filtered by guild/user/automatic/action/date)
CREATE INDEX IF NOT EXISTS "modlog_threshold_lookup"
ON "mod_logs" ("guild_id", "user_id", "is_automatic", "action", "created_at");
