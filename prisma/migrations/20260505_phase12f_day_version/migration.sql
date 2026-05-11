-- Phase 12f: optimistic concurrency version on Day for batched week-view edits.
ALTER TABLE "Day" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
