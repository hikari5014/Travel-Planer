-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "llmProviders" TEXT NOT NULL DEFAULT '[]',
    "defaultProviderId" TEXT,
    "defaultModel" TEXT,
    "mapProvider" TEXT NOT NULL DEFAULT 'osm',
    "googleMapsApiKeyEnc" TEXT,
    "mapboxApiKeyEnc" TEXT,
    "defaultStayMinutesByType" TEXT NOT NULL DEFAULT '{}',
    "defaultFuelPricePerLiter" REAL NOT NULL DEFAULT 35.0,
    "defaultFuelEfficiencyKmPerL" REAL NOT NULL DEFAULT 15.0,
    "baseCurrency" TEXT NOT NULL DEFAULT 'TWD',
    "localCurrency" TEXT NOT NULL DEFAULT 'JPY',
    "fxRates" TEXT DEFAULT '{"TWD":1,"JPY":4.76,"USD":0.031}',
    "fxFetchedAt" DATETIME,
    "monthlyBudgetUsd" REAL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("baseCurrency", "defaultFuelEfficiencyKmPerL", "defaultFuelPricePerLiter", "defaultModel", "defaultProviderId", "defaultStayMinutesByType", "fxFetchedAt", "fxRates", "googleMapsApiKeyEnc", "id", "llmProviders", "localCurrency", "monthlyBudgetUsd", "updatedAt") SELECT "baseCurrency", "defaultFuelEfficiencyKmPerL", "defaultFuelPricePerLiter", "defaultModel", "defaultProviderId", "defaultStayMinutesByType", "fxFetchedAt", "fxRates", "googleMapsApiKeyEnc", "id", "llmProviders", "localCurrency", "monthlyBudgetUsd", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE TABLE "new_Transport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromScheduleItemId" TEXT NOT NULL,
    "toScheduleItemId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "distanceMeters" INTEGER,
    "durationSec" INTEGER,
    "polyline" TEXT,
    "parkingPlaceId" TEXT,
    "estimatedCost" REAL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "transitLine" TEXT,
    "transitDetailsJson" TEXT,
    "originLabel" TEXT,
    "destinationLabel" TEXT,
    "aiGeneratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transport_fromScheduleItemId_fkey" FOREIGN KEY ("fromScheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transport_toScheduleItemId_fkey" FOREIGN KEY ("toScheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transport_parkingPlaceId_fkey" FOREIGN KEY ("parkingPlaceId") REFERENCES "Place" ("googlePlaceId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transport" ("createdAt", "distanceMeters", "durationSec", "estimatedCost", "fromScheduleItemId", "id", "mode", "parkingPlaceId", "polyline", "toScheduleItemId", "updatedAt") SELECT "createdAt", "distanceMeters", "durationSec", "estimatedCost", "fromScheduleItemId", "id", "mode", "parkingPlaceId", "polyline", "toScheduleItemId", "updatedAt" FROM "Transport";
DROP TABLE "Transport";
ALTER TABLE "new_Transport" RENAME TO "Transport";
CREATE UNIQUE INDEX "Transport_fromScheduleItemId_key" ON "Transport"("fromScheduleItemId");
CREATE UNIQUE INDEX "Transport_toScheduleItemId_key" ON "Transport"("toScheduleItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
