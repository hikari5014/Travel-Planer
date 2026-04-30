-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN "metadataJson" TEXT;
ALTER TABLE "ScheduleItem" ADD COLUMN "parentFlightScheduleItemId" TEXT;

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleItemId" TEXT,
    "caption" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" TEXT,
    "url" TEXT,
    "byteSize" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
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
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "autoSource" TEXT,
    CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "Transport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "currency", "fxRateToBase", "id", "note", "occurredAt", "planId", "scheduleItemId", "transportId", "tripId") SELECT "amount", "category", "currency", "fxRateToBase", "id", "note", "occurredAt", "planId", "scheduleItemId", "transportId", "tripId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_tripId_idx" ON "Expense"("tripId");
CREATE INDEX "Expense_planId_idx" ON "Expense"("planId");
CREATE INDEX "Expense_planId_isAuto_idx" ON "Expense"("planId", "isAuto");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Photo_scheduleItemId_orderIndex_idx" ON "Photo"("scheduleItemId", "orderIndex");
