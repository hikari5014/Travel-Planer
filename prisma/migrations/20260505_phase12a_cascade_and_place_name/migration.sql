-- Phase 12a: cascade engine state field + place-name editing fields.

-- Transport.isFree — segment with no concrete mode/duration yet (0-sec in cascade).
ALTER TABLE "Transport" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;

-- Place.userEditedName — optional user override for the display name.
ALTER TABLE "Place" ADD COLUMN "userEditedName" TEXT;

-- Place.originalName — canonical Google name. Three-step add to avoid
-- breaking existing rows: nullable first, backfill from `name`, then NOT NULL.
ALTER TABLE "Place" ADD COLUMN "originalName" TEXT;
UPDATE "Place" SET "originalName" = "name" WHERE "originalName" IS NULL;
ALTER TABLE "Place" ALTER COLUMN "originalName" SET NOT NULL;
