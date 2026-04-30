import "server-only";
import { z } from "zod";
import { getAviationStackKey } from "./settings-service";
import { lookupAirlineByIata } from "@/lib/iata-airlines";

// Phase 10j — flight schedule lookup. Three-tier strategy:
//
//   1. AviationStack API (real flight data, free 100 req/month) when the
//      user has set the key in /settings.
//   2. IATA airline lookup (fully offline) — fills airline name even when
//      no API and no AI is reachable.
//   3. AI (Claude / Gemini) — generic flight knowledge, used as fallback
//      and to fill any fields the structured sources don't cover (cities,
//      isInternational hint, terminal).
//
// Returns the SAME shape as the existing FlightAIInfo so the dialog form
// merges results identically regardless of source.

const AviationStackResponse = z.object({
  data: z.array(
    z.object({
      flight_date: z.string().nullable().optional(),
      flight_status: z.string().nullable().optional(),
      airline: z
        .object({
          name: z.string().nullable().optional(),
          iata: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      flight: z
        .object({
          number: z.string().nullable().optional(),
          iata: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      departure: z
        .object({
          airport: z.string().nullable().optional(),
          iata: z.string().nullable().optional(),
          scheduled: z.string().nullable().optional(),
          terminal: z.string().nullable().optional(),
          gate: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      arrival: z
        .object({
          airport: z.string().nullable().optional(),
          iata: z.string().nullable().optional(),
          scheduled: z.string().nullable().optional(),
          terminal: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    }),
  ).optional(),
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
});

export type FlightLookupInfo = {
  airline: string | null;
  depAirport: string | null; // IATA
  arrAirport: string | null;
  depCity: string | null;
  arrCity: string | null;
  depTime: string | null; // HH:MM local
  arrTime: string | null;
  arrDateOffset: number | null; // 0/1/2
  isInternational: boolean | null;
  terminal: string | null;
  notes: string | null;
  source: "aviationstack" | "ai" | "iata-only";
};

export async function lookupFlight(input: {
  flightNumber: string;
  date: string; // YYYY-MM-DD
}): Promise<FlightLookupInfo> {
  const flightNum = input.flightNumber.trim().toUpperCase();

  // Tier 1 — AviationStack
  const key = await getAviationStackKey();
  if (key) {
    try {
      const fromAS = await tryAviationStack(key, flightNum, input.date);
      if (fromAS) return fromAS;
    } catch {
      /* fall through to AI */
    }
  }

  // Tier 2/3 — let the AI service handle it. (We import lazily to avoid a
  // server-only dependency cycle when this file is pulled into other
  // services.) AI gets the IATA airline hint to bias its answer.
  const { suggestFlightInfo } = await import("./flight-service");
  const aiInfo = await suggestFlightInfo({ flightNumber: flightNum, date: input.date });
  const iataAirline = aiInfo.airline ?? lookupAirlineByIata(flightNum);
  return {
    airline: iataAirline,
    depAirport: aiInfo.depAirport,
    arrAirport: aiInfo.arrAirport,
    depCity: aiInfo.depCity,
    arrCity: aiInfo.arrCity,
    depTime: aiInfo.depTime,
    arrTime: aiInfo.arrTime,
    arrDateOffset: aiInfo.arrDateOffset,
    isInternational: aiInfo.isInternational,
    terminal: aiInfo.terminal,
    notes: aiInfo.notes,
    source: "ai",
  };
}

async function tryAviationStack(
  key: string,
  flightIata: string,
  date: string,
): Promise<FlightLookupInfo | null> {
  const url = new URL("http://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", key);
  url.searchParams.set("flight_iata", flightIata);
  url.searchParams.set("flight_date", date);
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`AviationStack ${res.status}`);
  }
  const json = await res.json();
  const parsed = AviationStackResponse.safeParse(json);
  if (!parsed.success) throw new Error("AviationStack: 回傳格式異常");
  if (parsed.data.error?.message) throw new Error(`AviationStack: ${parsed.data.error.message}`);
  const row = parsed.data.data?.[0];
  if (!row) return null;

  const dep = row.departure ?? {};
  const arr = row.arrival ?? {};

  // "scheduled" is full ISO with the airport's local offset (e.g.
  // "2026-05-01T14:55:00+08:00"); slice off the HH:MM portion.
  const extractHM = (iso?: string | null): string | null => {
    if (!iso) return null;
    const m = iso.match(/T(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
  };
  const extractDate = (iso?: string | null): string | null => {
    if (!iso) return null;
    return iso.slice(0, 10);
  };

  const arrDate = extractDate(arr.scheduled);
  const depDate = extractDate(dep.scheduled);
  let arrDateOffset: number | null = null;
  if (depDate && arrDate && depDate !== arrDate) {
    const days = Math.round(
      (new Date(arrDate + "T00:00:00Z").getTime() -
        new Date(depDate + "T00:00:00Z").getTime()) /
        (24 * 60 * 60 * 1000),
    );
    arrDateOffset = days;
  } else if (arrDate) {
    arrDateOffset = 0;
  }

  return {
    airline: row.airline?.name ?? lookupAirlineByIata(flightIata),
    depAirport: dep.iata ?? null,
    arrAirport: arr.iata ?? null,
    depCity: null, // AviationStack returns airport name; leave city to AI/manual
    arrCity: null,
    depTime: extractHM(dep.scheduled),
    arrTime: extractHM(arr.scheduled),
    arrDateOffset,
    isInternational:
      dep.iata && arr.iata
        ? dep.iata.slice(0, 2) !== arr.iata.slice(0, 2)
          ? null // can't infer from IATA alone
          : null
        : null,
    terminal: dep.terminal ?? null,
    notes: row.flight_status ? `班機狀態：${row.flight_status}` : null,
    source: "aviationstack",
  };
}
