-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('ROLE', 'MEMBER');

-- CreateEnum
CREATE TYPE "PermType" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "mod_permissions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" "TargetType" NOT NULL,
    "action" TEXT NOT NULL,
    "type" "PermType" NOT NULL,
    CONSTRAINT "mod_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mod_permissions_guild_id_target_id_action_key" ON "mod_permissions"("guild_id", "target_id", "action");

-- CreateIndex
CREATE INDEX "mod_permissions_guild_id_idx" ON "mod_permissions"("guild_id");
