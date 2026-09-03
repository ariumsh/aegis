-- Fix bot_commanders.target_type: cast existing TEXT values to TargetType enum (enum already exists from mod_permissions migration)
ALTER TABLE "bot_commanders" ALTER COLUMN "target_type" TYPE "TargetType" USING "target_type"::"TargetType";

-- AlterTable
ALTER TABLE "guild_configs" ADD COLUMN     "clan_tag_channel_created_by_bot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clan_tag_channel_id" TEXT,
ADD COLUMN     "clan_tag_module" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clan_tag_role_created_by_bot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clan_tag_role_id" TEXT,
ADD COLUMN     "clan_tag_string" TEXT;

-- RenameIndex
ALTER INDEX "bot_commander_guild_target_unique" RENAME TO "bot_commanders_guild_id_target_id_key";
