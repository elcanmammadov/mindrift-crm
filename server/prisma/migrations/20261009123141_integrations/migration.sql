-- CreateTable
CREATE TABLE "Integration" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "lastEventAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromName" TEXT,
    "text" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "suggestedCaseId" TEXT,
    "caseId" TEXT,
    "sourceId" TEXT,
    "handledById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "InboundMessage_status_idx" ON "InboundMessage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_provider_externalId_key" ON "InboundMessage"("provider", "externalId");
