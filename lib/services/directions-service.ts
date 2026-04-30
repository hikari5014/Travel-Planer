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
  // Full response (trimmed) for detail panels. Routes API (NEW) returns
  // `GoogleRouteRaw`; legacy Directions API fallback (TRANSIT only) yields
  // a different shape, so we widen here.
  raw: GoogleRouteRaw | unknown;
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
  // Phase 11 — request up to ~3 alternative routes (Maps-style picker)
  computeAlternativeRoutes?: boolean;
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
  // Phase 11 — request alternative routes when caller asks (Maps-style picker
  // shows up to ~3 alts per mode). Only meaningful for DRIVE / TRANSIT; the
  // API silently ignores it for WALK / BICYCLE.
  if (input.computeAlternativeRoutes) body.computeAlternativeRoutes = true;

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
  let route = json.routes?.[0];
  // Phase 10k — Routes API (NEW) 對 TRANSIT 在某些地區覆蓋不佳（尤其日本 / 台灣
  // 部分私鐵）。當 NEW API 回傳空 routes 時，降級到 legacy Directions API
  // 補上缺口；同樣的 API key 兩個 endpoint 都吃。
  if (!route && input.mode === "TRANSIT") {
    const legacy = await fetchDirectionsLegacyTransit({
      apiKey,
      fromLat: input.fromLat,
      fromLng: input.fromLng,
      toLat: input.toLat,
      toLng: input.toLng,
      departureAtIso: departureTime,
    });
    if (legacy) {
      return { ...legacy, mode: "TRANSIT", fetchedAt: new Date().toISOString() };
    }
  }
  if (!route) throw new Error("Routes API 沒有回傳路線（可能是兩點間沒有合理路徑）");
  return mapRouteToDirectionsResult(route, input.mode, googleMode);
}

// Map a single Routes API route → DirectionsResult. Shared by fetchDirections
// (single result) and fetchRouteAlternatives (all routes).
function mapRouteToDirectionsResult(
  route: NonNullable<RoutesResponse["routes"]>[number],
  mode: Exclude<InternalMode, "CUSTOM">,
  googleMode: GoogleTravelMode,
): DirectionsResult {
  const distanceMeters = route.distanceMeters ?? 0;
  const durationSec = parseSeconds(route.duration);
  const encoded = route.polyline?.encodedPolyline ?? "";
  if (!encoded) throw new Error("Routes API 沒回傳 polyline");

  let fare: { currency: string; amount: number } | undefined;
  const fareRaw = route.travelAdvisory?.transitFare;
  if (fareRaw?.currencyCode && (fareRaw.units || fareRaw.nanos)) {
    const units = fareRaw.units ? Number(fareRaw.units) : 0;
    const nanos = fareRaw.nanos ?? 0;
    fare = { currency: fareRaw.currencyCode, amount: units + nanos / 1e9 };
  }

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
    mode,
    distanceMeters,
    durationSec,
    encodedPolyline: encoded,
    ...(fare ? { fare } : {}),
    ...(trafficLevel ? { trafficLevel } : {}),
    raw: route,
    fetchedAt: new Date().toISOString(),
  };
}

// Phase 11 — fetch all alternative routes for a single mode (Maps-style picker).
// Returns up to ~3 routes; falls back to single fetchDirections result for
// modes that don't return alternatives. Caller can also inspect each route's
// raw `legs.steps` for transit-step parsing.
export async function fetchRouteAlternatives(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: Exclude<InternalMode, "CUSTOM">;
  departureAtIso?: string;
}): Promise<DirectionsResult[]> {
  const apiKey = await getGoogleMapsKey();
  if (!apiKey) throw new Error("Google Maps API key 未設定 — 請至 /settings 加入");

  const googleMode = MODE_TO_GOOGLE[input.mode];
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
    computeAlternativeRoutes: true,
  };
  if (departureTime) body.departureTime = departureTime;
  if (googleMode === "DRIVE") body.routingPreference = "TRAFFIC_AWARE";

  const res = await fetch(ROUTES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FULL_MASK,
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
  const routes = json.routes ?? [];
  return routes
    .map((r) => {
      try {
        return mapRouteToDirectionsResult(r, input.mode, googleMode);
      } catch {
        return null;
      }
    })
    .filter((x): x is DirectionsResult => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10k — Legacy Directions API fallback (TRANSIT only).
//
// Same API key works for both endpoints. Legacy Directions API has been GA
// since 2010 and has noticeably better TRANSIT coverage in Tokyo / Taipei /
// Seoul private rail networks than Routes API (NEW). We use it ONLY when
// the new API returns empty routes for transit — otherwise the new API
// gives us better polylines + fare extraction + step parsing.
//
// Endpoint: https://maps.googleapis.com/maps/api/directions/json
// Returns: { routes: [{ overview_polyline, legs: [{ distance, duration,
//   fare?, steps }], ... }], status: "OK" | "ZERO_RESULTS" | ... }
// ─────────────────────────────────────────────────────────────────────────────

type LegacyDirectionsResponse = {
  status?: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: Array<{
      distance?: { value?: number };
      duration?: { value?: number };
      fare?: { currency?: string; value?: number };
    }>;
  }>;
};

async function fetchDirectionsLegacyTransit(input: {
  apiKey: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  departureAtIso?: string;
}): Promise<{
  distanceMeters: number;
  durationSec: number;
  encodedPolyline: string;
  fare?: { currency: string; amount: number };
  raw: unknown;
} | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${input.fromLat},${input.fromLng}`);
  url.searchParams.set("destination", `${input.toLat},${input.toLng}`);
  url.searchParams.set("mode", "transit");
  url.searchParams.set("language", "zh-TW");
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", input.apiKey);
  if (input.departureAtIso) {
    const ts = Math.floor(new Date(input.departureAtIso).getTime() / 1000);
    if (Number.isFinite(ts)) url.searchParams.set("departure_time", String(ts));
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as LegacyDirectionsResponse;
  if (json.status && json.status !== "OK") return null;
  const route = json.routes?.[0];
  const leg = route?.legs?.[0];
  if (!route || !leg) return null;

  const distanceMeters = leg.distance?.value ?? 0;
  const durationSec = leg.duration?.value ?? 0;
  const encodedPolyline = route.overview_polyline?.points ?? "";
  if (!encodedPolyline) return null;

  let fare: { currency: string; amount: number } | undefined;
  if (leg.fare?.currency && typeof leg.fare.value === "number") {
    fare = { currency: leg.fare.currency, amount: leg.fare.value };
  }

  return {
    distanceMeters,
    durationSec,
    encodedPolyline,
    ...(fare ? { fare } : {}),
    raw: route,
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
  // Phase 10a — recompute auto-Expense rows so the trip total reflects the
  // newly persisted fare / distance. Lazy-imported (and dynamically required
  // here) to break a transport→expense→transport circular import.
  const { safeRecalcPlanFromTransportId } = await import("./expense-service");
  await safeRecalcPlanFromTransportId(transportId);
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

// ─────────────────────────────────────────────────────────────────────────────
// Transit step parsing — extracts a slim, serializable version of the route's
// step-by-step instructions from the cached Google Routes response. Used by
// the dialog's transit-detail panel without dragging the whole raw JSON
// through MockTransport.
// ─────────────────────────────────────────────────────────────────────────────

export type ParsedTransitStep =
  | {
      kind: "WALK";
      distanceMeters: number;
      durationSec: number;
      instruction?: string;
    }
  | {
      kind: "TRANSIT";
      durationSec: number;
      distanceMeters: number;
      lineName: string;        // "JR 山手線"
      lineNameShort?: string;  // "山手"
      lineColor?: string;      // "#9ACD32"
      lineTextColor?: string;  // "#000000"
      vehicleType?: string;    // "HEAVY_RAIL" / "BUS" / "SUBWAY" ...
      vehicleName?: string;    // 中文 / 在地語顯示用
      headsign?: string;        // "新宿方向"
      headwaySec?: number;
      departureStop: string;
      arrivalStop: string;
      departureTime?: string;  // "09:08"
      arrivalTime?: string;    // "09:18"
      stopCount?: number;
      agency?: string;
    }
  | {
      kind: "OTHER"; // DRIVE / BICYCLE step inside a multimodal route
      mode: GoogleTravelMode;
      distanceMeters: number;
      durationSec: number;
      instruction?: string;
    };

export function parseTransitSteps(routeJson: unknown): ParsedTransitStep[] {
  const route = routeJson as GoogleRouteRaw | null;
  if (!route?.legs) return [];

  const steps: ParsedTransitStep[] = [];
  for (const leg of route.legs) {
    for (const s of leg.steps ?? []) {
      const distance = s.distanceMeters ?? 0;
      const duration = parseSeconds(s.staticDuration);

      if (s.travelMode === "TRANSIT" && s.transitDetails) {
        const td = s.transitDetails;
        const dep = td.stopDetails?.departureStop?.name ?? "";
        const arr = td.stopDetails?.arrivalStop?.name ?? "";
        const line = td.transitLine;
        const lineName = line?.name ?? line?.nameShort ?? "—";
        const headway = td.headway ? parseSeconds(td.headway) : undefined;

        steps.push({
          kind: "TRANSIT",
          durationSec: duration,
          distanceMeters: distance,
          lineName,
          ...(line?.nameShort ? { lineNameShort: line.nameShort } : {}),
          ...(line?.color ? { lineColor: line.color } : {}),
          ...(line?.textColor ? { lineTextColor: line.textColor } : {}),
          ...(line?.vehicle?.type ? { vehicleType: line.vehicle.type } : {}),
          ...(line?.vehicle?.name?.text ? { vehicleName: line.vehicle.name.text } : {}),
          ...(td.headsign ? { headsign: td.headsign } : {}),
          ...(headway != null ? { headwaySec: headway } : {}),
          departureStop: dep,
          arrivalStop: arr,
          ...(td.localizedValues?.departureTime?.time?.text
            ? { departureTime: td.localizedValues.departureTime.time.text }
            : {}),
          ...(td.localizedValues?.arrivalTime?.time?.text
            ? { arrivalTime: td.localizedValues.arrivalTime.time.text }
            : {}),
          ...(td.stopCount != null ? { stopCount: td.stopCount } : {}),
          ...(line?.agencies?.[0]?.name ? { agency: line.agencies[0].name } : {}),
        });
      } else if (s.travelMode === "WALK") {
        steps.push({
          kind: "WALK",
          distanceMeters: distance,
          durationSec: duration,
          ...(s.navigationInstruction?.instructions
            ? { instruction: s.navigationInstruction.instructions }
            : {}),
        });
      } else if (s.travelMode) {
        steps.push({
          kind: "OTHER",
          mode: s.travelMode,
          distanceMeters: distance,
          durationSec: duration,
          ...(s.navigationInstruction?.instructions
            ? { instruction: s.navigationInstruction.instructions }
            : {}),
        });
      }
    }
  }
  return steps;
}

// Phase 11 — derive RouteOption-level summary stats from a parsed transit
// steps array (transfer count + walking meters). Used by route-options-service
// to populate RouteOption.transferCount / walkingMeters without requiring
// callers to walk the array themselves.
export function summarizeTransitSteps(steps: ParsedTransitStep[]): {
  transferCount: number;
  walkingMeters: number;
} {
  let walkingMeters = 0;
  let transitSegments = 0;
  for (const s of steps) {
    if (s.kind === "WALK") walkingMeters += s.distanceMeters;
    else if (s.kind === "TRANSIT") transitSegments += 1;
  }
  // n transit segments = n-1 transfers (一段不算轉乘)
  const transferCount = Math.max(0, transitSegments - 1);
  return { transferCount, walkingMeters };
}

// Build the departureAtIso for a Transport — combines the trip Day's date
// with the from-item's endTime, treating the time as local-clock at the
// origin. We estimate the timezone offset from longitude (rough but good
// enough for travel destinations: Tokyo ~+9, Taipei ~+8, Bangkok ~+7).
// This was a critical fix — previously `${date}T${time}:00Z` shoved local
// clock into UTC, so a Tokyo 14:55 departure was sent as 14:55 UTC = 23:55
// JST, putting TRANSIT queries past last-train time and triggering NO_ROUTE.
export function buildDepartureIso(
  dayDateIso: string,
  fromItemEndTime: string,
  fromLng?: number,
): string | undefined {
  if (!dayDateIso || !fromItemEndTime) return undefined;
  const m = fromItemEndTime.match(/^(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const localH = Number(m[1]);
  const localM = Number(m[2]);

  const tzHours = fromLng != null ? Math.round(fromLng / 15) : 0;
  const d = new Date(`${dayDateIso}T00:00:00Z`);
  // Set UTC hours to (local - tzOffset) so the resulting ISO represents
  // the intended wall-clock at the origin.
  d.setUTCHours(localH - tzHours, localM, 0, 0);
  return d.toISOString();
}
