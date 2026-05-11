// Phase 12c — Driving segment breakdown stored on Transport.drivingSegmentsJson.
//
// segments: ordered list of road sections (平面 / 收費 / 高速) with distance,
//   duration, and per-segment toll fee where applicable.
// fuelEstimate: snapshot from Settings.defaultFuelPricePerLiter +
//   defaultFuelEfficiencyKmPerL × polyline distance. Tier-1 (no LLM).
// restAreas: highway rest stops along the route, direction-aware. From LLM
//   grounding (Gemini's googleSearch tool) so data is fresh.
// groundingSources: URLs the LLM cited via groundingMetadata.
//
// Pure types — safe to import from client + server.

export type DrivingSegmentKind = "surface" | "toll-road" | "highway";

export type DrivingSegment = {
  kind: DrivingSegmentKind;
  distanceM: number;
  durationSec: number;
  roadName?: string;          // 國道一號 / 首都高速 C2 / 阪神高速 11 號
  tollAmount?: number;        // numeric, in tollCurrency
  tollCurrency?: string;      // ISO 4217 ("TWD" | "JPY" | "KRW" | ...)
};

export type DrivingFuelEstimate = {
  liters: number;
  cost: number;
  currency: string;           // base currency from Settings (e.g. "TWD")
  pricePerLiter: number;      // snapshot from Settings at compute time
  efficiencyKmPerL: number;
};

export type RestArea = {
  name: string;               // 西湖服務區 / 海老名 SA / 談合坂 SA
  kmFromStart: number;
  // outbound = same direction as this trip; either = bi-directional facility
  direction: "outbound" | "either";
  type: "PA" | "SA" | "rest-stop";
  notes?: string;             // 7-11、加油站、景觀台、便利店
};

export type DrivingSegments = {
  schemaVersion: 1;
  segments: DrivingSegment[];
  tollTotal?: { amount: number; currency: string };
  fuelEstimate: DrivingFuelEstimate;
  restAreas: RestArea[];
  estimatedAt: string;        // ISO timestamp
  groundingSources: string[]; // URLs Gemini cited via grounding (may be empty)
  modelUsed?: string;         // "gemini-2.5-flash-lite"
  tier: "fuel-only" | "full"; // tier-1 (no LLM) vs tier-2 (LLM)
  notes?: string;             // free-form LLM caveats
};

export function parseDrivingSegmentsJson(
  json: string | null | undefined,
): DrivingSegments | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as DrivingSegments;
    if (!Array.isArray(obj.segments)) return null;
    return obj;
  } catch {
    return null;
  }
}
