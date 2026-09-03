-- CreateTable
CREATE TABLE "guild_configs" (
    "guild_id" TEXT NOT NULL,
    "vanity_string" TEXT,
    "vanity_role_id" TEXT,
    "vanity_channel_id" TEXT,
    "vanity_log_channel" TEXT,
    "vanity_module" BOOLEAN NOT NULL DEFAULT false,
    "vanity_channel_created_by_bot" BOOLEAN NOT NULL DEFAULT false,
    "vanity_role_created_by_bot" BOOLEAN NOT NULL DEFAULT false,
    "mod_log_channel_id" TEXT,
    "mod_module" BOOLEAN NOT NULL DEFAULT false,
    "mod_thresholds_enabled" BOOLEAN NOT NULL DEFAULT false,
    "muted_role_id" TEXT,
    "mute_threshold" INTEGER NOT NULL DEFAULT 3,
    "ban_threshold" INTEGER NOT NULL DEFAULT 5,
    "mod_channel_created_by_bot" BOOLEAN NOT NULL DEFAULT false,
    "mod_role_created_by_bot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_configs_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "silent_bans" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "silent_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warn_logs" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warn_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mod_logs" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "duration" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mod_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_mutes" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "active_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "silent_bans_guild_id_user_id_idx" ON "silent_bans"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "silent_bans_guild_id_user_id_key" ON "silent_bans"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "warn_guild_user" ON "warn_logs"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "modlog_guild_user" ON "mod_logs"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "active_mutes_guild_id_user_id_idx" ON "active_mutes"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "active_mutes_guild_id_user_id_key" ON "active_mutes"("guild_id", "user_id");
