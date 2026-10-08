-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "textAgent" TEXT,
ADD COLUMN     "textById" TEXT;

-- Existing decisions: the wording is by whoever recorded them.
UPDATE "Decision" SET "textById" = "createdById", "textAgent" = "createdAgent";
