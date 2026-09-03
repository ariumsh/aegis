/*
  Warnings:

  - You are about to drop the column `warn_count` on the `mod_thresholds` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[guild_id,trigger_type,threshold]` on the table `mod_thresholds` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `threshold` to the `mod_thresholds` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "mod_thresholds_guild_id_warn_count_key";

-- AlterTable
ALTER TABLE "guild_configs" ADD COLUMN     "prefix" TEXT NOT NULL DEFAULT 'c!';

-- AlterTable
ALTER TABLE "mod_logs" ADD COLUMN     "is_automatic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mod_thresholds" DROP COLUMN "warn_count",
ADD COLUMN     "threshold" INTEGER NOT NULL,
ADD COLUMN     "trigger_type" TEXT NOT NULL DEFAULT 'warn';

-- CreateIndex
CREATE UNIQUE INDEX "mod_thresholds_guild_id_trigger_type_threshold_key" ON "mod_thresholds"("guild_id", "trigger_type", "threshold");
