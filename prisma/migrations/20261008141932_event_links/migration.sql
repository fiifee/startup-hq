-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "links" JSONB NOT NULL DEFAULT '[]';

-- Fold the old single link into the list.
UPDATE "Event" SET "links" = jsonb_build_array(jsonb_build_object('label', 'Link', 'url', "url")) WHERE "url" <> '';
