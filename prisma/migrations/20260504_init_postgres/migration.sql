-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripShare" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TripShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMember" (
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedViaShareId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("tripId","userId")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'default-user',
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'TWD',
    "defaultPlanId" TEXT,
    "destination" TEXT,
    "subtitle" TEXT,
    "coverColor" TEXT NOT NULL DEFAULT 'from-gray-400 to-gray-600',
    "coverIconKey" TEXT NOT NULL DEFAULT 'landmark',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "forkedFromPlanId" TEXT,
    "pace" TEXT NOT NULL DEFAULT 'standard',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
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
    "metadataJson" TEXT,
    "parentFlightScheduleItemId" TEXT,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "googlePlaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "primaryType" TEXT,
    "types" TEXT,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "defaultStayMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultStaySource" TEXT NOT NULL DEFAULT 'HEURISTIC',
    "iconKey" TEXT NOT NULL DEFAULT 'landmark',
    "mapX" DOUBLE PRECISION,
    "mapY" DOUBLE PRECISION,
    "reviewSnippet" TEXT,
    "detailsExpireAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("googlePlaceId")
);

-- CreateTable
CREATE TABLE "PlacePhoto" (
    "id" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "photoReference" TEXT NOT NULL,
    "localCachePath" TEXT,
    "widthPx" INTEGER,

    CONSTRAINT "PlacePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transport" (
    "id" TEXT NOT NULL,
    "fromScheduleItemId" TEXT NOT NULL,
    "toScheduleItemId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "distanceMeters" INTEGER,
    "durationSec" INTEGER,
    "polyline" TEXT,
    "parkingPlaceId" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "encodedPolyline" TEXT,
    "directionsCacheJson" TEXT,
    "directionsFetchedAt" TIMESTAMP(3),
    "modesSummaryJson" TEXT,
    "departureAtIso" TEXT,
    "trafficLevel" TEXT,
    "fareCurrency" TEXT,
    "fareAmount" DOUBLE PRECISION,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "transitLine" TEXT,
    "transitDetailsJson" TEXT,
    "originLabel" TEXT,
    "destinationLabel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "routeOptionsJson" TEXT,
    "selectedOptionId" TEXT,
    "taxiRateSnapshotJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "bookingRef" TEXT,
    "fileAttachmentPath" TEXT,
    "expenseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduleItemId" TEXT,
    "transportId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "fxRateToBase" DOUBLE PRECISION,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3),
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "autoSource" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "scheduleItemId" TEXT,
    "caption" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" TEXT,
    "url" TEXT,
    "byteSize" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default-user',
    "llmProviders" TEXT NOT NULL DEFAULT '[]',
    "defaultProviderId" TEXT,
    "defaultModel" TEXT,
    "mapProvider" TEXT NOT NULL DEFAULT 'osm',
    "googleMapsApiKeyEnc" TEXT,
    "googleMapId" TEXT,
    "mapboxApiKeyEnc" TEXT,
    "aviationStackKeyEnc" TEXT,
    "defaultStayMinutesByType" TEXT NOT NULL DEFAULT '{}',
    "defaultFuelPricePerLiter" DOUBLE PRECISION NOT NULL DEFAULT 35.0,
    "defaultFuelEfficiencyKmPerL" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "baseCurrency" TEXT NOT NULL DEFAULT 'TWD',
    "localCurrency" TEXT NOT NULL DEFAULT 'JPY',
    "fxRates" TEXT DEFAULT '{"TWD":1,"JPY":4.76,"USD":0.031}',
    "fxFetchedAt" TIMESTAMP(3),
    "monthlyBudgetUsd" DOUBLE PRECISION,
    "taxiRegionRatesJson" TEXT,
    "recommendWeightsJson" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'default-user',
    "service" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripShare_tokenHash_key" ON "TripShare"("tokenHash");

-- CreateIndex
CREATE INDEX "TripShare_tripId_idx" ON "TripShare"("tripId");

-- CreateIndex
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

-- CreateIndex
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

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
CREATE INDEX "Expense_planId_isAuto_idx" ON "Expense"("planId", "isAuto");

-- CreateIndex
CREATE INDEX "Photo_scheduleItemId_orderIndex_idx" ON "Photo"("scheduleItemId", "orderIndex");

-- CreateIndex
CREATE INDEX "AISuggestion_planId_idx" ON "AISuggestion"("planId");

-- CreateIndex
CREATE INDEX "ApiUsageLog_service_occurredAt_idx" ON "ApiUsageLog"("service", "occurredAt");

-- CreateIndex
CREATE INDEX "ApiUsageLog_userId_occurredAt_idx" ON "ApiUsageLog"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "TripShare" ADD CONSTRAINT "TripShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShare" ADD CONSTRAINT "TripShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_joinedViaShareId_fkey" FOREIGN KEY ("joinedViaShareId") REFERENCES "TripShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Day" ADD CONSTRAINT "Day_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("googlePlaceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacePhoto" ADD CONSTRAINT "PlacePhoto_googlePlaceId_fkey" FOREIGN KEY ("googlePlaceId") REFERENCES "Place"("googlePlaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transport" ADD CONSTRAINT "Transport_fromScheduleItemId_fkey" FOREIGN KEY ("fromScheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transport" ADD CONSTRAINT "Transport_toScheduleItemId_fkey" FOREIGN KEY ("toScheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transport" ADD CONSTRAINT "Transport_parkingPlaceId_fkey" FOREIGN KEY ("parkingPlaceId") REFERENCES "Place"("googlePlaceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "Transport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestion" ADD CONSTRAINT "AISuggestion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

