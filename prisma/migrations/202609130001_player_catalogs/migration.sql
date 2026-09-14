-- AlterTable
ALTER TABLE "Player" ADD COLUMN "birthDate" TEXT;

-- CreateTable
CREATE TABLE "DynastyGmPlayer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT,
    "birthDate" TEXT,
    "draftYear" INTEGER,
    "status" TEXT,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "playerId" INTEGER,
    "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',
    "matchMethod" TEXT,
    "matchNote" TEXT NOT NULL DEFAULT '',
    "matchedAt" DATETIME,
    CONSTRAINT "DynastyGmPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DtcPlayer" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT,
    "age" REAL,
    "ageObservedAt" DATETIME,
    "rank" INTEGER,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "playerId" INTEGER,
    "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',
    "matchMethod" TEXT,
    "matchNote" TEXT NOT NULL DEFAULT '',
    "matchedAt" DATETIME,
    CONSTRAINT "DtcPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DynastyGmPlayer_playerId_key" ON "DynastyGmPlayer"("playerId");

-- CreateIndex
CREATE INDEX "DynastyGmPlayer_matchStatus_idx" ON "DynastyGmPlayer"("matchStatus");

-- CreateIndex
CREATE INDEX "DynastyGmPlayer_position_lastName_idx" ON "DynastyGmPlayer"("position", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "DtcPlayer_playerId_key" ON "DtcPlayer"("playerId");

-- CreateIndex
CREATE INDEX "DtcPlayer_matchStatus_idx" ON "DtcPlayer"("matchStatus");
