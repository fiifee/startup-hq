-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Tallinn';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Tallinn';
