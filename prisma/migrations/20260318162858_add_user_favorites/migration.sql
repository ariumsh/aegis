-- CreateTable
CREATE TABLE "user_favorites" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "track_title" TEXT NOT NULL,
    "track_url" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_favorites_user_id_idx" ON "user_favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorites_user_id_track_url_key" ON "user_favorites"("user_id", "track_url");
