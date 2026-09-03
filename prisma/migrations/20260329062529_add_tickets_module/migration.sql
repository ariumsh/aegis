-- AlterTable
ALTER TABLE "guild_configs" ADD COLUMN     "tickets_category_id" TEXT,
ADD COLUMN     "tickets_log_channel_id" TEXT,
ADD COLUMN     "tickets_module" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tickets_panel_channel_id" TEXT,
ADD COLUMN     "tickets_panel_message_id" TEXT,
ADD COLUMN     "tickets_supporter_role_ids" TEXT[],
ADD COLUMN     "tickets_transcript_channel_id" TEXT;

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "claimed_by_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "auto_close_job_id" TEXT,
    "ticket_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_channel_id_key" ON "tickets"("channel_id");

-- CreateIndex
CREATE INDEX "tickets_guild_id_user_id_idx" ON "tickets"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "tickets_guild_id_status_idx" ON "tickets"("guild_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_guild_id_ticket_number_key" ON "tickets"("guild_id", "ticket_number");
