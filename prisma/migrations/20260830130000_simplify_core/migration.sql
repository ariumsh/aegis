-- Elimina el sistema de AutoMod y el módulo Clan Tag.

-- DropTable
DROP TABLE IF EXISTS "automod_rules";

-- DropTable
DROP TABLE IF EXISTS "automod_presets";

-- AlterTable
ALTER TABLE "guild_configs"
    DROP COLUMN IF EXISTS "automod_module",
    DROP COLUMN IF EXISTS "clan_tag_module",
    DROP COLUMN IF EXISTS "clan_tag_string",
    DROP COLUMN IF EXISTS "clan_tag_role_id",
    DROP COLUMN IF EXISTS "clan_tag_channel_id",
    DROP COLUMN IF EXISTS "clan_tag_channel_created_by_bot",
    DROP COLUMN IF EXISTS "clan_tag_role_created_by_bot";
