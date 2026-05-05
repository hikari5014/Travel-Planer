import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recalcDayTransports } from "./transport-service";
import { generateJson } from "./ai-service";
import { getCurrentUserId } from "@/lib/auth/current-user";
import {
  parseKindMetadata,
  type FlightMetadata,
  type TransportStopMetadata,
} from "@/lib/schedule-item-metadata";

// Phase 10d — Flight module.
//
// A FLIGHT ScheduleItem carries its own metadata (flightNumber, depTime,
// arrTime, checkInBufferMin, immigrationBufferMin, ...). For each FLIGHT
// item we keep two "buddy" TRANSPORT_STOP items:
//
//   · CHECK-IN     ─ at (depTime − checkInBufferMin), spans bufferMin
//   · IMMIGRATION  ─ at (arrTime), spans immigrationBufferMin
//
// Both buddies are linked back via `parentFlightScheduleItemId`. Editing the
// flight metadata cascades into the buddies (`expandFlightSchedule`).
//
// Buddies use `metadataJson.derivedFrom = "FLIGHT_CHECKIN" | "FLIGHT_IMMIGRATION"`
// so the editor knows not to let users hand-edit them (they'd just get
// regenerated next save).

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function fmtHM(min: number): string {
  const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// expandFlightSchedule — keep buddies in sync with the flight metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function expandFlightSchedule(flightItemId: string): Promise<void> {
  const flight = await prisma.scheduleItem.findUnique({
    where: { id: flightItemId },
  });
  if (!flight || flight.kind !== "FLIGHT") return;

  const meta = parseKindMetadata("FLIGHT", flight.metadataJson ? safeJsonParse(flight.metadataJson) : {}) as FlightMetadata;
  const dayId = flight.dayId;

  // Wipe existing buddies; we'll re-create the ones we still need
  await prisma.scheduleItem.deleteMany({
    where: { parentFlightScheduleItemId: flightItemId },
  });

  const buddies: Array<{
    kind: "TRANSPORT_STOP";
    startTime: string;
    endTime: string;
    durationMin: number;
    metadataJson: string;
    note: string;
    orderIndex: number;
  }> = [];

  const depTime = meta.depTime;
  const arrTime = meta.arrTime;

  // CHECK-IN buddy: starts (depTime - checkInBufferMin), ends at depTime.
  // Phase 13 fix — locked at depTime so the cascade engine doesn't drift it.
  if (depTime && /^\d{2}:\d{2}$/.test(depTime) && (meta.checkInBufferMin ?? 0) > 0) {
    const dep = parseHM(depTime);
    const buf = meta.checkInBufferMin!;
    const start = dep - buf;
    const stopMeta: TransportStopMetadata = {
      purpose: "機場 check-in / 安檢",
      derivedFrom: "FLIGHT_CHECKIN",
    };
    buddies.push({
      kind: "TRANSPORT_STOP",
      startTime: fmtHM(start),
      endTime: fmtHM(dep),
      durationMin: buf,
      metadataJson: JSON.stringify(stopMeta),
      note: `${meta.depAirport ?? "出發機場"} · check-in 提早 ${buf} 分（當地時間，至 ${fmtHM(dep)}）`,
      orderIndex: flight.orderIndex - 1,
    });
  }

  // IMMIGRATION buddy: starts arrTime, ends arrTime + immigrationBufferMin.
  // Phase 13 fix — locked at arrTime.
  if (arrTime && /^\d{2}:\d{2}$/.test(arrTime) && (meta.immigrationBufferMin ?? 0) > 0) {
    const arr = parseHM(arrTime);
    const buf = meta.immigrationBufferMin!;
    const stopMeta: TransportStopMetadata = {
      purpose: "入境 / 取行李",
      derivedFrom: "FLIGHT_IMMIGRATION",
    };
    buddies.push({
      kind: "TRANSPORT_STOP",
      startTime: fmtHM(arr),
      endTime: fmtHM(arr + buf),
      durationMin: buf,
      metadataJson: JSON.stringify(stopMeta),
      note: `${meta.arrAirport ?? "抵達機場"} · 入境取行李 ${buf} 分（當地時間，自 ${fmtHM(arr)} 起）`,
      orderIndex: flight.orderIndex + 1,
    });
  }

  for (const b of buddies) {
    await prisma.scheduleItem.create({
      data: {
        dayId,
        kind: b.kind,
        startTime: b.startTime,
        endTime: b.endTime,
        durationMin: b.durationMin,
        suggestedDurationMin: b.durationMin,
        orderIndex: b.orderIndex,
        isAllDay: false,
        // Phase 13 fix — lock buddies so cascade respects depTime / arrTime.
        // Without this, recalc walks them as auto items and shifts them off
        // the depTime / arrTime anchors based on the previous item's cursor.
        isTimeLocked: true,
        note: b.note,
        metadataJson: b.metadataJson,
        parentFlightScheduleItemId: flightItemId,
      },
    });
  }

  // Phase 13 fix — also lock the FLIGHT item itself at depTime → arrTime so
  // the cascade engine never drifts the airline-published times.
  if (depTime && arrTime && /^\d{2}:\d{2}$/.test(depTime) && /^\d{2}:\d{2}$/.test(arrTime)) {
    await prisma.scheduleItem.update({
      where: { id: flightItemId },
      data: {
        startTime: depTime,
        endTime: arrTime,
        isTimeLocked: true,
      },
    });
  }

  // Recalc transports so the new buddies are stitched into the day
  await recalcDayTransports(dayId);
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI auto-fill — flightNumber + date → fill metadata fields
// ─────────────────────────────────────────────────────────────────────────────

const FlightAIInfoSchema = z.object({
  airline: z.string().nullable(),
  depAirport: z.string().nullable(), // IATA
  arrAirport: z.string().nullable(),
  depCity: z.string().nullable(),
  arrCity: z.string().nullable(),
  depTime: z.string().nullable(), // "HH:MM" local
  arrTime: z.string().nullable(),
  arrDateOffset: z.number().int().min(0).max(2).nullable(), // 0=same day, 1=+1, 2=+2
  isInternational: z.boolean().nullable(),
  terminal: z.string().nullable(),
  notes: z.string().nullable(),
});

export type FlightAIInfo = z.infer<typeof FlightAIInfoSchema>;

export async function suggestFlightInfo(input: {
  flightNumber: string;
  date: string; // YYYY-MM-DD
}): Promise<FlightAIInfo> {
  const result = await generateJson({
    system:
      "你是民航資訊顧問。給定航班號碼與日期，回傳該航班的常態排程：航空公司、出發/抵達機場（IATA 三碼）、城市、本地起降時間、是否跨日、是否國際、預期航廈。" +
      "若資訊不完整就填 null。時間用 24h HH:MM。",
    prompt: `航班號：${input.flightNumber}
日期：${input.date}

請以 JSON 回應：
{
  "airline": "EVA Air" | null,
  "depAirport": "TPE" | null,
  "arrAirport": "NRT" | null,
  "depCity": "台北" | null,
  "arrCity": "東京" | null,
  "depTime": "08:30" | null,
  "arrTime": "12:50" | null,
  "arrDateOffset": 0 | 1 | 2 | null,
  "isInternational": true | false | null,
  "terminal": "T2" | null,
  "notes": "額外提醒（如季節變動）" | null
}`,
    schema: FlightAIInfoSchema,
    metadata: { kind: "FLIGHT_LOOKUP", flightNumber: input.flightNumber, date: input.date },
  });
  return result;
}

// Merge AI result into existing metadata (preserving user-entered fields).
// User wins for any field they've already filled; AI fills the gaps.
export async function applyFlightSuggestion(
  flightItemId: string,
  ai: FlightAIInfo,
  date: string,
): Promise<void> {
  const item = await prisma.scheduleItem.findUnique({ where: { id: flightItemId } });
  if (!item || item.kind !== "FLIGHT") return;

  const current = parseKindMetadata("FLIGHT", item.metadataJson ? safeJsonParse(item.metadataJson) : {}) as FlightMetadata;
  // Phase 11.6 — AI lookup overrides stale data (was ?? in wrong order)
  const merged: FlightMetadata = {
    ...current,
    airline: ai.airline ?? current.airline ?? undefined,
    depAirport: ai.depAirport ?? current.depAirport ?? undefined,
    arrAirport: ai.arrAirport ?? current.arrAirport ?? undefined,
    depCity: ai.depCity ?? current.depCity ?? undefined,
    arrCity: ai.arrCity ?? current.arrCity ?? undefined,
    depTime: ai.depTime ?? current.depTime ?? undefined,
    arrTime: ai.arrTime ?? current.arrTime ?? undefined,
    terminal: ai.terminal ?? current.terminal ?? undefined,
    isInternational: ai.isInternational ?? current.isInternational ?? undefined,
  };

  // arrDate: 跨日航班才填
  if (ai.arrDateOffset && ai.arrDateOffset > 0) {
    const d = new Date(date + "T00:00:00");
    d.setUTCDate(d.getUTCDate() + ai.arrDateOffset);
    merged.arrDate = d.toISOString().slice(0, 10);
  }

  // Phase 12g — buffer defaults read from Settings (per-user customisable)
  // instead of hardcoded 120/60/60/30. The per-flight metadata override
  // (already user-set on this FLIGHT) wins; we only fill in nulls.
  if (merged.checkInBufferMin == null || merged.immigrationBufferMin == null) {
    const userId = await getCurrentUserId();
    const settings = await prisma.settings.findUnique({ where: { id: userId } });
    if (merged.checkInBufferMin == null) {
      merged.checkInBufferMin = merged.isInternational
        ? settings?.defaultFlightCheckInBufferMinIntl ?? 120
        : settings?.defaultFlightCheckInBufferMinDomestic ?? 60;
    }
    if (merged.immigrationBufferMin == null) {
      merged.immigrationBufferMin = merged.isInternational
        ? settings?.defaultFlightImmigrationBufferMinIntl ?? 60
        : settings?.defaultFlightImmigrationBufferMinDomestic ?? 30;
    }
  }

  await prisma.scheduleItem.update({
    where: { id: flightItemId },
    data: { metadataJson: JSON.stringify(merged) },
  });

  // Cascade buddies + recalc plan expenses
  await expandFlightSchedule(flightItemId);
  const { safeRecalcPlanFromScheduleItemId } = await import("./expense-service");
  await safeRecalcPlanFromScheduleItemId(flightItemId);
}

// Phase 10i — apply AI flight info to a TRANSPORT row (flight as a Transport
// segment rather than a Place). Sets metadataJson + computes durationSec
// from depTime / arrTime so the schedule list shows a sensible duration.
export async function applyFlightSuggestionToTransport(
  transportId: string,
  ai: FlightAIInfo,
  date: string,
): Promise<void> {
  const t = await prisma.transport.findUnique({ where: { id: transportId } });
  if (!t) return;

  const current = parseKindMetadata("FLIGHT", t.metadataJson ? safeJsonParse(t.metadataJson) : {}) as FlightMetadata;
  // Phase 11.6 — AI lookup overrides stale data (was ?? in wrong order).
  const merged: FlightMetadata = {
    ...current,
    airline: ai.airline ?? current.airline ?? undefined,
    depAirport: ai.depAirport ?? current.depAirport ?? undefined,
    arrAirport: ai.arrAirport ?? current.arrAirport ?? undefined,
    depCity: ai.depCity ?? current.depCity ?? undefined,
    arrCity: ai.arrCity ?? current.arrCity ?? undefined,
    depTime: ai.depTime ?? current.depTime ?? undefined,
    arrTime: ai.arrTime ?? current.arrTime ?? undefined,
    terminal: ai.terminal ?? current.terminal ?? undefined,
    isInternational: ai.isInternational ?? current.isInternational ?? undefined,
  };
  if (ai.arrDateOffset && ai.arrDateOffset > 0) {
    const d = new Date(date + "T00:00:00");
    d.setUTCDate(d.getUTCDate() + ai.arrDateOffset);
    merged.arrDate = d.toISOString().slice(0, 10);
  }

  // Compute durationSec from dep/arr times. Clamp arrDateOffset to 0..2
  // to defend against a misbehaving AI; cap final duration at 48h.
  let durationSec: number | undefined;
  if (merged.depTime && merged.arrTime && /^\d{2}:\d{2}$/.test(merged.depTime) && /^\d{2}:\d{2}$/.test(merged.arrTime)) {
    const [dh, dm] = merged.depTime.split(":").map(Number);
    const [ah, am] = merged.arrTime.split(":").map(Number);
    const dayOffset = Math.max(0, Math.min(2, ai.arrDateOffset ?? 0));
    const depMin = (dh ?? 0) * 60 + (dm ?? 0);
    let arrMin = (ah ?? 0) * 60 + (am ?? 0) + dayOffset * 24 * 60;
    // If still <= depMin (offset 0 + arr earlier than dep), assume next day.
    if (arrMin <= depMin) arrMin += 24 * 60;
    durationSec = Math.min(48 * 60 * 60, Math.max(0, (arrMin - depMin) * 60));
  }

  // Great-circle distance between the two airport IATA codes (haversine);
  // gives a reasonable distance display even though actual flight tracks
  // are slightly longer due to airways routing.
  let distanceMeters: number | undefined;
  if (merged.depAirport && merged.arrAirport) {
    const { distanceBetweenAirports } = await import("@/lib/iata-airports");
    const d = distanceBetweenAirports(merged.depAirport, merged.arrAirport);
    if (d != null) distanceMeters = d;
  }

  await prisma.transport.update({
    where: { id: transportId },
    data: {
      metadataJson: JSON.stringify(merged),
      mode: "FLIGHT",
      manuallyEdited: true,
      ...(durationSec ? { durationSec } : {}),
      ...(distanceMeters ? { distanceMeters } : {}),
      // Ticket price flows into estimatedCost so it shows up in plan totals.
      ...(typeof merged.ticketPrice === "number" && merged.ticketPrice > 0
        ? { estimatedCost: merged.ticketPrice }
        : {}),
    },
  });

  const { safeRecalcPlanFromTransportId } = await import("./expense-service");
  await safeRecalcPlanFromTransportId(transportId);
}
