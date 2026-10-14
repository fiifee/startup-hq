-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "agendaItemId" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "meetingId" TEXT,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TaskComment_agendaItemId_key" ON "TaskComment"("agendaItemId");

-- CreateIndex
CREATE INDEX "TaskComment_meetingId_idx" ON "TaskComment"("meetingId");

-- CreateIndex
CREATE INDEX "TaskComment_eventId_idx" ON "TaskComment"("eventId");

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

