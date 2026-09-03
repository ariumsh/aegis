CREATE TABLE "bot_commanders" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    CONSTRAINT "bot_commanders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bot_commander_guild_target_unique" ON "bot_commanders"("guild_id", "target_id");
CREATE INDEX "bot_commanders_guild_id_idx" ON "bot_commanders"("guild_id");
