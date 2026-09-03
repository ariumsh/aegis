-- AlterTable
ALTER TABLE "active_mutes" ADD COLUMN     "case_number" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "guild_configs" ADD COLUMN     "case_count" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "locale" SET DEFAULT 'en-US';

-- AlterTable
ALTER TABLE "mod_logs" ADD COLUMN     "case_number" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "silent_bans" ADD COLUMN     "case_number" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "warn_logs" ADD COLUMN     "case_number" INTEGER NOT NULL DEFAULT 0;
