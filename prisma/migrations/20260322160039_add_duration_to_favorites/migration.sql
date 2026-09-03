/*
  Warnings:

  - Added the required column `track_duration` to the `user_favorites` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user_favorites" ADD COLUMN     "track_duration" TEXT NOT NULL;
