-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "originMovementId" TEXT;
ALTER TABLE "Holding" ADD COLUMN "exitMovementId" TEXT;
ALTER TABLE "Holding" ADD COLUMN "reviewReason" TEXT;

-- CreateTable
CREATE TABLE "RosterSyncState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "rosterId" INTEGER,
    "playerIdsJson" TEXT NOT NULL DEFAULT '[]',
    "trackingStartedAt" DATETIME NOT NULL,
    "initializedAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "lastWeek" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "message" TEXT NOT NULL DEFAULT 'No Sleeper roster check yet.',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RosterMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rosterSyncStateId" TEXT NOT NULL,
    "sleeperTransactionId" TEXT,
    "sleeperPlayerId" TEXT NOT NULL,
    "playerId" INTEGER,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "RosterMovement_rosterSyncStateId_fkey" FOREIGN KEY ("rosterSyncStateId") REFERENCES "RosterSyncState" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterMovement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovementResolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movementId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "holdingId" TEXT,
    "suggestedValue" REAL,
    "suggestedCapturedAt" DATETIME,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "MovementResolution_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "RosterMovement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Holding_originMovementId_sourceName_contextKey_key" ON "Holding"("originMovementId", "sourceName", "contextKey");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSyncState_leagueId_ownerId_key" ON "RosterSyncState"("leagueId", "ownerId");

-- CreateIndex
CREATE INDEX "RosterMovement_rosterSyncStateId_occurredAt_idx" ON "RosterMovement"("rosterSyncStateId", "occurredAt");

-- CreateIndex
CREATE INDEX "RosterMovement_sleeperPlayerId_occurredAt_idx" ON "RosterMovement"("sleeperPlayerId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MovementResolution_movementId_targetKey_key" ON "MovementResolution"("movementId", "targetKey");

-- CreateIndex
CREATE INDEX "MovementResolution_status_createdAt_idx" ON "MovementResolution"("status", "createdAt");
