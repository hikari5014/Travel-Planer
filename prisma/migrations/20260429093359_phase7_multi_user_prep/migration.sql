-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'default-user',
    "service" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCostUsd" REAL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);
INSERT INTO "new_ApiUsageLog" ("completionTokens", "estimatedCostUsd", "id", "metadata", "model", "occurredAt", "promptTokens", "providerId", "service") SELECT "completionTokens", "estimatedCostUsd", "id", "metadata", "model", "occurredAt", "promptTokens", "providerId", "service" FROM "ApiUsageLog";
DROP TABLE "ApiUsageLog";
ALTER TABLE "new_ApiUsageLog" RENAME TO "ApiUsageLog";
CREATE INDEX "ApiUsageLog_service_occurredAt_idx" ON "ApiUsageLog"("service", "occurredAt");
CREATE INDEX "ApiUsageLog_userId_occurredAt_idx" ON "ApiUsageLog"("userId", "occurredAt");
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default-user',
    "llmProviders" TEXT NOT NULL DEFAULT '[]',
    "defaultProviderId" TEXT,
    "defaultModel" TEXT,
    "mapProvider" TEXT NOT NULL DEFAULT 'osm',
    "googleMapsApiKeyEnc" TEXT,
    "googleMapId" TEXT,
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
INSERT INTO "new_Settings" ("baseCurrency", "defaultFuelEfficiencyKmPerL", "defaultFuelPricePerLiter", "defaultModel", "defaultProviderId", "defaultStayMinutesByType", "fxFetchedAt", "fxRates", "googleMapId", "googleMapsApiKeyEnc", "id", "llmProviders", "localCurrency", "mapProvider", "mapboxApiKeyEnc", "monthlyBudgetUsd", "updatedAt") SELECT "baseCurrency", "defaultFuelEfficiencyKmPerL", "defaultFuelPricePerLiter", "defaultModel", "defaultProviderId", "defaultStayMinutesByType", "fxFetchedAt", "fxRates", "googleMapId", "googleMapsApiKeyEnc", "id", "llmProviders", "localCurrency", "mapProvider", "mapboxApiKeyEnc", "monthlyBudgetUsd", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'default-user',
    "title" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'TWD',
    "defaultPlanId" TEXT,
    "destination" TEXT,
    "subtitle" TEXT,
    "coverColor" TEXT NOT NULL DEFAULT 'from-gray-400 to-gray-600',
    "coverIconKey" TEXT NOT NULL DEFAULT 'landmark',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Trip" ("baseCurrency", "coverColor", "coverIconKey", "createdAt", "defaultPlanId", "destination", "endDate", "id", "startDate", "status", "subtitle", "title", "updatedAt") SELECT "baseCurrency", "coverColor", "coverIconKey", "createdAt", "defaultPlanId", "destination", "endDate", "id", "startDate", "status", "subtitle", "title", "updatedAt" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
