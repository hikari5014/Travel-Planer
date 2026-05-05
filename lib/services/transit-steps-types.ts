// Rich transit step timeline types — Phase 12b.
//
// One Transport (TRANSIT mode) can carry an optional `transitStepsJson` blob
// of this shape so the list view can render a Google-Maps-style breakdown
// (walk → ride → walk → ride → ...) without re-fetching anywhere.
//
// Walk steps and ride steps alternate. The LLM paste-parser fills these when
// the user pastes a "詳細路線" view; rule-based parsing intentionally does
// NOT extract steps — too brittle, low ROI.
//
// Pure types — safe to import client-side.

export type TransitWalkStep = {
  kind: "walk";
  durationSec: number;
  distanceM: number;
  // Optional descriptive instruction ("walk to 淺草站", "from platform to exit")
  instruction?: string;
};

export type TransitRideStep = {
  kind: "ride";
  lineName: string;            // "銀座線" / "JR Yamanote Line"
  lineCode?: string;           // Google's short code: "G", "JC", "M03"
  lineColor?: string;          // hex "#FF9500"
  lineTextColor?: string;      // hex "#FFFFFF"
  vehicleType?:
    | "SUBWAY"
    | "HEAVY_RAIL"
    | "COMMUTER_TRAIN"
    | "BUS"
    | "TRAM"
    | "FERRY";
  serviceType?: string;        // "各站停車" | "快速" | "特急" | "急行" | "普通"
  fromStation: string;
  toStation: string;
  fromStationId?: string;      // "G19"
  toStationId?: string;
  numStops: number;
  durationSec: number;
  platform?: string;           // "6 號月台" / "Platform 14"
  departureTime: string;       // "HH:MM" 24h
  arrivalTime: string;         // "HH:MM"
  headsign?: string;           // "往澀谷"
};

export type TransitStep = TransitWalkStep | TransitRideStep;

export type TransitSteps = {
  steps: TransitStep[];
  // Mirrors Transport.fareCurrency when LLM extracted it directly from steps;
  // optional because the flat `fareCurrency` is the canonical source.
  totalFareCurrency?: string;
  // "每 4 分鐘" → 4. Display only; not used in cascade calculations.
  serviceFrequencyMin?: number;
  schemaVersion: 1;
};

export function parseTransitStepsJson(json: string | null | undefined): TransitSteps | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const steps = obj.steps;
    if (!Array.isArray(steps)) return null;
    return obj as TransitSteps;
  } catch {
    return null;
  }
}
