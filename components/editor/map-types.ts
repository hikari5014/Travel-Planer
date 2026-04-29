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
};
