-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "recommendWeightsJson" TEXT;
ALTER TABLE "Settings" ADD COLUMN "taxiRegionRatesJson" TEXT;

-- AlterTable
ALTER TABLE "Transport" ADD COLUMN "routeOptionsJson" TEXT;
ALTER TABLE "Transport" ADD COLUMN "selectedOptionId" TEXT;
ALTER TABLE "Transport" ADD COLUMN "taxiRateSnapshotJson" TEXT;
