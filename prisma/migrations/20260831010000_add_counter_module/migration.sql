-- Counter module: publishes a live member-count message and keeps it updated.

-- AlterTable
ALTER TABLE "guild_configs"
    ADD COLUMN "counter_module"     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "counter_channel_id" TEXT,
    ADD COLUMN "counter_message_id" TEXT;
