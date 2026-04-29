import "server-only";
import { decode } from "@googlemaps/polyline-codec";
import { prisma } from "@/lib/db";
import { getGoogleMapsKey } from "./settings-service";

// Phase 9 — Google Routes API (New) integration.
//
// Endpoint: https://routes.googleapis.com/directions/v2:computeRoutes
// Auth:     X-Goog-Api-Key header (server-side; same key as Maps JS / Places)
// Pricing:  Compute Routes Basic SKU $5/1k; $200/mo free credit ≈ 40k calls
//
// We use Routes API (not the legacy Directions API) because:
//  · Slim response via X-Goog-FieldMask (we control bytes back)
//  · Native traffic-aware routing for DRIVE
//  · Single endpoint for all 5 travel modes (DRIVE/WALK/BICYCLE/TRANSIT/TWO_WHEELER)
//  · Same enc-polyline algorithm as the JS SDK so we can decode client-side

export type GoogleTravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";

// Our internal mode codes (legacy — kept for backwards compat in Transport.mode).
// DRIVING / WALKING / TRANSIT / BICYCLING / CUSTOM
export type InternalMode = "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING" | "CUSTOM";

const MODE_TO_GOOGLE: Record<Exclude<InternalMode, "CUSTOM">, GoogleTravelMode> = {
  DRIVING: "DRIVE",
  WALKING: "WALK",
  TRANSIT: "TRANSIT",
  BICYCLING: "BICYCLE",
};

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

// Field masks: trim what comes back so we don't pay for fields we never read.
// Two flavors — a heavy one for the chosen mode (full transit / driving
// detail) and a light one for the side-by-side compare (just summary).
const FULL_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.travelAdvisory",
  "routes.legs.distanceMeters",
  "routes.legs.duration",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.navigationInstruction",
  "routes.legs.steps.transitDetails",
  "routes.warnings",
].join(",");

const SUMMARY_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.travelAdvisory.transitFare",
].join(",");

// ─────────────────────────────────────────────────────────────────────────────
// Public types — what callers consume
// ─────────────────────────────────────────────────────────────────────────────

export type DirectionsResult = {
  mode: InternalMode;
  distanceMeters: number;
  durationSec: number;
  encodedPolyline: string;
  fare?: { currency: string; amount: number };
  trafficLevel?: "light" | "moderate" | "heavy";
  // Full response (trimmed) for detail panels
  raw: GoogleRouteRaw;
  fetchedAt: string; // ISO
};

export type ModeSummary = {
  mode: InternalMode;
  ok: boolean;
  distanceMeters?: number;
  durationSec?: number;
  encodedPolyline?: string;
  fare?: { currency: string; amount: number };
  error?: string;
};

export type ModesSummary = {
  DRIVING: ModeSummary;
  WALKING: ModeSummary;
  TRANSIT: ModeSummary;
  BICYCLING: ModeSummary;
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes API request/response shape (only fields we use)
// ─────────────────────────────────────────────────────────────────────────────

type RoutesResponse = {
  routes?: GoogleRouteRaw[];
  error?: { code?: number; message?: string; status?: string };
};

export type GoogleRouteRaw = {
  distanceMeters?: number;
  duration?: string; // "480s"
  polyline?: { encodedPolyline?: string };
  legs?: GoogleLeg[];
  travelAdvisory?: {
    transitFare?: { currencyCode?: string; units?: string; nanos?: number };
    speedReadingIntervals?: Array<{ startPolylinePointIndex?: number; endPolylinePointIndex?: number; speed?: "NORMAL" | "SLOW" | "TRAFFIC_JAM" }>;
  };
  warnings?: string[];
};

export type GoogleLeg = {
  distanceMeters?: number;
  duration?: string;
  steps?: GoogleStep[];
};

export type GoogleStep = {
  distanceMeters?: number;
  staticDuration?: string;
  travelMode?: GoogleTravelMode;
  navigationInstruction?: { instructions?: string; maneuver?: string };
  transitDetails?: GoogleTransitDetails;
};

export type GoogleTransitDetails = {
  stopDetails?: {
    arrivalStop?: { name?: string };
    arrivalTime?: string;
    departureStop?: { name?: string };
    departureTime?: string;
  };
  localizedValues?: {
    arrivalTime?: { time?: { text?: string } };
    departureTime?: { time?: { text?: string } };
  };
  headsign?: string;
  headway?: string; // "300s"
  transitLine?: {
    name?: string;
    nameShort?: string;
    color?: string;
    textColor?: string;
    vehicle?: { name?: { text?: string }; type?: string };
    agencies?: Array<{ name?: string; uri?: string }>;
  };
  stopCount?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch — single mode
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchDirections(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: Exclude<InternalMode, "CUSTOM">;
  departureAtIso?: string; // when omitted, Google uses "now"
  fieldMask?: "full" | "summary";
}): Promise<DirectionsResult> {
  const apiKey = await getGoogleMapsKey();
  if (!apiKey) throw new Error("Google Maps API key 未設定 — 請至 /settings 加入");

  const googleMode = MODE_TO_GOOGLE[input.mode];
  const mask = input.fieldMask === "summary" ? SUMMARY_MASK : FULL_MASK;

  // Routes API requires departureTime to be in the FUTURE for traffic-aware
  // routing. If user's trip date is in the past, drop the field; the API
  // falls back to historical-average traffic.
  const departureTime =
    input.departureAtIso && new Date(input.departureAtIso) > new Date()
      ? input.departureAtIso
      : undefined;

  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: input.fromLat, longitude: input.fromLng } } },
    destination: { location: { latLng: { latitude: input.toLat, longitude: input.toLng } } },
    travelMode: googleMode,
    languageCode: "zh-TW",
    units: "METRIC",
  };
  if (departureTime) body.departureTime = departureTime;
  if (googleMode === "DRIVE") body.routingPreference = "TRAFFIC_AWARE";

  const res = await fetch(ROUTES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": mask,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Routes API ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as RoutesResponse;
  if (json.error) throw new Error(`Routes API: ${json.error.status ?? json.error.code} — ${json.error.message ?? ""}`);
  const route = json.routes?.[0];
  if (!route) throw new Error("Routes API 沒有回傳路線（可能是兩點間沒有合理路徑）");

  const distanceMeters = route.distanceMeters ?? 0;
  const durationSec = parseSeconds(route.duration);
  const encoded = route.polyline?.encodedPolyline ?? "";
  if (!encoded) throw new Error("Routes API 沒回傳 polyline");

  // Fare extraction (TRANSIT only)
  let fare: { currency: string; amount: number } | undefined;
  const fareRaw = route.travelAdvisory?.transitFare;
  if (fareRaw?.currencyCode && (fareRaw.units || fareRaw.nanos)) {
    const units = fareRaw.units ? Number(fareRaw.units) : 0;
    const nanos = fareRaw.nanos ?? 0;
    fare = { currency: fareRaw.currencyCode, amount: units + nanos / 1e9 };
  }

  // Traffic level for DRIVE (very rough — count SLOW/TRAFFIC_JAM intervals)
  let trafficLevel: "light" | "moderate" | "heavy" | undefined;
  if (googleMode === "DRIVE") {
    const intervals = route.travelAdvisory?.speedReadingIntervals ?? [];
    const slow = intervals.filter((i) => i.speed === "SLOW").length;
    const jam = intervals.filter((i) => i.speed === "TRAFFIC_JAM").length;
    if (jam >= 2) trafficLevel = "heavy";
    else if (jam >= 1 || slow >= 3) trafficLevel = "moderate";
    else trafficLevel = "light";
  }

  return {
    mode: input.mode,
    distanceMeters,
    durationSec,
    encodedPolyline: encoded,
    ...(fare ? { fare } : {}),
    ...(trafficLevel ? { trafficLevel } : {}),
    raw: route,
    fetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// All 4 modes in parallel — for the "compare" panel.
// Each mode failing is non-fatal; we return a `ModeSummary` with `ok:false`
// so the UI can show ✓ for the modes that worked + an error tip for the rest.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAllModes(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  departureAtIso?: string;
}): Promise<ModesSummary> {
  const modes: Array<Exclude<InternalMode, "CUSTOM">> = ["DRIVING", "WALKING", "TRANSIT", "BICYCLING"];
  const results = await Promise.all(
    modes.map(async (m): Promise<[Exclude<InternalMode, "CUSTOM">, ModeSummary]> => {
      try {
        const r = await fetchDirections({ ...input, mode: m, fieldMask: "summary" });
        return [
          m,
          {
            mode: m,
            ok: true,
            distanceMeters: r.distanceMeters,
            durationSec: r.durationSec,
            encodedPolyline: r.encodedPolyline,
            ...(r.fare ? { fare: r.fare } : {}),
          },
        ];
      } catch (e) {
        return [m, { mode: m, ok: false, error: e instanceof Error ? e.message : String(e) }];
      }
    }),
  );
  const out = Object.fromEntries(results) as Record<Exclude<InternalMode, "CUSTOM">, ModeSummary>;
  return out as ModesSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence — write a DirectionsResult onto the Transport row
// ─────────────────────────────────────────────────────────────────────────────

export async function persistDirectionsToTransport(
  transportId: string,
  result: DirectionsResult,
  modeSummary?: Partial<Record<InternalMode, ModeSummary>>,
) {
  await prisma.transport.update({
    where: { id: transportId },
    data: {
      mode: result.mode,
      distanceMeters: result.distanceMeters,
      durationSec: result.durationSec,
      encodedPolyline: result.encodedPolyline,
      directionsCacheJson: JSON.stringify(result.raw),
      directionsFetchedAt: new Date(),
      ...(modeSummary ? { modesSummaryJson: JSON.stringify(modeSummary) } : {}),
      ...(result.fare
        ? {
            fareCurrency: result.fare.currency,
            fareAmount: result.fare.amount,
            // Auto-fill estimatedCost from transit fare (in fare's currency,
            // not converted — the editor displays via PriceWithLocal which
            // handles the FX). Driving cost is computed by the fuel-based
            // estimator and overrides this when mode is DRIVING.
            estimatedCost: result.mode === "TRANSIT" ? result.fare.amount : undefined,
          }
        : {}),
      ...(result.trafficLevel ? { trafficLevel: result.trafficLevel } : { trafficLevel: null }),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseSeconds(s: string | undefined): number {
  if (!s) return 0;
  // Routes API returns "480s" — strip suffix and parse.
  const n = parseInt(s.replace(/s$/, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// Decode an encoded polyline to [[lat, lng], ...]. Used by the API layer
// (server) to hand simple coords arrays to map panels (client). We could
// also do this client-side but doing it once on the server saves bytes.
export function decodePolyline(encoded: string): Array<[number, number]> {
  if (!encoded) return [];
  try {
    return decode(encoded, 5) as Array<[number, number]>;
  } catch {
    return [];
  }
}

// Build the departureAtIso for a Transport — combines the trip Day's date
// with the from-item's endTime. Used when (re)querying directions.
export function buildDepartureIso(dayDateIso: string, fromItemEndTime: string): string | undefined {
  // dayDateIso = "2026-04-30", fromItemEndTime = "09:30"
  if (!dayDateIso || !fromItemEndTime) return undefined;
  const m = fromItemEndTime.match(/^(\d{2}):(\d{2})/);
  if (!m) return undefined;
  // We treat times as local (Q5: no timezone handling). Build a UTC ISO that
  // happens to carry the correct local clock-time for traffic-aware routing.
  return `${dayDateIso}T${m[1]}:${m[2]}:00Z`;
}
