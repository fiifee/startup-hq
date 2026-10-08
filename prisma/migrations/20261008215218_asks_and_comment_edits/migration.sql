-- AlterTable
ALTER TABLE "EventNote" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT;

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT;

-- CreateTable
CREATE TABLE "Ask" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "fromId" TEXT,
    "fromAgent" TEXT,
    "toId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "answerKind" TEXT,
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredAt" TIMESTAMP(3),
    "draft" TEXT NOT NULL DEFAULT '',
    "draftAgent" TEXT,
    "seenByAsker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ask_number_key" ON "Ask"("number");

-- CreateIndex
CREATE INDEX "Ask_toId_status_idx" ON "Ask"("toId", "status");

-- CreateIndex
CREATE INDEX "Ask_fromId_status_idx" ON "Ask"("fromId", "status");

-- CreateIndex
CREATE INDEX "Ask_entityType_entityId_idx" ON "Ask"("entityType", "entityId");
