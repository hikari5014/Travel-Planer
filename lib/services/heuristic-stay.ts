// Default stay-minutes heuristic — Phase 1a's stand-in for AI estimates.
// Phase 4 will optionally call an LLM to refine these per-place.

import type { PlaceIconKey } from "@/lib/place-icon";

export const STAY_MIN_BY_ICON: Record<PlaceIconKey, number> = {
  shrine: 45,
  temple: 90,
  landmark: 90,
  restaurant: 75,
  ramen: 45,
  cafe: 45,
  bar: 90,
  dessert: 30,
  lodging: 600,
  machiya: 60,
  park: 75,
  mountain: 120,
  shopping: 90,
  museum: 120,
  theater: 150,
  music: 180,
  station: 15,
  parking: 0,
  free: 60,
};

export function suggestStayMinutes(iconKey: PlaceIconKey): number {
  return STAY_MIN_BY_ICON[iconKey] ?? 60;
}
