-- AlterTable
ALTER TABLE "guild_configs" ADD COLUMN     "automod_module" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "threshold_mode" SET DEFAULT 'modular';

-- CreateTable
CREATE TABLE "automod_rules" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "content" TEXT[],
    "threshold" INTEGER,
    "duration" TEXT,
    "whitelist" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automod_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automod_presets" (
    "id" SERIAL NOT NULL,
    "level" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automod_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automod_rules_guild_id_idx" ON "automod_rules"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "automod_presets_level_language_topic_key" ON "automod_presets"("level", "language", "topic");
