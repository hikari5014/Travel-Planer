-- Phase 12c: LLM-grounded driving segment breakdown + fuel/toll/rest-area estimate.
ALTER TABLE "Transport" ADD COLUMN "drivingSegmentsJson" TEXT;
