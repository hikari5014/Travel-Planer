import "server-only";
import { z } from "zod";
import {
  buildDepartureIso,
  fetchRouteAlternatives,
  parseTransitSteps,
  summarizeTransitSteps,
  type DirectionsResult,
  type ParsedTransitStep,
} from "./directions-service";
import { getRecommendWeightsRaw, getTaxiRegionRatesRaw } from "./settings-service";
import { comfortScore, co2Grams } from "./comfort-score";
import {
  BUILT_IN_TAXI_RATES,
  detectRegionByBbox,
  estimateTaxiCost,
  mergeRates,
  type RegionCode,
  type TaxiRate,
} from "./taxi-rate-table";

// Phase 11 — Google-Maps-style point-to-point picker service.
//
// Composes Routes API (alternatives × 4 modes) + derived TAXI estimate +
// recommendation scoring. Returns RouteOption[] ready for the UI's
// vertical-card list.

export type RouteOptionMode =
  | "DRIVING"
  | "WALKING"
  | "TRANSIT"
  | "BICYCLING"
  | "TAXI"
  | "FLIGHT";

export type RouteOptionBadge =
  | "recommended"
  | "fastest"
  | "cheapest"
  | "most-comfortable"
  | "greenest";

export type RouteOption = {
  id: string;
  mode: RouteOptionMode;
  label: string;
  durationSec: number;
  distanceM: number;
  fareAmount: number | null;
  fareCurrency: string | null;
  encodedPolyline: string;
  transitSteps?: ParsedTransitStep[];
  departureAtIso?: string;
  arrivalAtIso?: string;
  transferCount?: number;
  walkingMeters?: number;
  trafficLevel?: "light" | "moderate" | "heavy";
  source: "routes-api" | "routes-api-alt" | "taxi-derived" | "directions-legacy" | "flight-meta";
  comfortScore: number;
  recommendScore: number;
  badges: RouteOptionBadge[];
  // 機票 / 計程車費率快照（套用 TAXI 時凍結）
  taxiRateSnapshot?: TaxiRate & { region: string };
  // co2 grams (純 stat 顯示，可選)
  co2Grams?: number;
};

export type RecommendWeights = { time: number; cost: number; comfort: number; co2: number };
export const DEFAULT_RECOMMEND_WEIGHTS: RecommendWeights = {
  time: 0.5,
  cost: 0.3,
  comfort: 0.2,
  co2: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function compareAllModesWithAlternatives(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  departureAtIso?: string;
  enabledModes?: RouteOptionMode[]; // 預設全部
}): Promise<{ options: RouteOption[]; modeErrors: Record<string, string> }> {
  const enabled = new Set(input.enabledModes ?? [
    "DRIVING",
    "WALKING",
    "TRANSIT",
    "BICYCLING",
    "TAXI",
  ]);

  // 並行查 Routes API（DRIVE / WALK / TRANSIT / BICYCLE 各最多 3 alt）
  const apiModes: Array<"DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING"> = [];
  if (enabled.has("DRIVING") || enabled.has("TAXI")) apiModes.push("DRIVING");
  if (enabled.has("WALKING")) apiModes.push("WALKING");
  if (enabled.has("TRANSIT")) apiModes.push("TRANSIT");
  if (enabled.has("BICYCLING")) apiModes.push("BICYCLING");

  const settled = await Promise.allSettled(
    apiModes.map((m) =>
      fetchRouteAlternatives({
        fromLat: input.fromLat,
        fromLng: input.fromLng,
        toLat: input.toLat,
        toLng: input.toLng,
        mode: m,
        ...(input.departureAtIso ? { departureAtIso: input.departureAtIso } : {}),
      }),
    ),
  );

  // 把 Routes API result → RouteOption[]，並收集每個 mode 的失敗原因
  // 給 UI 顯示（讓使用者看到「TRANSIT failed: REQUEST_DENIED」等實際原因）。
  const options: RouteOption[] = [];
  const modeErrors: Record<string, string> = {};
  let drivingPrimary: DirectionsResult | null = null;

  settled.forEach((res, idx) => {
    const apiMode = apiModes[idx]!;
    if (res.status === "rejected") {
      modeErrors[apiMode] = res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.warn(`[route-options] ${apiMode} rejected:`, res.reason);
      return;
    }
    const routes = res.value;
    if (routes.length === 0) {
      modeErrors[apiMode] = "API 回傳 0 條路線（兩點間無此模式可達？）";
      return;
    }
    routes.forEach((r, i) => {
      if (apiMode === "DRIVING" && i === 0) drivingPrimary = r;
      if (apiMode === "DRIVING" && !enabled.has("DRIVING")) return;
      const opt = directionsResultToOption(r, apiMode, i === 0 ? "routes-api" : "routes-api-alt");
      options.push(opt);
    });
  });

  // 用 driving primary 推導 TAXI option
  if (enabled.has("TAXI") && drivingPrimary) {
    const taxi = await deriveTaxiOption(drivingPrimary, input.fromLat, input.fromLng);
    if (taxi) options.push(taxi);
  }

  // 套用 recommendation
  const weightsRaw = await getRecommendWeightsRaw().catch(() => null);
  const weights = parseWeights(weightsRaw) ?? DEFAULT_RECOMMEND_WEIGHTS;
  const ranked = recommendModes(options, weights);
  return { options: ranked, modeErrors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation
// ─────────────────────────────────────────────────────────────────────────────

export function recommendModes(
  options: RouteOption[],
  weights: RecommendWeights = DEFAULT_RECOMMEND_WEIGHTS,
): RouteOption[] {
  if (options.length === 0) return [];

  // 計算各維度的 max 用來 normalize
  const maxDuration = Math.max(...options.map((o) => o.durationSec || 0), 1);
  const maxCost = Math.max(...options.map((o) => o.fareAmount ?? 0), 1);
  const maxCo2 = Math.max(...options.map((o) => o.co2Grams ?? 0), 1);

  // 每個 option 算 score
  for (const o of options) {
    const time = 1 - (o.durationSec || 0) / maxDuration;
    const cost = 1 - (o.fareAmount ?? 0) / maxCost;
    const co2 = 1 - (o.co2Grams ?? 0) / maxCo2;
    const recommend =
      weights.time * time +
      weights.cost * cost +
      weights.comfort * (o.comfortScore || 0) +
      weights.co2 * co2;
    o.recommendScore = Math.max(0, Math.min(1, recommend));
  }

  // 排序 desc by recommendScore
  options.sort((a, b) => b.recommendScore - a.recommendScore);

  // 貼 badges
  if (options.length > 0) options[0]!.badges.push("recommended");
  const fastest = [...options].sort((a, b) => a.durationSec - b.durationSec)[0];
  if (fastest) fastest.badges.push("fastest");
  const cheapest = [...options]
    .filter((o) => o.fareAmount != null && o.fareAmount > 0)
    .sort((a, b) => (a.fareAmount ?? Infinity) - (b.fareAmount ?? Infinity))[0];
  if (cheapest) cheapest.badges.push("cheapest");
  const mostComfort = [...options].sort((a, b) => b.comfortScore - a.comfortScore)[0];
  if (mostComfort) mostComfort.badges.push("most-comfortable");
  const greenest = [...options]
    .filter((o) => (o.co2Grams ?? 0) >= 0)
    .sort((a, b) => (a.co2Grams ?? Infinity) - (b.co2Grams ?? Infinity))[0];
  if (greenest) greenest.badges.push("greenest");

  // 去重 badge
  for (const o of options) {
    o.badges = Array.from(new Set(o.badges));
  }
  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// Region + TAXI
// ─────────────────────────────────────────────────────────────────────────────

export async function detectRegion(input: {
  lat: number;
  lng: number;
}): Promise<string | null> {
  const bbox = detectRegionByBbox(input.lat, input.lng);
  if (bbox) return bbox;
  // Geocoding API fallback — 之後加；目前 bbox 沒命中就 return null
  // 留 hook：可在 settings 補 GEOCODING_KEY 後啟用
  return null;
}

async function deriveTaxiOption(
  driving: DirectionsResult,
  fromLat: number,
  fromLng: number,
): Promise<RouteOption | null> {
  const region = (await detectRegion({ lat: fromLat, lng: fromLng })) ?? "US";
  const ratesRaw = await getTaxiRegionRatesRaw().catch(() => null);
  const overrides = parseRegionRates(ratesRaw);
  const rates = mergeRates(overrides);
  const rate = rates[region] ?? BUILT_IN_TAXI_RATES["US"]!;
  const cost = estimateTaxiCost(rate, driving.distanceMeters, driving.durationSec);

  return {
    id: stableId("TAXI", driving.encodedPolyline, driving.fetchedAt),
    mode: "TAXI",
    label: `計程車（${region}）`,
    durationSec: driving.durationSec,
    distanceM: driving.distanceMeters,
    fareAmount: cost.fareAmount,
    fareCurrency: cost.currency,
    encodedPolyline: driving.encodedPolyline,
    ...(driving.trafficLevel ? { trafficLevel: driving.trafficLevel } : {}),
    source: "taxi-derived",
    comfortScore: comfortScore({
      mode: "TAXI",
      trafficLevel: driving.trafficLevel ?? null,
    }),
    recommendScore: 0,
    badges: [],
    taxiRateSnapshot: { ...rate, region },
    co2Grams: co2Grams(driving.distanceMeters, "TAXI"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function directionsResultToOption(
  r: DirectionsResult,
  mode: "DRIVING" | "WALKING" | "TRANSIT" | "BICYCLING",
  source: "routes-api" | "routes-api-alt",
): RouteOption {
  let transitSteps: ParsedTransitStep[] | undefined;
  let transferCount: number | undefined;
  let walkingMeters: number | undefined;
  let label = modeLabelZh(mode);

  if (mode === "TRANSIT") {
    transitSteps = parseTransitSteps(r.raw);
    const summary = summarizeTransitSteps(transitSteps);
    transferCount = summary.transferCount;
    walkingMeters = summary.walkingMeters;
    // 找出第一個 TRANSIT step 的線名作 label
    const firstLine = transitSteps.find((s) => s.kind === "TRANSIT");
    if (firstLine && firstLine.kind === "TRANSIT") {
      label = `${firstLine.lineNameShort ?? firstLine.lineName}${
        transferCount && transferCount > 0 ? ` + ${transferCount} 次轉乘` : ""
      }`;
    }
  } else if (mode === "DRIVING" && r.trafficLevel) {
    const trafficLabel =
      r.trafficLevel === "heavy" ? "（壅塞）" : r.trafficLevel === "moderate" ? "（中等）" : "（順暢）";
    label = `駕車${trafficLabel}`;
  }

  return {
    id: stableId(mode, r.encodedPolyline, r.fetchedAt),
    mode,
    label,
    durationSec: r.durationSec,
    distanceM: r.distanceMeters,
    fareAmount: r.fare?.amount ?? null,
    fareCurrency: r.fare?.currency ?? null,
    encodedPolyline: r.encodedPolyline,
    ...(transitSteps ? { transitSteps } : {}),
    ...(transferCount !== undefined ? { transferCount } : {}),
    ...(walkingMeters !== undefined ? { walkingMeters } : {}),
    ...(r.trafficLevel ? { trafficLevel: r.trafficLevel } : {}),
    source,
    comfortScore: comfortScore({
      mode,
      ...(walkingMeters !== undefined ? { walkingMeters } : {}),
      ...(transferCount !== undefined ? { transferCount } : {}),
      ...(r.trafficLevel ? { trafficLevel: r.trafficLevel } : {}),
    }),
    recommendScore: 0,
    badges: [],
    co2Grams: co2Grams(r.distanceMeters, mode),
  };
}

function modeLabelZh(mode: RouteOptionMode): string {
  return {
    DRIVING: "駕車",
    WALKING: "步行",
    TRANSIT: "大眾運輸",
    BICYCLING: "腳踏車",
    TAXI: "計程車",
    FLIGHT: "飛機",
  }[mode];
}

// 短 + 穩定的 id（不需要密碼學強度）
function stableId(mode: string, polyline: string, fetchedAt: string): string {
  const head = polyline.slice(0, 16).replace(/[^a-zA-Z0-9]/g, "");
  const ts = fetchedAt.slice(0, 13).replace(/[^0-9]/g, "");
  return `${mode}_${head}_${ts}`;
}

// 解析 JSON 設定欄位
const RegionRatesSchema = z.record(
  z.string(),
  z.object({
    baseFare: z.number(),
    perKm: z.number(),
    perMin: z.number(),
    currency: z.string(),
    notes: z.string().optional(),
  }),
);

export function parseRegionRates(raw: string | null | undefined): Record<string, TaxiRate> | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    const parsed = RegionRatesSchema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data as Record<string, TaxiRate>;
  } catch {
    return null;
  }
}

const WeightsSchema = z.object({
  time: z.number(),
  cost: z.number(),
  comfort: z.number(),
  co2: z.number(),
});

export function parseWeights(raw: string | null | undefined): RecommendWeights | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    const parsed = WeightsSchema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

// Re-export types for convenience
export type { RegionCode, TaxiRate } from "./taxi-rate-table";
export type { ParsedTransitStep } from "./directions-service";
