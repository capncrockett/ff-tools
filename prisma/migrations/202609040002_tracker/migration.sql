-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" INTEGER NOT NULL,
    "contextKey" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    CONSTRAINT "Snapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "portfolio" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL,
    "costBasis" REAL NOT NULL,
    "targetRoi" REAL NOT NULL DEFAULT 20,
    "notes" TEXT NOT NULL DEFAULT '',
    "closedAt" DATETIME,
    "proceeds" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holding_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "saved" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Valuation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerId" INTEGER NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'index',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotId" TEXT,
    "contextKey" TEXT NOT NULL DEFAULT 'legacy-unverified',
    "sourceKey" TEXT,
    CONSTRAINT "Valuation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Valuation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Valuation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Valuation" ("capturedAt", "id", "playerId", "sourceId", "unit", "value") SELECT "capturedAt", "id", "playerId", "sourceId", "unit", "value" FROM "Valuation";
DROP TABLE "Valuation";
ALTER TABLE "new_Valuation" RENAME TO "Valuation";
CREATE INDEX "Valuation_playerId_sourceId_contextKey_capturedAt_idx" ON "Valuation"("playerId", "sourceId", "contextKey", "capturedAt");
CREATE UNIQUE INDEX "Valuation_snapshotId_playerId_key" ON "Valuation"("snapshotId", "playerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Snapshot_sourceId_contextKey_capturedAt_idx" ON "Snapshot"("sourceId", "contextKey", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_sourceId_contextKey_capturedAt_key" ON "Snapshot"("sourceId", "contextKey", "capturedAt");

-- CreateIndex
CREATE INDEX "Holding_playerId_sourceName_contextKey_idx" ON "Holding"("playerId", "sourceName", "contextKey");

-- CreateIndex
CREATE INDEX "SyncRun_sourceName_startedAt_idx" ON "SyncRun"("sourceName", "startedAt");
