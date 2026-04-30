// Phase 11 — comfort + co2 scoring for route option ranking.
//
// All functions are pure; safe to import from client + server. Inputs/outputs
// are 0..1 scores so they can be linearly weighted by recommendModes().

import type { RouteOptionMode } from "./route-options-service";

// ─────────────────────────────────────────────────────────────────────────────
// Comfort
// ─────────────────────────────────────────────────────────────────────────────

export type ComfortInput = {
  walkingMeters?: number | null;       // 步行段加總
  transferCount?: number | null;       // 轉乘次數（TRANSIT only）
  trafficLevel?: "light" | "moderate" | "heavy" | null; // DRIVING only
  mode: RouteOptionMode;
};

// 純步行 / 腳踏車本身就是體力活，給保底分（避免「步行 60 km 也算最舒適」）。
const MODE_BASE_COMFORT: Record<RouteOptionMode, number> = {
  WALKING: 0.35,    // 體力消耗 + 天氣風險
  BICYCLING: 0.45,
  TRANSIT: 0.7,     // 不用自己駕駛，但會有轉乘 / 站立
  DRIVING: 0.6,     // 自駕需專注，路況變化
  TAXI: 0.85,       // 沒人開車最舒適
  FLIGHT: 0.65,     // 有出入境 / 行李
};

// score = baseComfort − walkingPenalty − transferPenalty − trafficPenalty
// 各項都 clamp 到 0..1
export function comfortScore(input: ComfortInput): number {
  let score = MODE_BASE_COMFORT[input.mode] ?? 0.5;

  // walking penalty — 每 1 km 扣 0.08（5 km = 0.4 扣完封頂）
  const walkKm = (input.walkingMeters ?? 0) / 1000;
  score -= Math.min(0.4, walkKm * 0.08);

  // transfer penalty — 每次轉乘扣 0.1（最多扣 0.3）
  const transfers = input.transferCount ?? 0;
  score -= Math.min(0.3, transfers * 0.1);

  // traffic penalty (DRIVING only) — heavy 扣 0.25, moderate 扣 0.1, light 不扣
  if (input.mode === "DRIVING" || input.mode === "TAXI") {
    if (input.trafficLevel === "heavy") score -= 0.25;
    else if (input.trafficLevel === "moderate") score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// CO₂
// ─────────────────────────────────────────────────────────────────────────────

// g CO₂ per passenger·km — 引用 IPCC AR6 + UK DEFRA 2024 報告。
// 用於 0..1 normalize；數值越低越環保。
export const CO2_GRAMS_PER_KM: Record<RouteOptionMode, number> = {
  WALKING: 0,
  BICYCLING: 0,
  TRANSIT: 60,    // bus + train 平均（urban transit）
  DRIVING: 192,   // 自駕油車（依 UK DEFRA 平均車輛）
  TAXI: 192,      // 與 DRIVE 同類
  FLIGHT: 285,    // 短中程客機
};

export function co2Grams(distanceM: number, mode: RouteOptionMode): number {
  const km = distanceM / 1000;
  return Math.round(km * (CO2_GRAMS_PER_KM[mode] ?? 100));
}
