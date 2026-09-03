-- AlterTable
ALTER TABLE "guild_configs" ADD COLUMN     "warn_expiration_days" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "mod_thresholds" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "warn_count" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "duration" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mod_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_tempbans" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "case_number" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_tempbans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mod_thresholds_guild_id_warn_count_key" ON "mod_thresholds"("guild_id", "warn_count");

-- CreateIndex
CREATE INDEX "active_tempbans_guild_id_user_id_idx" ON "active_tempbans"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "active_tempbans_guild_id_user_id_key" ON "active_tempbans"("guild_id", "user_id");
