-- Phase 14m — Place enrichment fields surfaced from trip-import + future
-- Google Places enrichment pass.
ALTER TABLE "Place"
  ADD COLUMN "summary"    TEXT,
  ADD COLUMN "phone"      TEXT,
  ADD COLUMN "website"    TEXT,
  ADD COLUMN "priceLevel" INTEGER,
  ADD COLUMN "tags"       TEXT;
