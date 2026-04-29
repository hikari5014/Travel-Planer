-- AlterTable
ALTER TABLE "Transport" ADD COLUMN "departureAtIso" TEXT;
ALTER TABLE "Transport" ADD COLUMN "directionsCacheJson" TEXT;
ALTER TABLE "Transport" ADD COLUMN "directionsFetchedAt" DATETIME;
ALTER TABLE "Transport" ADD COLUMN "encodedPolyline" TEXT;
ALTER TABLE "Transport" ADD COLUMN "fareAmount" REAL;
ALTER TABLE "Transport" ADD COLUMN "fareCurrency" TEXT;
ALTER TABLE "Transport" ADD COLUMN "modesSummaryJson" TEXT;
ALTER TABLE "Transport" ADD COLUMN "trafficLevel" TEXT;
