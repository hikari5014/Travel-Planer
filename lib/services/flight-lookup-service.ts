import "server-only";
import { z } from "zod";
import { getAviationStackKey, getAeroDataBoxKey } from "./settings-service";
import { lookupAirlineByIata } from "@/lib/iata-airlines";

// Phase 10j — flight schedule lookup. Tiered strategy:
//
//   1. AviationStack API (real flight data, free 100 req/month) when the
//      user has set the key in /settings.
//   1.5 AeroDataBox via RapidAPI (free ~500 req/month) — second free
//      structured source, used when AviationStack has no result or fails.
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
  source: "aviationstack" | "aerodatabox" | "ai" | "iata-only";
};

// Three-tier strategy with AI MERGE as default behaviour:
//
//   tier 1 — AviationStack (real data, free 100/month, requires user key)
//            → if hits, return immediately (full real data)
//   tier 2 — offline IATA airline directory (instant, no quota, fills only
//            the `airline` field but covers 80+ carriers)
//   tier 3 — AI / LLM (Claude / Gemini) — fills schedule/airport fields
//            that IATA can't infer.
//
// When `allowAI` is true (default), tier 2 + tier 3 are MERGED so the user
// gets airline (IATA) + dep/arr/time (AI) in one go. When `allowAI` is
// false, tier 2 returns alone (deterministic-only mode).
export async function lookupFlight(input: {
  flightNumber: string;
  date: string; // YYYY-MM-DD
  allowAI?: boolean;
}): Promise<FlightLookupInfo> {
  const flightNum = input.flightNumber.trim().toUpperCase();
  const allowAI = input.allowAI !== false; // default true

  // ─ Tier 1: AviationStack
  const asKey = await getAviationStackKey();
  if (asKey) {
    try {
      const fromAS = await tryAviationStack(asKey, flightNum, input.date);
      if (fromAS) return fromAS;
    } catch {
      /* fall through to next tier */
    }
  }

  // ─ Tier 1.5: AeroDataBox (RapidAPI) ─
  const adbKey = await getAeroDataBoxKey();
  if (adbKey) {
    try {
      const fromADB = await tryAeroDataBox(adbKey, flightNum, input.date);
      if (fromADB) return fromADB;
    } catch {
      /* fall through to next tier */
    }
  }

  // ─ Tier 2 + 3 merge ─
  const iataAirline = lookupAirlineByIata(flightNum);

  if (allowAI) {
    // Always fire AI when allowed (default). IATA wins for airline; AI
    // fills the rest. If AI itself errors, fall back to IATA-only.
    try {
      const { suggestFlightInfo } = await import("./flight-service");
      const aiInfo = await suggestFlightInfo({ flightNumber: flightNum, date: input.date });
      return {
        airline: iataAirline ?? aiInfo.airline,
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
        source: "ai", // schedule data came from AI even if airline came from IATA
      };
    } catch {
      /* fall through to deterministic IATA-only */
    }
  }

  // Tier 2 only — deterministic
  if (iataAirline) {
    return {
      airline: iataAirline,
      depAirport: null,
      arrAirport: null,
      depCity: null,
      arrCity: null,
      depTime: null,
      arrTime: null,
      arrDateOffset: null,
      isInternational: null,
      terminal: null,
      notes: "已從內建航空公司清單帶入。其餘欄位請從機票 / 行程表手動填寫。",
      source: "iata-only",
    };
  }

  throw new Error(
    "找不到此航班的資料。請確認航班號正確，或至 /settings 設定 AviationStack key 取得真實資料。",
  );
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

// ─── AeroDataBox (RapidAPI) ─────────────────────────────────────────────────
// GET /flights/number/{flightNumber}/{date}
// Headers: X-RapidAPI-Key, X-RapidAPI-Host: aerodatabox.p.rapidapi.com
// Returns an array of flight legs (codeshares get one entry each).

const AeroDataBoxAirport = z
  .object({
    icao: z.string().nullable().optional(),
    iata: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    shortName: z.string().nullable().optional(),
    municipalityName: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const AeroDataBoxTimeBlock = z
  .object({
    scheduledTime: z
      .object({
        utc: z.string().nullable().optional(),
        local: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    terminal: z.string().nullable().optional(),
    gate: z.string().nullable().optional(),
    airport: AeroDataBoxAirport,
  });

const AeroDataBoxResponse = z.array(
  z.object({
    number: z.string().nullable().optional(),
    callSign: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    codeshareStatus: z.string().nullable().optional(),
    isCargo: z.boolean().nullable().optional(),
    departure: AeroDataBoxTimeBlock,
    arrival: AeroDataBoxTimeBlock,
    airline: z
      .object({
        name: z.string().nullable().optional(),
        iata: z.string().nullable().optional(),
        icao: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
);

async function tryAeroDataBox(
  key: string,
  flightIata: string,
  date: string,
): Promise<FlightLookupInfo | null> {
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightIata)}/${encodeURIComponent(date)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });
  if (res.status === 404) return null; // AeroDataBox returns 404 when no flight matches
  if (!res.ok) {
    throw new Error(`AeroDataBox ${res.status}`);
  }
  const json = await res.json();
  const parsed = AeroDataBoxResponse.safeParse(json);
  if (!parsed.success) throw new Error("AeroDataBox: 回傳格式異常");
  // Prefer the operating leg (status !== "Codeshared") if multiple entries exist.
  const row =
    parsed.data.find((r) => r.codeshareStatus !== "IsCodeshared") ?? parsed.data[0];
  if (!row) return null;

  const dep = row.departure ?? null;
  const arr = row.arrival ?? null;

  // scheduledTime.local is "YYYY-MM-DD HH:MM±HH:MM" (e.g. "2026-05-05 09:00+08:00")
  const extractHM = (local?: string | null): string | null => {
    if (!local) return null;
    const m = local.match(/\b(\d{2}):(\d{2})\b/);
    return m ? `${m[1]}:${m[2]}` : null;
  };
  const extractDate = (local?: string | null): string | null => {
    if (!local) return null;
    const m = local.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };

  const depDate = extractDate(dep?.scheduledTime?.local);
  const arrDate = extractDate(arr?.scheduledTime?.local);
  let arrDateOffset: number | null = null;
  if (depDate && arrDate && depDate !== arrDate) {
    arrDateOffset = Math.round(
      (new Date(arrDate + "T00:00:00Z").getTime() -
        new Date(depDate + "T00:00:00Z").getTime()) /
        (24 * 60 * 60 * 1000),
    );
  } else if (arrDate) {
    arrDateOffset = 0;
  }

  const depCountry = dep?.airport?.countryCode ?? null;
  const arrCountry = arr?.airport?.countryCode ?? null;
  const isInternational =
    depCountry && arrCountry ? depCountry !== arrCountry : null;

  return {
    airline: row.airline?.name ?? lookupAirlineByIata(flightIata),
    depAirport: dep?.airport?.iata ?? null,
    arrAirport: arr?.airport?.iata ?? null,
    depCity: dep?.airport?.municipalityName ?? null,
    arrCity: arr?.airport?.municipalityName ?? null,
    depTime: extractHM(dep?.scheduledTime?.local),
    arrTime: extractHM(arr?.scheduledTime?.local),
    arrDateOffset,
    isInternational,
    terminal: dep?.terminal ?? null,
    notes: row.status ? `班機狀態：${row.status}` : null,
    source: "aerodatabox",
  };
}
