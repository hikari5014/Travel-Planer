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
};
