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

// Phase 13 — convert the Routes API ParsedTransitStep[] shape into our
// canonical TransitSteps. Used when the user picks a TRANSIT route option
// from the picker (compareAllModesWithAlternatives) so the list-view row
// renders the same Google-Maps-style summary regardless of whether the
// data came from API or pasted text.
//
// We map TRANSIT and WALK; OTHER steps (driving / bicycling within a
// multimodal route) are skipped — they're rare in pure TRANSIT routes.

type ApiTransitStep =
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
      lineName: string;
      lineNameShort?: string;
      lineColor?: string;
      lineTextColor?: string;
      vehicleType?: string;
      headsign?: string;
      headwaySec?: number;
      departureStop: string;
      arrivalStop: string;
      departureTime?: string;
      arrivalTime?: string;
      stopCount?: number;
    }
  | { kind: "OTHER" };

export function apiStepsToTransitSteps(
  apiSteps: readonly ApiTransitStep[],
): TransitSteps {
  const steps: TransitStep[] = [];
  for (const s of apiSteps) {
    if (s.kind === "WALK") {
      const walk: TransitWalkStep = {
        kind: "walk",
        durationSec: s.durationSec,
        distanceM: s.distanceMeters,
        ...(s.instruction ? { instruction: s.instruction } : {}),
      };
      steps.push(walk);
    } else if (s.kind === "TRANSIT") {
      const ride: TransitRideStep = {
        kind: "ride",
        lineName: s.lineName,
        ...(s.lineNameShort ? { lineCode: s.lineNameShort } : {}),
        ...(s.lineColor ? { lineColor: s.lineColor } : {}),
        ...(s.lineTextColor ? { lineTextColor: s.lineTextColor } : {}),
        ...(s.vehicleType
          ? { vehicleType: s.vehicleType as TransitRideStep["vehicleType"] }
          : {}),
        fromStation: s.departureStop,
        toStation: s.arrivalStop,
        numStops: s.stopCount ?? 0,
        durationSec: s.durationSec,
        departureTime: s.departureTime ?? "00:00",
        arrivalTime: s.arrivalTime ?? "00:00",
        ...(s.headsign ? { headsign: s.headsign } : {}),
      };
      steps.push(ride);
    }
    // OTHER steps skipped
  }
  // Derive serviceFrequencyMin from min headwaySec across rides if available
  let frequencyMin: number | undefined;
  for (const s of apiSteps) {
    if (s.kind === "TRANSIT" && s.headwaySec && s.headwaySec > 0) {
      const m = Math.round(s.headwaySec / 60);
      frequencyMin = frequencyMin == null ? m : Math.min(frequencyMin, m);
    }
  }
  return {
    steps,
    schemaVersion: 1,
    ...(frequencyMin != null ? { serviceFrequencyMin: frequencyMin } : {}),
  };
}
