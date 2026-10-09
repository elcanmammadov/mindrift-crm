-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "initialRequest" TEXT NOT NULL,
    "coreNeed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "salesOutcome" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "sourcesRevision" INTEGER NOT NULL DEFAULT 0,
    "analyzedRevision" INTEGER,
    "closedAt" DATETIME,
    "closeReason" TEXT,
    "closedManually" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorSide" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "packageRef" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Source_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "editedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceRevision_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "SourceChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "modules" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "sourceSnapshot" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "stats" TEXT NOT NULL DEFAULT '{}',
    "triggeredById" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "AnalysisRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "runId" TEXT,
    "module" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "epistemic" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "origin" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "translations" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Finding_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "chunkId" TEXT,
    "quote" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "verified" BOOLEAN NOT NULL,
    "label" TEXT,
    CONSTRAINT "Evidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "epistemic" TEXT NOT NULL,
    "findingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Requirement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commitment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Blocker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "nextStep" TEXT,
    "dueDate" DATETIME,
    "resolutionCriteria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourceId" TEXT,
    "evidenceQuote" TEXT,
    "findingId" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Blocker_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Blocker_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "blockerId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "findingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Blocker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "packageJson" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    CONSTRAINT "Handover_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Handover_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Handover_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResolutionCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceRequired" TEXT NOT NULL,
    "requiresCustomerConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResolutionCriterion_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "tokenId" TEXT,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerConfirmation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerAccessToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAccessToken_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "relatedCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "explanation" TEXT,
    "findingId" TEXT,
    "confirmedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseRelation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaseRelation_relatedCaseId_fkey" FOREIGN KEY ("relatedCaseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LossAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "agentReason" TEXT NOT NULL,
    "agentNote" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LossAnalysis_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExitConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "caseId" TEXT,
    "tokenId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "messages" TEXT NOT NULL DEFAULT '[]',
    "statedReasons" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "summaryOrigin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ExitConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "exitConversationId" TEXT,
    "wantsUpdates" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactConsent_exitConversationId_fkey" FOREIGN KEY ("exitConversationId") REFERENCES "ExitConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "customerId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "CustomerCase_customerId_idx" ON "CustomerCase"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCase_ownerId_idx" ON "CustomerCase"("ownerId");

-- CreateIndex
CREATE INDEX "Source_caseId_idx" ON "Source"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRevision_sourceId_version_key" ON "SourceRevision"("sourceId", "version");

-- CreateIndex
CREATE INDEX "SourceChunk_sourceId_version_idx" ON "SourceChunk"("sourceId", "version");

-- CreateIndex
CREATE INDEX "AnalysisRun_caseId_idx" ON "AnalysisRun"("caseId");

-- CreateIndex
CREATE INDEX "Finding_caseId_module_idx" ON "Finding"("caseId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_caseId_fingerprint_key" ON "Finding"("caseId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Blocker_findingId_key" ON "Blocker"("findingId");

-- CreateIndex
CREATE INDEX "Blocker_caseId_idx" ON "Blocker"("caseId");

-- CreateIndex
CREATE INDEX "Task_caseId_idx" ON "Task"("caseId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Handover_caseId_idx" ON "Handover"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccessToken_tokenHash_key" ON "CustomerAccessToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CaseRelation_caseId_relatedCaseId_key" ON "CaseRelation"("caseId", "relatedCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "LossAnalysis_caseId_key" ON "LossAnalysis"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExitConversation_tokenId_key" ON "ExitConversation"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConsent_exitConversationId_key" ON "ContactConsent"("exitConversationId");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_idx" ON "AuditEvent"("caseId");
