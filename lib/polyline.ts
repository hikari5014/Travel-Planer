// Shared client-side polyline helpers. The encoded polyline produced by
// Google's Routes API uses the standard "polyline algorithm" so any
// compliant decoder works. Used by Map panels (3 providers) to draw
// real-route lines for each Transport segment.

import { decode } from "@googlemaps/polyline-codec";

export type LatLng = { lat: number; lng: number };

export function decodePolylineToLatLng(encoded: string | null | undefined): LatLng[] {
  if (!encoded) return [];
  try {
    const pairs = decode(encoded, 5) as Array<[number, number]>;
    return pairs.map(([lat, lng]) => ({ lat, lng }));
  } catch {
    return [];
  }
}

// Map provider-agnostic polyline color per transport mode. Matches the
// Cal.com palette tokens.
export const ROUTE_COLOR: Record<string, string> = {
  DRIVING: "#3b82f6",   // brand-accent (blue)
  TRANSIT: "#a78bfa",   // badge-violet (purple)
  WALKING: "#34d399",   // badge-emerald (green)
  BICYCLING: "#fb923c", // badge-orange
  CUSTOM: "#a3a3a3",    // muted gray
  FLIGHT: "#0ea5e9",    // sky — distinct from brand-accent driving
};

// Visibility mode for trip route polylines.
export type RouteVisibility = "always" | "hover" | "hidden";

// Decide whether a given transport's polyline should be drawn given the
// current visibility mode + hover state.
export function shouldDrawPolyline(
  visibility: RouteVisibility,
  isHovered: boolean,
): boolean {
  if (visibility === "hidden") return false;
  if (visibility === "always") return true;
  return isHovered; // "hover"
}
