import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";

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
    prisma.settings.findFirst(),
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
// Foreign-key safe order: parent tables before children.
export async function importFromJson(json: unknown): Promise<{ counts: Record<string, number> }> {
  const parsed = backupSchema.parse(json);
  if (parsed.version !== SNAPSHOT_VERSION) {
    throw new Error(`不支援的 schema 版本：${parsed.version}（目前 ${SNAPSHOT_VERSION}）`);
  }
  const d = parsed.data;

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
    await insert(tx, "trip", d.trips, ["startDate", "endDate", "createdAt", "updatedAt"]);
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
    await insert(tx, "apiUsageLog", d.apiUsageLogs, ["occurredAt"]);
    if (d.settings) {
      await tx.settings.create({
        data: {
          ...d.settings,
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
        expenses: d.expenses.length,
      },
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
