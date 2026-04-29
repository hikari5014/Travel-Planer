// Shared types for all map panels (Google / Mapbox / OSM).
// Each panel takes the same props so EditorShell can swap them freely.

import type { MockDay } from "@/lib/mock-schedule";
import type { EditorPlace } from "@/lib/services/editor-loader";

export type MapPanelProps = {
  day: MockDay;
  places: Record<string, EditorPlace>;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  onBackgroundClick?: () => void;
  // Click on empty map area → fires with the lat/lng. Google panel may also
  // pass a `placeId` when the click landed on a labeled POI — the editor
  // then fetches that place directly (no fuzzy nearby search needed).
  onMapClick?: (lat: number, lng: number, placeId?: string) => void;
  // Fly the map to a coord; `ts` ensures repeated focus on the same point
  // still triggers (effect dep changes). Set by EditorShell when the user
  // double-clicks a list/week-view item.
  flyTo?: { lat: number; lng: number; ts: number } | null;
  // Phase 9c — polyline visibility + hover-from-list state.
  // If a transport id is `hoveredTransportId` we draw its line in bold
  // regardless of visibility mode. If visibility = "hidden" nothing draws.
  // If visibility = "always" all transports draw simultaneously.
  routeVisibility?: "always" | "hover" | "hidden";
  hoveredTransportId?: string | null;
};
