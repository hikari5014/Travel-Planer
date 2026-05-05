-- Phase 12g: flight buffer defaults customizable via /settings.
ALTER TABLE "Settings" ADD COLUMN "defaultFlightCheckInBufferMinIntl" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Settings" ADD COLUMN "defaultFlightCheckInBufferMinDomestic" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Settings" ADD COLUMN "defaultFlightImmigrationBufferMinIntl" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Settings" ADD COLUMN "defaultFlightImmigrationBufferMinDomestic" INTEGER NOT NULL DEFAULT 30;
