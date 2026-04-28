-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "forkedFromPlanId" TEXT,
    "pace" TEXT NOT NULL DEFAULT 'standard',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "Day_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "placeId" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "suggestedDurationMin" INTEGER,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "isTimeLocked" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "ScheduleItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("googlePlaceId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Place" (
    "googlePlaceId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "primaryType" TEXT,
    "types" TEXT,
    "rating" REAL,
    "ratingCount" INTEGER,
    "defaultStayMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultStaySource" TEXT NOT NULL DEFAULT 'HEURISTIC',
    "iconKey" TEXT NOT NULL DEFAULT 'landmark',
    "mapX" REAL,
    "mapY" REAL,
    "reviewSnippet" TEXT,
    "detailsExpireAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlacePhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googlePlaceId" TEXT NOT NULL,
    "photoReference" TEXT NOT NULL,
    "localCachePath" TEXT,
    "widthPx" INTEGER,
    CONSTRAINT "PlacePhoto_googlePlaceId_fkey" FOREIGN KEY ("googlePlaceId") REFERENCES "Place" ("googlePlaceId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromScheduleItemId" TEXT NOT NULL,
    "toScheduleItemId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "distanceMeters" INTEGER,
    "durationSec" INTEGER,
    "polyline" TEXT,
    "parkingPlaceId" TEXT,
    "estimatedCost" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transport_fromScheduleItemId_fkey" FOREIGN KEY ("fromScheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transport_toScheduleItemId_fkey" FOREIGN KEY ("toScheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transport_parkingPlaceId_fkey" FOREIGN KEY ("parkingPlaceId") REFERENCES "Place" ("googlePlaceId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleItemId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "bookingRef" TEXT,
    "fileAttachmentPath" TEXT,
    "expenseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ticket_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduleItemId" TEXT,
    "transportId" TEXT,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "fxRateToBase" REAL,
    "note" TEXT,
    "occurredAt" DATETIME,
    CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "Transport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AISuggestion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "llmProviders" TEXT NOT NULL DEFAULT '[]',
    "defaultProviderId" TEXT,
    "defaultModel" TEXT,
    "googleMapsApiKeyEnc" TEXT,
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

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCostUsd" REAL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);

-- CreateIndex
CREATE INDEX "Plan_tripId_idx" ON "Plan"("tripId");

-- CreateIndex
CREATE INDEX "Day_planId_idx" ON "Day"("planId");

-- CreateIndex
CREATE INDEX "ScheduleItem_dayId_idx" ON "ScheduleItem"("dayId");

-- CreateIndex
CREATE INDEX "ScheduleItem_placeId_idx" ON "ScheduleItem"("placeId");

-- CreateIndex
CREATE INDEX "PlacePhoto_googlePlaceId_idx" ON "PlacePhoto"("googlePlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Transport_fromScheduleItemId_key" ON "Transport"("fromScheduleItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Transport_toScheduleItemId_key" ON "Transport"("toScheduleItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_expenseId_key" ON "Ticket"("expenseId");

-- CreateIndex
CREATE INDEX "Ticket_scheduleItemId_idx" ON "Ticket"("scheduleItemId");

-- CreateIndex
CREATE INDEX "Expense_tripId_idx" ON "Expense"("tripId");

-- CreateIndex
CREATE INDEX "Expense_planId_idx" ON "Expense"("planId");

-- CreateIndex
CREATE INDEX "AISuggestion_planId_idx" ON "AISuggestion"("planId");

-- CreateIndex
CREATE INDEX "ApiUsageLog_service_occurredAt_idx" ON "ApiUsageLog"("service", "occurredAt");
