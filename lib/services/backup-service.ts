import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureCurrentUser, getCurrentUserId } from "@/lib/auth/current-user";

// JSON full-DB export/import — Phase 0b "data insurance" against schema changes.
// Output is a snapshot keyed by table; input the same shape replaces existing
// rows. Encrypted columns stay encrypted (we ship the ciphertext as-is so the
// same APP_ENC_KEY decrypts after restore).

const SNAPSHOT_VERSION = 1;

export const backupSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  data: z.object({
    trips: z.array(z.any()),
    plans: z.array(z.any()),
    days: z.array(z.any()),
    scheduleItems: z.array(z.any()),
    places: z.array(z.any()),
    placePhotos: z.array(z.any()),
    transports: z.array(z.any()),
    tickets: z.array(z.any()),
    expenses: z.array(z.any()),
    aiSuggestions: z.array(z.any()),
    settings: z.any().nullable(),
    apiUsageLogs: z.array(z.any()),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

export async function exportAllAsJson(): Promise<Backup> {
  const [
    trips, plans, days, scheduleItems, places, placePhotos,
    transports, tickets, expenses, aiSuggestions, settings, apiUsageLogs,
  ] = await Promise.all([
    prisma.trip.findMany(),
    prisma.plan.findMany(),
    prisma.day.findMany(),
    prisma.scheduleItem.findMany(),
    prisma.place.findMany(),
    prisma.placePhoto.findMany(),
    prisma.transport.findMany(),
    prisma.ticket.findMany(),
    prisma.expense.findMany(),
    prisma.aISuggestion.findMany(),
    getCurrentUserId().then((id) => prisma.settings.findUnique({ where: { id } })),
    prisma.apiUsageLog.findMany(),
  ]);

  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      trips, plans, days, scheduleItems, places, placePhotos,
      transports, tickets, expenses, aiSuggestions, settings,
      apiUsageLogs,
    },
  };
}

// Import wipes every model in a single transaction, then re-inserts.
// All `userId` references in the imported data are rewritten to the
// CURRENT user's id (cookie-resolved) — without this, restoring a backup
// from a different cookie/domain would orphan all data under the old userId.
// Foreign-key safe order: parent tables before children.
export async function importFromJson(json: unknown): Promise<{ counts: Record<string, number> }> {
  const parsed = backupSchema.parse(json);
  if (parsed.version !== SNAPSHOT_VERSION) {
    throw new Error(`不支援的 schema 版本：${parsed.version}（目前 ${SNAPSHOT_VERSION}）`);
  }
  const d = parsed.data;

  // Ensure a User row exists for the current cookie; we'll rewire imported
  // ownership to this id.
  const me = await ensureCurrentUser();
  const remapUserId = <T extends Record<string, unknown>>(rows: T[]): T[] =>
    rows.map((r) => ({ ...r, userId: me.id }));

  return prisma.$transaction(async (tx) => {
    // Wipe in reverse-dependency order
    await tx.apiUsageLog.deleteMany();
    await tx.aISuggestion.deleteMany();
    await tx.ticket.deleteMany();
    await tx.expense.deleteMany();
    await tx.transport.deleteMany();
    await tx.scheduleItem.deleteMany();
    await tx.day.deleteMany();
    await tx.plan.deleteMany();
    await tx.placePhoto.deleteMany();
    await tx.place.deleteMany();
    await tx.trip.deleteMany();
    await tx.settings.deleteMany();

    // Insert in dependency order
    await insert(tx, "trip", remapUserId(d.trips as Record<string, unknown>[]), ["startDate", "endDate", "createdAt", "updatedAt"]);
    await insert(tx, "place", d.places, ["fetchedAt", "detailsExpireAt"]);
    await insert(tx, "placePhoto", d.placePhotos);
    await insert(tx, "plan", d.plans, ["createdAt", "updatedAt"]);
    await insert(tx, "day", d.days, ["date"]);
    await insert(tx, "scheduleItem", d.scheduleItems);
    // Transport, expense, ticket all depend on each other; keep order matching schema FKs
    await insert(tx, "transport", d.transports, ["createdAt", "updatedAt"]);
    await insert(tx, "expense", d.expenses, ["occurredAt"]);
    await insert(tx, "ticket", d.tickets, ["createdAt", "updatedAt"]);
    await insert(tx, "aISuggestion", d.aiSuggestions, ["generatedAt"]);
    await insert(tx, "apiUsageLog", remapUserId(d.apiUsageLogs as Record<string, unknown>[]), ["occurredAt"]);
    if (d.settings) {
      // Settings.id IS the userId (1:1). Override to current user so the
      // restored API keys / preferences belong to whoever is importing.
      await tx.settings.create({
        data: {
          ...d.settings,
          id: me.id,
          fxFetchedAt: d.settings.fxFetchedAt ? new Date(d.settings.fxFetchedAt) : null,
          updatedAt: d.settings.updatedAt ? new Date(d.settings.updatedAt) : new Date(),
        },
      });
    }

    return {
      counts: {
        trips: d.trips.length,
        plans: d.plans.length,
        days: d.days.length,
        scheduleItems: d.scheduleItems.length,
        places: d.places.length,
        transports: d.transports.length,
        tickets: d.tickets.length,
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Orphan recovery — for the case where the user's cookie changed (e.g. they
// browsed a different Vercel deployment URL → new traveler_id → empty view
// over their existing data). Reassigns every Trip / Settings / ApiUsageLog
// in the DB to the current user. Single-user friendly; if multiple real users
// exist this would consolidate everyone, so the action UI gates this behind
// a confirm dialog.
// ─────────────────────────────────────────────────────────────────────────────

export type OrphanScanResult = {
  currentUserId: string;
  orphanTrips: number;
  orphanApiLogs: number;
  orphanSettings: Array<{ id: string; hasKeys: boolean; updatedAt: string }>;
  myTrips: number;
};

export async function scanOrphans(): Promise<OrphanScanResult> {
  const me = await getCurrentUserId();
  const [orphanTrips, orphanApiLogs, allSettings, myTrips] = await Promise.all([
    prisma.trip.count({ where: { userId: { not: me } } }),
    prisma.apiUsageLog.count({ where: { userId: { not: me } } }),
    prisma.settings.findMany({
      where: { id: { not: me } },
      select: {
        id: true,
        updatedAt: true,
        googleMapsApiKeyEnc: true,
        mapboxApiKeyEnc: true,
        aviationStackKeyEnc: true,
        llmProviders: true,
      },
    }),
    prisma.trip.count({ where: { userId: me } }),
  ]);
  return {
    currentUserId: me,
    orphanTrips,
    orphanApiLogs,
    orphanSettings: allSettings.map((s) => ({
      id: s.id,
      hasKeys: Boolean(
        s.googleMapsApiKeyEnc ||
          s.mapboxApiKeyEnc ||
          s.aviationStackKeyEnc ||
          (s.llmProviders && s.llmProviders !== "[]"),
      ),
      updatedAt: s.updatedAt.toISOString(),
    })),
    myTrips,
  };
}

// Claim everything currently in the DB — reassign all trips and api logs to
// the current user. For Settings: if the current user has none, take the most
// recently-updated orphan settings row's contents (so API keys come along).
export async function claimAllOrphans(): Promise<{
  claimedTrips: number;
  claimedApiLogs: number;
  settingsAdopted: boolean;
}> {
  const me = await ensureCurrentUser();

  return prisma.$transaction(async (tx) => {
    const claimedTrips = await tx.trip.updateMany({
      where: { userId: { not: me.id } },
      data: { userId: me.id },
    });
    const claimedApiLogs = await tx.apiUsageLog.updateMany({
      where: { userId: { not: me.id } },
      data: { userId: me.id },
    });

    let settingsAdopted = false;
    const mySettings = await tx.settings.findUnique({ where: { id: me.id } });
    if (!mySettings) {
      const orphan = await tx.settings.findFirst({
        where: { id: { not: me.id } },
        orderBy: { updatedAt: "desc" },
      });
      if (orphan) {
        await tx.settings.create({
          data: {
            ...orphan,
            id: me.id,
            updatedAt: new Date(),
          },
        });
        settingsAdopted = true;
      }
    }
    // Drop the now-stranded orphan Settings rows so future scans are clean.
    await tx.settings.deleteMany({ where: { id: { not: me.id } } });

    return {
      claimedTrips: claimedTrips.count,
      claimedApiLogs: claimedApiLogs.count,
      settingsAdopted,
    };
  });
}

// Internal: bulk insert with date-string → Date conversion for known fields.
async function insert(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  modelName: string,
  rows: unknown[],
  dateFields: string[] = [],
) {
  if (!rows.length) return;
  const data = rows.map((row) => {
    const r = { ...(row as Record<string, unknown>) };
    for (const f of dateFields) {
      if (r[f] && typeof r[f] === "string") r[f] = new Date(r[f] as string);
    }
    return r;
  });
  // @ts-expect-error — generic delegate access keyed by model name
  await tx[modelName].createMany({ data });
}
