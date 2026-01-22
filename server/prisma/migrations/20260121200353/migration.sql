-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "genre" TEXT NOT NULL,
    "cover_url" TEXT
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "track_id" TEXT NOT NULL,
    "position" REAL NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "added_by" TEXT NOT NULL,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_playing" BOOLEAN NOT NULL DEFAULT false,
    "played_at" DATETIME,
    CONSTRAINT "PlaylistTrack_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_track_id_key" ON "PlaylistTrack"("track_id");

-- CreateIndex
CREATE INDEX "PlaylistTrack_position_idx" ON "PlaylistTrack"("position");

-- CreateIndex
CREATE INDEX "PlaylistTrack_is_playing_idx" ON "PlaylistTrack"("is_playing");
